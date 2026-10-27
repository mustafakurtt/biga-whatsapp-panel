# API sözleşmesi

Tüm yanıtlar JSON. Hata: `{ "error": "<Türkçe mesaj>" }` ve uygun durum kodu (400, 401, 403, 404, 413, 415, 429, 502).

**İstek kuralları:**
- Gövdeli istekler `Content-Type: application/json` göndermelidir, yoksa 415 döner.
- API gövdesi en fazla 1 MB olabilir, fazlası 413 döner.
- Durum değiştiren istekler (GET/HEAD dışı) yalnızca panelin kendi sayfasından kabul edilir. Tarayıcının `Sec-Fetch-Site` başlığı `same-origin` ya da `none` olmalıdır. Bu başlık yoksa `Origin`, `Host` ile aynı olmalıdır. Aksi halde 403 döner (CSRF koruması).
Kimlik: `POST /api/auth/login` httpOnly `session` çerezi koyar; sonraki istekler çerezle gelir.
- Aynı kullanıcı adı ve IP adresiyle art arda 5 hatalı giriş 5 dakikalık kilide yol açar (429). Aynı IP'den 15 dakikada 20 hatalı giriş o adresi 15 dakika engeller. Başka adresten gelen denemeler gerçek kullanıcıyı kilitlemez.
- Kullanıcının şifresi değişince o kullanıcının diğer tüm oturumları düşer (401). Kendi şifresini değiştiren kişinin çerezi yenilenir, o oturumda kalır.
WhatsApp tarafı Baileys ile çalışır (her numara sunucuya bağlı cihaz olarak eklenir). WhatsApp hatası 502 döner.
Görülemeyen numara ya da sohbet için 404 döner (var olduğu bilgisi sızmasın).
Tüm zamanlar milisaniye (Unix epoch).

## Yetki modeli

**Roller** yönetim ekranından oluşturulur; her rol bir izin listesidir. `Patron` sistem rolüdür: tüm izinler, değiştirilemez, silinemez.
Kurulumda üç rol gelir: `Patron` (hepsi), `Temsilci` (`messages.send`, `chats.start`), `Salt okunur` (izin yok).

| İzin | Anlamı |
| --- | --- |
| `numbers.view_all` | Atama olmadan tüm numaraları görür |
| `numbers.manage` | Numara ekler; görebildiği numaraları siler, bağlar, yeniler. Eklediği numaraya yazma erişimi kendiliğinden verilir |
| `messages.send` | Yazma erişimi olan numaralarda mesaj gönderir |
| `chats.start` | Yeni sohbet başlatır |
| `chats.assign` | Sohbeti başkasına atar (kendine üstlenmek için yazma erişimi yeter) |
| `users.manage` | Kullanıcıları ve rolleri yönetir |
| `impersonate.view` | Başka kullanıcının ekranına geçer (izler) |
| `impersonate.send` | Başkasının ekranındayken mesaj gönderir |
| `audit.view` | Etkinlik kaydını görür |
| `reports.view` | Raporları görür |
| `quick_replies.manage` | Hazır yanıtları ekler/düzenler/siler |
| `tags.manage` | Etiketleri ekler/düzenler/siler (sohbete etiket takmak için yazma erişimi yeter) |
| `data.export` | Sohbet dökümünü ve etkinlik kaydını CSV olarak indirir |

**Numara erişimi** (kullanıcı başına, numara başına): `none` (atanmamış: göremez) · `read` (okur) · `write` (okur ve yazar).
- `numbers.view_all` olan kullanıcı tüm numaraları görür.
- Etkin erişim: `write` sadece kullanıcıda `messages.send` varsa geçerlidir, yoksa `read` sayılır.

**Hesap durumu:** `active=false` olan kullanıcı giriş yapamaz, açık oturumu da hemen düşer (401).

**Ekranına geç (impersonation):**
- Gereken izin: `impersonate.view`.
- Hedef kullanıcı aktif olmalı, siz olmamalı ve izinleri sizinkilerin alt kümesi olmalı (kimse geçerek yetki kazanamaz).
- Geçişten sonra tüm API hedef kullanıcının gözünden çalışır: aynı numaralar, aynı erişim.
- Etkin izinler = hedefin izinleri ∩ sizin izinleriniz; `users.manage` ve `impersonate.*` hiç yoktur.
- **Numara erişimi iki kişinin kesişimidir.** Hedefin göremediği numarayı görmezsiniz. Sizin kendi hesabınızla göremediğiniz numarayı da hedefin ekranından göremezsiniz. Ortak numaralarda erişim ikisinin düşüğüdür; `write` ancak ikisinde de `write` ise geçerlidir.
- **İzleme modu:** `impersonate.send` yoksa sadece okursunuz. Etkin izinlerden yalnızca `numbers.view_all`, `audit.view` ve `reports.view` kalır. Hiçbir değişiklik (mesaj, not, atama, etiket, numara/etiket/hazır yanıt yönetimi, dışa aktarma) yapılamaz ve tüm numaralar `read` görünür.
- Ekranına geçmişken push aboneliği açılamaz (403).
- Canlı akış her olayda oturumu yeniden denetler. Geçiş izni kalkar, hesabınız kapatılır ya da şifreniz değişirse akış veri göndermeyi bırakır ve kapanır.
- Bu modda gönderilen mesajda `sent_by` = siz, `as_user` = hedef kullanıcı. Etkinlik kaydına da ikisi birlikte yazılır.

**Yetki dağıtma sınırı:**
- `users.manage` sahibi kendinde olmayan bir izni role ya da kullanıcıya veremez.
- `numbers.view_all` yoksa, kendi erişmediği bir numaraya erişimi olan kullanıcıyı düzenleyemez, devre dışı bırakamaz, silemez, şifresini sıfırlayamaz (403).
- `numbers.view_all` yoksa kendi erişiminden fazlasını (görmediği numara ya da okuduğu numaraya yazma) kimseye veremez ve kendi numara erişimini değiştiremez (403).

## Nesneler

- `User` (oturum): `{id, username, name, roleId, roleName, permissions: string[]}`. `permissions` her zaman etkin izinlerdir.
- `Me`: `{user: User, actor: User | null}`. `actor` doluysa siz `actor`sunuz ve `user`ın ekranındasınız.
- `Number`: `{id, label, phone, provider: "baileys"|"mock", status, me_id, access: "read"|"write", unread}`.
  - `unread` tüm sohbetlerdeki okunmamış toplamıdır.
  - `provider`: `baileys` gerçek WhatsApp numarasıdır; `mock` test numarasıdır, mesajlar WhatsApp'a gitmez. İkisi aynı panelde yan yana durabilir.
- `ChatRow`: `{id, number_id, remote_id, name, last_text, last_message_at, unread, assigned_to, assigned_name, status: "open"|"closed", tags: number[]}`
  - `tags`: etiket kimlikleri; adı ve rengi `GET /api/tags`'ten gelir.
  - Kapalı sohbete müşteri yazarsa sohbet kendiliğinden `open` olur.
- `Tag`: `{id, name, color}`. `color` şunlardan biridir: `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink`.
- `Note`: `{id, chat_id, user_id, user_name, as_user_name, body, ts}`. Müşteri görmez, sadece ekip içidir.
- `Viewer`: `{id, name}`. Bir sohbete şu an bakan kullanıcıdır.
- `Message`: `{id, chat_id, provider_id, direction:"in"|"out", source:"contact"|"phone"|"panel", sent_by, sent_by_name, as_user, as_user_name, body, ts}`
- `ManagedUser`: `{id, username, name, roleId, roleName, active, lastLoginAt, numbers:[{numberId, access:"read"|"write"}]}`
- `Role`: `{id, name, permissions: string[], system: boolean, userCount}`

## Uç noktalar

| Yöntem | Yol | İzin | Gövde / sorgu | Yanıt |
| --- | --- | --- | --- | --- |
| POST | /api/auth/login | herkes | `{username,password}` | `Me` (devre dışı hesap: 403) |
| POST | /api/auth/logout | giriş yapmış | — | `{ok:true}` (oturum sunucuda da iptal edilir; aynı çerez bir daha kabul edilmez) |
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
| PUT | /api/users/:id | `users.manage` | `{name?,password?,roleId?,active?,numbers?}` | `{user: ManagedUser}` (kendi rolünüzü ve hesap durumunuzu değiştiremezsiniz; son aktif Patron korunur) |
| DELETE | /api/users/:id | `users.manage` | — | `{ok:true}` (kendinizi silemezsiniz) |
| GET | /api/numbers | giriş yapmış | — | `{numbers:[Number]}` (görebildikleri) |
| POST | /api/numbers | `numbers.manage` | `{label,phone,provider?}` (`provider` verilmezse sunucu varsayılanı; test numaraları kapalıysa `mock` 400) | `{number}` (WhatsApp oturumu da açılır) |
| POST | /api/numbers/:id/pair | `numbers.manage` + numarayı görme | — | `{code}` (8 haneli eşleştirme kodu; bağlıysa 400) |
| GET | /api/numbers/:id/qr | `numbers.manage` + numarayı görme | — | PNG resim (yedek bağlanma yolu) |
| POST | /api/numbers/:id/refresh | `numbers.manage` + numarayı görme | — | `{number}` |
| DELETE | /api/numbers/:id | `numbers.manage` + numarayı görme | — | `{ok:true}` |
| GET | /api/numbers/:id/chats | numarayı gören (en fazla 500 sohbet) | `?filter=all\|unread\|mine\|unassigned&status=open\|closed&tag=<id>&q=` | `{chats:[ChatRow]}` son mesaja göre yeni→eski. `status` verilmezse hepsi gelir. `q`: ad, numara ya da son mesajda arar |
| POST | /api/numbers/:id/chats | `chats.start` + yazma erişimi | `{phone,text}` | `{chat}` yeni sohbet başlatır ve ilk mesajı gönderir (numara WhatsApp kullanmıyorsa 400) |
| GET | /api/chats/:id | sohbeti gören | — | `{chat}` |
| GET | /api/chats/:id/messages | sohbeti gören | `?before=<ts>` ops. | `{messages:[Message]}` eski→yeni, en fazla 100 |
| POST | /api/chats/:id/messages | `messages.send` + yazma erişimi | `{text}` | `{ok:true}` |
| POST | /api/chats/:id/read | sohbeti gören | — | `{ok:true}` okunmamış sayısı sıfırlanır (ekranına geçmişken etkisizdir) |
| PUT | /api/chats/:id/assign | yazma erişimi (kendine) / `chats.assign` (başkasına) | `{userId: number\|null}` | `{chat}` |
| PUT | /api/chats/:id/status | yazma erişimi | `{status:"open"\|"closed"}` | `{chat}` |
| PUT | /api/chats/:id/tags | yazma erişimi | `{tagIds:number[]}` | `{chat}` (etiket listesini tamamen değiştirir) |
| GET | /api/chats/:id/notes | sohbeti gören | — | `{notes:[Note]}` eski→yeni |
| POST | /api/chats/:id/notes | sohbeti gören (izleme modunda olmayan) | `{text}` | `{note}` |
| DELETE | /api/chats/:id/notes/:noteId | notu yazan ya da `users.manage` | — | `{ok:true}` |
| POST | /api/chats/:id/viewing | sohbeti gören | — | `{viewers:[Viewer]}`. Sohbet açıkken 20 sn'de bir çağrılır; 45 sn çağrılmazsa bakan listesinden düşülür. Ekranına geçilmişken kaydedilmez, sadece listeyi döner |
| GET | /api/chats/:id/export | `data.export` + sohbeti gören | — | `text/csv` sohbet dökümü (indirme) |
| GET | /api/tags | giriş yapmış | — | `{tags:[Tag]}` |
| POST | /api/tags | `tags.manage` | `{name,color}` | `{tag}` |
| PUT | /api/tags/:id | `tags.manage` | `{name?,color?}` | `{tag}` |
| DELETE | /api/tags/:id | `tags.manage` | — | `{ok:true}` (sohbetlerden de kalkar) |
| GET | /api/search | giriş yapmış | `?q=` (en az 2 karakter) | `{results:[{chat: ChatRow, message: Message, numberLabel}]}` görülebilir numaralarda mesaj araması, en yeni 50 |
| GET | /api/quick-replies | giriş yapmış | — | `{items:[{id,title,body}]}` |
| POST | /api/quick-replies | `quick_replies.manage` | `{title,body}` | `{item}` |
| PUT | /api/quick-replies/:id | `quick_replies.manage` | `{title?,body?}` | `{item}` |
| DELETE | /api/quick-replies/:id | `quick_replies.manage` | — | `{ok:true}` |
| GET | /api/audit | `audit.view` | `?before=<id>&userId=&action=` | `{entries:[AuditEntry]}` yeni→eski, en fazla 100 |
| GET | /api/audit/export | `audit.view` + `data.export` | `?userId=&action=` | `text/csv` (en fazla 10.000 kayıt) |
| GET | /api/reports/summary | `reports.view` | `?days=7` (1–90) | `Summary` |
| GET | /api/events | giriş yapmış | — | SSE akışı; her olay `data: <LiveEvent JSON>` |
| GET | /api/push/key | giriş yapmış | — | `{publicKey}` (boşsa push kapalı) |
| POST | /api/push/subscribe | giriş yapmış (ekranına geçmişken 403) | PushSubscription JSON | `{ok:true}` (endpoint bilinen bir tarayıcı push servisinde olmalı: FCM, Mozilla, Apple, Windows) |
| POST | /api/push/unsubscribe | giriş yapmış | `{endpoint}` | `{ok:true}` (endpoint kimin adına kayıtlı olursa olsun silinir) |
| GET | /api/config | giriş yapmış | — | `{mockAllowed, defaultProvider, pushEnabled}` |
| POST | /api/dev/inbound | `numbers.manage` + numarayı görme, test numaraları açıkken | `{numberId,from,name,text}` | `{ok:true}` test numarasına sahte gelen mesaj (gerçek numaraya 400) |

`AuditEntry`: `{id, ts, actor_id, actor_name, as_user_id, as_user_name, action, target, detail, number_id}`. `number_id` numarayla ilgili kayıtlarda doludur. `numbers.view_all` izni olmayan kişi yalnızca görebildiği numaraların kayıtlarını ve numarasız kayıtları görür.
- `action` şunlardan biridir: `auth.login`, `auth.login_failed`, `auth.logout`, `impersonate.start`, `impersonate.stop`, `message.send`, `chat.start`, `chat.assign`, `chat.status`, `chat.tags`, `chat.export`, `note.create`, `note.delete`, `tag.create`, `tag.update`, `tag.delete`, `audit.export`, `number.create`, `number.delete`, `number.pair`, `user.create`, `user.update`, `user.delete`, `role.create`, `role.update`, `role.delete`, `quick_reply.create`, `quick_reply.update`, `quick_reply.delete`.
- `target` kısa bir açıklamadır (ör. `"Satış → Ayşe"`). `detail` metin ya da null.

`Summary`: `{days, totals:{incoming, outgoing, panel, phone, chats}, response:{averageMs, medianMs, samples}, daily:[{day:"YYYY-MM-DD", incoming, outgoing}], perNumber:[{numberId,label,incoming,outgoing}], perUser:[{userId,name,sent,replies,avgResponseMs}]}`. Sadece görülebilir numaraları kapsar.
- **Cevap süresi:** müşterinin cevapsız ilk mesajından, o sohbetteki ilk giden mesaja (panel ya da telefon) kadar geçen süre.
- `response` tüm cevapları kapsar. `perUser[].replies` ve `avgResponseMs` sadece o kullanıcının panelden verdiği ilk cevaplardır; cevabı yoksa `avgResponseMs` null olur.

`LiveEvent` (src/shared/types.ts):

- `{type:"message", numberId, chat, message}`: `message.source` = `contact` (müşteri), `phone` (telefondan), `panel` (panelden; `sent_by_name` dolu, ekranına geçilmişse `as_user_name` de dolu).
- `{type:"chat_updated", numberId, chat}`: atama, okundu, durum ya da etiket değişikliği.
- `{type:"note", numberId, chatId, note}` yeni not; `{type:"note_deleted", numberId, chatId, noteId}`.
- `{type:"viewers", numberId, chatId, viewers:[Viewer]}`: sohbete bakanlar değişti.
- `{type:"tags_changed"}`: etiket listesi değişti; `GET /api/tags` yeniden okunur.
- `{type:"chats_synced", numberId}`: geçmiş eşitlemesi ya da rehber adları numaranın sohbet listesini toplu değiştirdi; `GET /api/numbers/:id/chats` yeniden okunur.
- `{type:"number_status", numberId, status}`: `WORKING`, `SCAN_QR_CODE`, `FAILED`, `STOPPED`, `STARTING`, `RESTRICTED`.
  - `RESTRICTED`: WhatsApp hesabı kısıtladı (hata 463). Numara bağlı ve mesaj almaya devam eder, ama panelden gönderim 24 saat durdurulur; gönderim denemesi 502 döner.
  - `STOPPED` şu durumlarda da gelir: oturum başka bir yerde açıldı (440) ya da 10 yeniden bağlanma denemesi bitti.
  - `FAILED` şu durumlarda da gelir: WhatsApp bağlantıyı reddetti (403).

Push bildirimi: `{title, body, url}`; `url` = `/?chat=<chatId>`.
