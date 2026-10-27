# API sözleşmesi

Tüm yanıtlar JSON. Hata: `{ "error": "<Türkçe mesaj>" }` ve uygun durum kodu (400, 401, 403, 404, 502).
Kimlik: `POST /api/auth/login` httpOnly `session` çerezi koyar; sonraki istekler çerezle gelir.
WhatsApp tarafı Baileys ile çalışır (her numara sunucuya bağlı cihaz olarak eklenir). WhatsApp hatası 502 döner.
Görülemeyen numara ya da sohbet için 404 döner (var olduğu bilgisi sızmasın).
Tüm zamanlar milisaniye (Unix epoch).

## Yetki modeli

**Roller** yönetim ekranından oluşturulur; her rol bir izin listesidir. `Patron` sistem rolüdür: tüm izinler, değiştirilemez, silinemez.
Kurulumda üç rol gelir: `Patron` (hepsi), `Temsilci` (`messages.send`, `chats.start`), `Salt okunur` (izin yok).

| İzin | Anlamı |
| --- | --- |
| `numbers.view_all` | Atama olmadan tüm numaraları görür |
| `numbers.manage` | Numara ekler, siler, bağlar |
| `messages.send` | Yazma erişimi olan numaralarda mesaj gönderir |
| `chats.start` | Yeni sohbet başlatır |
| `chats.assign` | Sohbeti başkasına atar (kendine üstlenmek için yazma erişimi yeter) |
| `users.manage` | Kullanıcıları ve rolleri yönetir |
| `impersonate.view` | Başka kullanıcının ekranına geçer (izler) |
| `impersonate.send` | Başkasının ekranındayken mesaj gönderir |
| `audit.view` | Etkinlik kaydını görür |
| `reports.view` | Raporları görür |
| `quick_replies.manage` | Hazır yanıtları ekler/düzenler/siler |

**Numara erişimi** (kullanıcı başına, numara başına): `none` (atanmamış: göremez) · `read` (okur) · `write` (okur ve yazar).
- `numbers.view_all` olan kullanıcı tüm numaraları görür.
- Etkin erişim: `write` sadece kullanıcıda `messages.send` varsa geçerlidir, yoksa `read` sayılır.

**Hesap durumu:** `active=false` olan kullanıcı giriş yapamaz, açık oturumu da hemen düşer (401).

**Ekranına geç (impersonation):**
- Gereken izin: `impersonate.view`.
- Hedef kullanıcı aktif olmalı, siz olmamalı ve izinleri sizinkilerin alt kümesi olmalı (kimse geçerek yetki kazanamaz).
- Geçişten sonra tüm API hedef kullanıcının gözünden çalışır: aynı numaralar, aynı erişim.
- Etkin izinler = hedefin izinleri ∩ sizin izinleriniz; `users.manage` ve `impersonate.*` hiç yoktur.
- `impersonate.send` yoksa `messages.send`, `chats.start`, `chats.assign` da düşer. Yani sadece izlersiniz; tüm numaralar `read` görünür.
- Bu modda gönderilen mesajda `sent_by` = siz, `as_user` = hedef kullanıcı. Etkinlik kaydına da ikisi birlikte yazılır.

## Nesneler

- `User` (oturum): `{id, username, name, roleId, roleName, permissions: string[]}`. `permissions` her zaman etkin izinlerdir.
- `Me`: `{user: User, actor: User | null}`. `actor` doluysa siz `actor`sunuz ve `user`ın ekranındasınız.
- `Number`: `{id, label, phone, status, me_id, access: "read"|"write", unread}`. `unread` tüm sohbetlerdeki okunmamış toplamıdır.
- `ChatRow`: `{id, number_id, remote_id, name, last_text, last_message_at, unread, assigned_to, assigned_name}`
- `Message`: `{id, chat_id, provider_id, direction:"in"|"out", source:"contact"|"phone"|"panel", sent_by, sent_by_name, as_user, as_user_name, body, ts}`
- `ManagedUser`: `{id, username, name, roleId, roleName, active, lastLoginAt, numbers:[{numberId, access:"read"|"write"}]}`
- `Role`: `{id, name, permissions: string[], system: boolean, userCount}`

## Uç noktalar

| Yöntem | Yol | İzin | Gövde / sorgu | Yanıt |
| --- | --- | --- | --- | --- |
| POST | /api/auth/login | herkes | `{username,password}` | `Me` (devre dışı hesap: 403) |
| POST | /api/auth/logout | giriş yapmış | — | `{ok:true}` |
| GET | /api/auth/me | giriş yapmış | — | `Me` |
| GET | /api/auth/impersonate/targets | `impersonate.view` | — | `{users:[{id,username,name,roleName}]}` (geçilebilecekler) |
| POST | /api/auth/impersonate | `impersonate.view` | `{userId}` | `Me` |
| POST | /api/auth/impersonate/stop | ekranına geçmişken | — | `Me` |
| GET | /api/permissions | `users.manage` | — | `{permissions:[{key,label,group}]}` |
| GET | /api/roles | `users.manage` | — | `{roles:[Role]}` |
| POST | /api/roles | `users.manage` | `{name,permissions}` | `{role}` |
| PUT | /api/roles/:id | `users.manage` | `{name?,permissions?}` | `{role}` (sistem rolü: 400) |
| DELETE | /api/roles/:id | `users.manage` | — | `{ok:true}` (sistem rolü ya da kullanıcısı varsa 400) |
| GET | /api/users | `users.manage` | — | `{users:[ManagedUser]}` |
| POST | /api/users | `users.manage` | `{username,name,password,roleId,active?,numbers?}` | `{user: ManagedUser}` |
| PUT | /api/users/:id | `users.manage` | `{name?,password?,roleId?,active?,numbers?}` | `{user: ManagedUser}` (kendi hesabınızı devre dışı bırakamaz, Patron rolünüzü kaldıramazsınız) |
| DELETE | /api/users/:id | `users.manage` | — | `{ok:true}` (kendinizi silemezsiniz) |
| GET | /api/numbers | giriş yapmış | — | `{numbers:[Number]}` (görebildikleri) |
| POST | /api/numbers | `numbers.manage` | `{label,phone}` | `{number}` (WhatsApp oturumu da açılır) |
| POST | /api/numbers/:id/pair | `numbers.manage` | — | `{code}` (8 haneli eşleştirme kodu; bağlıysa 400) |
| GET | /api/numbers/:id/qr | `numbers.manage` | — | PNG resim (yedek bağlanma yolu) |
| POST | /api/numbers/:id/refresh | `numbers.manage` | — | `{number}` |
| DELETE | /api/numbers/:id | `numbers.manage` | — | `{ok:true}` |
| GET | /api/numbers/:id/chats | numarayı gören | `?filter=all\|unread\|mine\|unassigned&q=` | `{chats:[ChatRow]}` son mesaja göre yeni→eski. `q`: ad, numara ya da son mesajda arar |
| POST | /api/numbers/:id/chats | `chats.start` + yazma erişimi | `{phone,text}` | `{chat}` yeni sohbet başlatır ve ilk mesajı gönderir |
| GET | /api/chats/:id | sohbeti gören | — | `{chat}` |
| GET | /api/chats/:id/messages | sohbeti gören | `?before=<ts>` ops. | `{messages:[Message]}` eski→yeni, en fazla 100 |
| POST | /api/chats/:id/messages | `messages.send` + yazma erişimi | `{text}` | `{ok:true}` |
| POST | /api/chats/:id/read | sohbeti gören | — | `{ok:true}` okunmamış sayısı sıfırlanır (ekranına geçmişken etkisizdir) |
| PUT | /api/chats/:id/assign | yazma erişimi (kendine) / `chats.assign` (başkasına) | `{userId: number\|null}` | `{chat}` |
| GET | /api/search | giriş yapmış | `?q=` (en az 2 karakter) | `{results:[{chat: ChatRow, message: Message, numberLabel}]}` görülebilir numaralarda mesaj araması, en yeni 50 |
| GET | /api/quick-replies | giriş yapmış | — | `{items:[{id,title,body}]}` |
| POST | /api/quick-replies | `quick_replies.manage` | `{title,body}` | `{item}` |
| PUT | /api/quick-replies/:id | `quick_replies.manage` | `{title?,body?}` | `{item}` |
| DELETE | /api/quick-replies/:id | `quick_replies.manage` | — | `{ok:true}` |
| GET | /api/audit | `audit.view` | `?before=<id>&userId=&action=` | `{entries:[AuditEntry]}` yeni→eski, en fazla 100 |
| GET | /api/reports/summary | `reports.view` | `?days=7` (1–90) | `Summary` |
| GET | /api/events | giriş yapmış | — | SSE akışı; her olay `data: <LiveEvent JSON>` |
| GET | /api/push/key | giriş yapmış | — | `{publicKey}` (boşsa push kapalı) |
| POST | /api/push/subscribe | giriş yapmış | PushSubscription JSON | `{ok:true}` |
| POST | /api/push/unsubscribe | giriş yapmış | `{endpoint}` | `{ok:true}` |
| POST | /api/dev/inbound | `numbers.manage`, sadece PROVIDER=mock | `{numberId,from,name,text}` | `{ok:true}` sahte gelen mesaj |

`AuditEntry`: `{id, ts, actor_id, actor_name, as_user_id, as_user_name, action, target, detail}`.
- `action` şunlardan biridir: `auth.login`, `auth.login_failed`, `auth.logout`, `impersonate.start`, `impersonate.stop`, `message.send`, `chat.start`, `chat.assign`, `number.create`, `number.delete`, `number.pair`, `user.create`, `user.update`, `user.delete`, `role.create`, `role.update`, `role.delete`, `quick_reply.create`, `quick_reply.update`, `quick_reply.delete`.
- `target` kısa bir açıklamadır (ör. `"Satış → Ayşe"`). `detail` metin ya da null.

`Summary`: `{days, totals:{incoming, outgoing, panel, phone, chats}, daily:[{day:"YYYY-MM-DD", incoming, outgoing}], perNumber:[{numberId,label,incoming,outgoing}], perUser:[{userId,name,sent}]}`. Sadece görülebilir numaraları kapsar.

`LiveEvent` (src/shared/types.ts):

- `{type:"message", numberId, chat, message}`: `message.source` = `contact` (müşteri), `phone` (telefondan), `panel` (panelden; `sent_by_name` dolu, ekranına geçilmişse `as_user_name` de dolu).
- `{type:"chat_updated", numberId, chat}`: atama ya da okundu değişikliği.
- `{type:"number_status", numberId, status}`: `WORKING`, `SCAN_QR_CODE`, `FAILED`, `STOPPED`, `STARTING`.

Push bildirimi: `{title, body, url}`; `url` = `/?chat=<chatId>`.
