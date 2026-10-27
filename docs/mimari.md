# Biga Panel: Mimari

Bu belge kod tabanını inceleyecek bir mühendis için yazılmıştır: dizin yapısı, istek akışı, sağlayıcı katmanı, mesaj hattı, oturum ve yetki tasarımı, veri modeli, canlı olaylar ve test yaklaşımı. API sözleşmesi [api.md](api.md), özelliklerin kullanıcı gözünden anlatımı [ozellikler.md](ozellikler.md), production kurulumu [deploy.md](deploy.md) dosyasındadır.

## Genel bakış

Biga Panel tek bir Bun sürecidir. Aynı süreç REST API'yi (Hono), canlı olay akışını (SSE), Web Push gönderimini, WhatsApp bağlantılarını (Baileys) ve derlenmiş React arayüzünü sunar. Kalıcı veri tek bir SQLite dosyasında (WAL modu), WhatsApp oturum anahtarları ise numara başına bir klasörde durur.

```
 Tarayıcı / PWA ──HTTP(JSON)──▶ Hono (/api/*) ──▶ modül rotaları ──▶ repository ──▶ SQLite
        ▲                           │                                   ▲
        │ SSE (/api/events)         └──▶ MessagingProvider ──▶ WhatsApp │
        │ Web Push                                │ (olaylar)           │
        └────── LiveHub ◀── MessageService ◀──────┘─────────────────────┘
```

## Dizin yapısı

```
src/
  index.ts              Bağımlılıkları kurar, sunucuyu başlatır, düzgün kapatır, oturumları yeniden bağlar
  app.ts                Hono uygulaması: hata eşleme, rotalar, statik arayüz ve SPA yönlendirmesi
  config/env.ts         Ortam değişkenleri (Zod şeması). process.env yalnızca burada okunur
  db/client.ts          SQLite bağlantısı, şema ve sürüm geçişleri (PRAGMA user_version)
  modules/
    auth/               Giriş, çıkış, /me, ekranına geç; requireUser ve requirePermission ara katmanları
    users/              Kullanıcı ve rol yönetimi (repository + rotalar)
    numbers/            Numara listesi, ekleme/silme/eşleştirme/QR/durum; numaranın sohbet listesi ve yeni sohbet
    chats/              Sohbet ayrıntısı, mesajlar, gönderim, okundu, atama, durum, etiket, notlar,
                        "şu an bakıyor" (viewers.ts), CSV dökümü, mesaj araması
    messages/           MessageService: mesajların tek giriş noktası (kaydet → yay → bildir)
    events/             LiveHub (events.hub.ts) ve SSE uç noktası
    push/               Web Push bildirici ve abonelik uç noktaları
    tags/               Etiketler
    quick-replies/      Hazır yanıtlar
    audit/              Etkinlik kaydı yazıcısı (audit.log.ts) ve sorgu/CSV uç noktaları
    reports/            Özet rapor ve cevap süresi hesabı
    dev/                Test numarasına sahte gelen mesaj (yalnızca test numaraları açıkken bağlanır)
  providers/
    routing.provider.ts Numaranın türüne göre doğru sağlayıcıya yönlendirir
    baileys.provider.ts Gerçek WhatsApp bağlantısı (Baileys)
    baileys.messages.ts Baileys mesajını panelde gösterilecek metne çevirir
    mock.provider.ts    WhatsApp'sız test sağlayıcısı
  shared/
    contracts.ts        Modüller arası arayüzler: MessagingProvider, MessageService, LiveHub, Notifier, AuditLog, AppDeps
    types.ts            Ortak tipler: SessionUser, NumberStatus, ChatRow, MessageRow, LiveEvent…
    permissions.ts      İzin kataloğu, alt küme kuralı, ekranına geçme izin hesabı
    access.ts           Numara erişim modeli (görme/yazma), canlı akış ve push hedefleri
    http.ts             HttpFailure ve yardımcılar (badRequest, forbidden, notFound, readJson, idParam)
    csv.ts              Excel uyumlu CSV üretimi
    phone.ts            Telefon normalizasyonu ve WhatsApp kimliği dönüşümleri
    sort.ts             Türkçe alfabetik sıralama
web/                    React + Vite arayüzü (PWA). Çıktı: web/dist
  src/api/              API istemcisi, TanStack Query sorguları ve önbellek güncellemeleri
  src/features/         Ekranlar (yönetim bölümleri, oturum bağlamı, canlı akış)
  src/lib/              Push aboneliği, tema, biçimlendirme
  src/sw.ts             Service worker: uygulama kabuğu önbelleği, push, bildirim tıklama
test/                   bun test paketleri ve ortak test kurulumu (helpers.ts)
scripts/                create-user.ts (kullanıcı ekleme), vapid.ts (VAPID anahtarı)
deploy/                 docker-compose.yml, Caddyfile, backup.sh, restore.md, quick-tunnel.md (ayrıntı: docs/deploy.md)
Dockerfile              Çok aşamalı imaj: arayüz derlemesi + production bağımlılıkları
```

Arayüz, sunucu tiplerini `@shared` takma adıyla doğrudan `src/shared` klasöründen kullanır (`web/vite.config.ts`). İzin anahtarları ve olay tipleri iki tarafta tek kaynaktan gelir.

## Bağımlılıkların kurulması

`src/index.ts` tüm bağımlılıkları açıkça kurar ve `createApp(deps)` fonksiyonuna verir. Modüller global durum kullanmaz. Her şey `AppDeps` (`env`, `db`, `logger`, `provider`, `hub`, `notifier`, `messages`, `audit`) üzerinden gelir. Testler aynı `createApp` fonksiyonunu bellek içi veritabanı ve test sağlayıcılarıyla kurar.

Açılış sırası: ortam doğrulanır → veritabanı açılır ve geçişler uygulanır → LiveHub, Notifier, MessageService kurulur → sağlayıcılar kurulur ve yönlendiriciye bağlanır → HTTP sunucusu başlar (`idleTimeout: 0`, SSE bağlantıları kendi ping'iyle canlı tutulur) → kayıtlı numaraların oturumları `provider.resume()` ile yeniden bağlanır. Kapanışta (SIGTERM/SIGINT) sırasıyla HTTP sunucusu, WhatsApp bağlantıları ve veritabanı kapatılır.

## İstek akışı

1. `Bun.serve` isteği Hono uygulamasına verir.
2. `/health` kimlik doğrulamasız `{ok:true}` döner. Tüm `/api/*` isteklerine önce iki ortak katman uygulanır:
   - **Gövde sınırı:** 1 MB (`hono/body-limit`), fazlası 413.
   - **CSRF:** GET/HEAD dışındaki istekler yalnızca `Sec-Fetch-Site` değeri `same-origin` ya da `none` ise kabul edilir. Başlık yoksa `Origin` ile `Host` (ya da `X-Forwarded-Host`) karşılaştırılır. Farklıysa 403.

   Ayrıca `readJson` gövdeli isteklerde `Content-Type: application/json` ister, değilse 415. `/api/auth/*` kendi rotalarında `requireUser` kullanır (giriş hariç).
3. Diğer tüm `/api/*` rotaları `requireUser` ara katmanının arkasındadır. Ara katman çerezdeki JWT'yi doğrular, kullanıcıyı **veritabanından** okur ve bağlama `user` (etkin kullanıcı) ile `actor` (ekranına geçen gerçek kişi ya da `null`) koyar.
4. Rota, isteği Zod şemasıyla doğrular, izinleri ve numara erişimini `shared/access.ts` ile denetler, repository üzerinden veritabanına gider. Gerekirse sağlayıcıyı çağırır, `audit()` ile etkinlik kaydı yazar ve LiveHub'a olay yayar.
5. Hatalar tek noktada JSON'a çevrilir (`app.onError`): `HttpFailure` kendi durum koduyla, `ProviderError` 502 ile, diğerleri günlüğe yazılıp 500 ile döner. Hata gövdesi her zaman `{ "error": "<Türkçe mesaj>" }` biçimindedir.
6. `/api` dışındaki yollar `STATIC_DIR` klasöründen sunulur. Bilinmeyen yollar `index.html`'e düşer (SPA). `sw.js` ve `index.html` `Cache-Control: no-cache` ile sunulur, yeni sürüm hemen gelir.

## Sağlayıcı katmanı

WhatsApp tarafı `MessagingProvider` arayüzünün (`src/shared/contracts.ts`) arkasındadır:

```ts
resume(sessions) · createSession(session) · requestPairingCode(session, phone) · getQr(session)
getStatus(session) · sendText(session, chatId, text) · exists(session, chatId) · deleteSession(session) · stop()
```

Oturum adı numaranın kimliğinden ve rastgele bir ekten türetilir (`n2-1a2b3c`; eski kayıtlarda `n1`) ve `numbers.session` sütununda durur. Ek gereklidir, çünkü SQLite silinen numaranın kimliğini yeni numaraya verebilir ve ek olmazsa yeni numara eski oturum klasörünü devralır. Sağlayıcılar gelen mesajları ve durum değişikliklerini, kurulurken verilen `onEvent` ile normalize edilmiş `InboundEvent` olarak bildirir.

**Yönlendirici (`routing.provider.ts`).** Uygulamanın gördüğü tek sağlayıcıdır. Her çağrıda oturumun numarasındaki `provider` sütununu (`baileys` | `mock`) okur ve çağrıyı ilgili sağlayıcıya iletir. Gerçek ve test numaraları bu sayede aynı panelde yan yana çalışır. Test sağlayıcısı kapalıysa (`ALLOW_MOCK`) test numarasına yapılan çağrı açıklayıcı bir `ProviderError` ile reddedilir.

**Baileys sağlayıcısı (`baileys.provider.ts`).** Her numara için tek bir soket tutar (eşzamanlı açılışlar aynı Promise'i bekler). Kimlik bilgileri `useMultiFileAuthState` ile `BAILEYS_AUTH_DIR/<oturum>` klasörüne yazılır. Öne çıkan davranışlar:

| Konu | Uygulama |
| --- | --- |
| Soket ayarları | `markOnlineOnConnect: false`, `syncFullHistory: false`, `emitOwnEvents: false`. `shouldSyncHistoryMessage` Baileys varsayılanındadır (FULL hariç tüm eşitleme türleri). Eşitlemeyi tamamen kapatmak Baileys'in ilk LID eşlemelerini almasını engeller, Baileys bunun için açılışta uyarı verir |
| Geçmiş ve rehber | `messaging-history.set` (yalnızca ilk eşleştirmede gelir) → rehber adları `contacts`, mesajlar `history` olayı olarak. `contacts.upsert` / `contacts.update` → `contacts` olayı. Rehberden yalnızca kayıtlı ad (`name`) alınır |
| Gönderim sırası | Numara başına Promise zinciri. İki gönderim arası en az 3 sn + 0–2 sn rastgele. Gönderim öncesi `composing` → 800 ms + uzunluğa göre en fazla 1,5 sn → `paused` |
| Kısıtlama (463) | `messages.update` içinde 463 hata kodu görülünce oturum 24 saat `RESTRICTED` olur ve `sendText` açıklayıcı bir hatayla reddeder. Süre oturum klasörüne (`panel-restricted.json`) yazılır, sunucu yeniden başlasa da sürer. Süre dolunca durum `WORKING`'e döner |
| Bağlantı kopması | `loggedOut` → oturum klasörü silinir, `FAILED`. `connectionReplaced` (440) → `STOPPED`, yeniden deneme yok. `forbidden` (403) → `FAILED`, yeniden deneme yok. `restartRequired` → hemen yeniden açılır. Diğerleri → üstel geri çekilme (2 sn'den 60 sn'ye), en fazla 10 deneme, sonra `STOPPED` |
| Yeni sohbet | `exists()` → `sock.onWhatsApp()`. Rota, daha önce sohbeti olmayan numaraya göndermeden önce bunu çağırır |
| Kimlik çözümleme | Gruplar, yayın listeleri ve kanallar atlanır. LID kimlikleri `remoteJidAlt` ya da LID eşlemesiyle telefon numaralı kimliğe çevrilir |
| Yeniden gönderim | Son 500 giden mesajın içeriği bellekte tutulur (`getMessage`). Karşı taraf şifre çözemezse WhatsApp yeniden isteyebilir |
| Silme | Bağlıysa `logout()` (telefondaki Bağlı cihazlar listesinden çıkar), ardından oturum klasörü silinir |

`baileys.messages.ts` gelen içeriği metne çevirir. Medya için `[Fotoğraf]`, `[Video]`, `[Ses kaydı]`, `[Belge]`, `[Çıkartma]`, `[Konum]`, `[Kişi kartı]`, `[Anket]` etiketleri, tanınmayan türler için `[Desteklenmeyen mesaj]` kullanılır. Tepki ve protokol mesajları gibi teknik türler `null` döner ve kaydedilmez. Medya indirilmez.

**Test sağlayıcısı (`mock.provider.ts`).** WhatsApp'a gitmez. Eşleştirme kodu `MOCK1234`'tür, numara `connectDelayMs` (varsayılan 1 sn) sonra `WORKING` olur. `sendText` rastgele bir sağlayıcı kimliği döner, `exists` her zaman `true` döner. Gelen mesaj taklidi `POST /api/dev/inbound` ile `MessageService`'e doğrudan verilir.

## Mesaj hattı

Tüm mesajlar tek bir giriş noktasından geçer: `src/modules/messages/messages.service.ts`.

```
Sağlayıcı olayı (InboundEvent)            Panelden gönderim (POST …/messages, POST …/chats)
        │                                          │ provider.sendText() başarılı
        ▼                                          ▼
 handleInbound(event)                      recordPanelSend({chatId, userId, asUserId, body, providerId})
        │                                          │
        ├─ kind=status → numbers.status güncellenir → LiveHub: number_status
        │
        ├─ kind=contacts → contacts tablosu + var olan sohbetlerin adı → değiştiyse LiveHub: chats_synced
        │
        ├─ kind=history → sohbet başına en yeni 5 mesaj, save(quiet): okunmamış/yeniden açma,
        │                 mesaj olayı ve push yok → bir şey kaydedildiyse LiveHub: chats_synced
        │
        └─ kind=message → chats.findOrCreate → save()
                                   │
                    messages INSERT OR IGNORE (provider_id UNIQUE: tekrar gelen olay atlanır)
                                   │
                    chats.touch: son mesaj (yalnızca daha yeniyse), okunmamış +1 (gelen ise),
                                 kapalı sohbet müşteri yazınca 'open'
                                   │
                    LiveHub.publish(numberId, {type:"message", chat, message})
                                   │
                    Notifier.notifyNumber(numberId, {title, body, url:"/?chat=<id>"}, except=gönderen)
```

Sohbet adı (`chats.findOrCreate`): `contacts` tablosundaki rehber adı → müşteri mesajındaki profil adı (`pushName`) → numara. Harf ya da rakam içermeyen adlar (`cleanName`, `shared/phone.ts`) yok sayılır. Okurken de (`toChat`) böyle bir ad kayıtlıysa numara döner. Rehber adı olan sohbetin adını profil adı ezmez.

Kaynak alanı: Baileys'te `fromMe` olmayan mesaj `contact`, `fromMe` olan mesaj `phone` olur. Panelden gönderilenler soketten ikinci kez gelmez (`emitOwnEvents: false`), `recordPanelSend` ile `panel` kaynağıyla, `sent_by` (gerçek kişi) ve `as_user` (ekranına geçilmişse adına yazılan kişi) alanlarıyla kaydedilir.

## Oturum, kimlik ve ekranına geçme

**Oturum çerezi.** Giriş başarılı olunca imzalı bir JWT `session` adlı çereze yazılır: `httpOnly`, `SameSite=Lax`, `Secure` (`COOKIE_SECURE` ile), 7 gün. Talepler (claims) yalnızca `{ uid, tv }` ya da ekranına geçilmişse `{ uid, as, tv }` içerir. İzinler çereze **yazılmaz**. `tv`, oturum açıldığı andaki `users.token_version` değeridir. Şifre değişince bu sayı artar ve o kullanıcının eski çerezleri geçersiz olur. Kendi şifresini değiştiren kullanıcıya yeni sürümle çerez yeniden yazılır, o oturumda kalır.

**Giriş.** `POST /api/auth/login` hatalı denemeleri bellekte iki katmanda sayar (`login-limiter.ts`): kullanıcı adı + IP için 5 hatada 5 dakika, IP için 15 dakikada 20 hatada 15 dakika kilit (429). Başarılı giriş yalnızca kullanıcı adı + IP sayacını sıfırlar, IP sayacını sıfırlamaz. İstemci adresi `TRUST_PROXY` açıksa `X-Forwarded-For`'un son değerinden (Caddy'nin eklediği), değilse bağlantıdan okunur. Hatalı deneme kaydında adres de yazar. Var olmayan kullanıcıda da sabit bir sahte hash'e karşı şifre doğrulaması yapılır, yanıt süresi kullanıcının varlığını ele vermez. Kullanıcı adı en fazla 80, şifre en fazla 200 karakter olabilir. Hatalı denemeler etkinlik kaydına 40 karaktere kısaltılmış kullanıcı adıyla yazılır.

**İzinler her istekte yüklenir.** `requireUser` her istekte `resolveSession` ile `users` ve `roles` tablolarından kullanıcıyı ve rolün izinlerini okur, `token_version` eşleşmesini denetler. Silinen, devre dışı bırakılan ya da şifresi değişen kullanıcının eski oturumu bir sonraki istekte 401 alır. Aynı çözümleyici bağlama `resolve` olarak konur ve canlı akış onu her olayda yeniden çağırır. Rol ya da izin değişikliği yeniden giriş gerektirmeden etkili olur.

**Ekranına geçme.** Çerezde `as` varsa ara katman her istekte şunu yeniden denetler:

```
canImpersonate(actor, target) =
  actor.id ≠ target.id  ∧  "impersonate.view" ∈ actor.permissions  ∧  target.permissions ⊆ actor.permissions
```

Kural sağlanıyorsa `user` = hedef kullanıcı (izinleri kısıtlanmış haliyle), `actor` = gerçek kişi olur. Sağlanmıyorsa (hedef silindi, izin kalktı) istek sessizce kişinin kendi hesabıyla devam eder.

**Etkin izinler** (`impersonatedPermissions`, `src/shared/permissions.ts`):

```
etkin = hedef.izinler ∩ actor.izinler − { users.manage, impersonate.view, impersonate.send }
izleme modu (actor'da impersonate.send yok):  etkin ∩ { numbers.view_all, audit.view, reports.view }
```

İzleme modunda hiçbir değişiklik izni kalmaz. Mesaj, sohbet başlatma, atama, numara/etiket/hazır yanıt yönetimi ve dışa aktarma kapalıdır.

**Numara erişimi de kesişimdir.** `asImpersonated`, etkin kullanıcıyı `limitToActor` ile gerçek kişiye bağlar. `numberAccessMap` bu durumda hedefin erişim haritasını gerçek kişinin haritasıyla keser. Yalnızca ikisinin de gördüğü numaralar kalır ve seviye ikisinin düşüğüdür (`write` ancak ikisinde de `write` ise).

**Alt küme kuralı.** Aynı `isSubset` kuralı kullanıcı ve rol yönetiminde de uygulanır. Kimse sahip olmadığı bir izni bir role ekleyemez, kendinden yetkili bir rolü veremez ya da kendinden yetkili bir kullanıcıyı düzenleyemez. Ekranına geçme yoluyla da yetki kazanılamaz.

**Geçiş sırasındaki ek kurallar:** okundu işareti uygulanmaz, "şu an bakıyor" kaydı yapılmaz (`chats.routes.ts`). Push aboneliği açılamaz (`push.routes.ts`, 403). İzleme modunda not eklenemez ve silinemez. Yeni bir geçiş isteği her zaman gerçek kişi (`actor`) adına değerlendirilir, iç içe geçiş oluşmaz.

**Yetki dağıtma sınırı** (`users.routes.ts`): `users.manage` sahibi kendinde olmayan bir izni role veremez ve kendinden yetkili bir rolü atayamaz. `numbers.view_all` izni yoksa kendi erişiminden fazlasını (görmediği numara ya da yalnızca okuduğu numarada yazma) kimseye veremez ve kendi numara erişimini değiştiremez (403). Kendi erişmediği bir numaraya erişimi olan kullanıcıyı da yönetemez (`coversUser`): yoksa onun şifresini sıfırlayıp o numaraya ulaşabilirdi. Numara yönetimi (eşleştir, QR, yenile, sil, sahte gelen mesaj) de yalnızca görülebilen numaralarda çalışır, diğerlerinde 404 döner.

**Kim yaptı.** `whoFrom(c)` her istekte `{ actor, asUser }` çiftini verir. Mesaj kaydı (`sent_by`, `as_user`), not kaydı (`user_name`, `as_user_name`) ve etkinlik kaydı (`actor_*`, `as_user_*`) bu çifti kullanır.

## Erişim modeli (`src/shared/access.ts`)

Numara erişiminin tek kaynağıdır. Rotalar, canlı akış ve push aynı fonksiyonları kullanır.

| Fonksiyon | Davranış |
| --- | --- |
| `numberAccessMap(db, user)` | Kullanıcının görebildiği numaralar ve seviyeleri. `numbers.view_all` varsa tüm numaralar (`messages.send` varsa `write`, yoksa `read`). Yoksa `user_numbers` atamaları. Ekranına geçilmişse sonuç gerçek kişinin haritasıyla kesilir |
| `limitToActor(user, actor)` | Etkin kullanıcıyı gerçek kişiye bağlar. Erişim hesapları kesişimi bu bağ üzerinden uygular |
| `accessTo(db, user, numberId)` | Tek numara için `read` / `write` / `null` (göremez) |
| `canSeeNumber`, `canWriteNumber` | Yukarıdakinin kısayolları |
| `viewersOfNumber(db, numberId)` | Numarayı görebilen **aktif** kullanıcılar: atanmış olanlar ve rolünde `numbers.view_all` olanlar. LiveHub ve Notifier hedefleri |

Etkin yazma kuralı: atanmış seviye `write` olsa bile kullanıcıda `messages.send` yoksa `read` sayılır. Görülemeyen numara ve sohbetler için rotalar 403 yerine **404** döner, kaynağın varlığı sızmaz.

## Veri modeli

SQLite, `bun:sqlite` ile `strict` modda açılır. `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = ON`.

| Tablo | Amaç | Önemli sütunlar |
| --- | --- | --- |
| `roles` | Roller | `name` (tekil), `permissions` (JSON dizi, `["*"]` = hepsi), `system` |
| `users` | Kullanıcılar | `username` (tekil), `password_hash`, `role_id`, `active`, `last_login_at`, `token_version` |
| `numbers` | WhatsApp numaraları | `label`, `phone`, `provider` (`baileys`/`mock`), `session` (tekil), `status`, `me_id` |
| `user_numbers` | Numara erişimi | `(user_id, number_id)` birincil anahtar, `access` (`read`/`write`) |
| `chats` | Sohbetler | `(number_id, remote_id)` tekil, `name`, `last_text`, `last_message_at`, `unread`, `assigned_to`, `status` (`open`/`closed`) |
| `messages` | Mesajlar | `provider_id` (tekil, tekrar koruması), `direction`, `source` (`contact`/`phone`/`panel`), `sent_by`, `as_user`, `body`, `ts` |
| `tags` | Etiketler | `name` (tekil, büyük/küçük harf duyarsız), `color` |
| `chat_tags` | Sohbet–etiket ilişkisi | `(chat_id, tag_id)` |
| `chat_notes` | Ekip içi notlar | `user_id`, `user_name`, `as_user_name`, `body`, `ts` |
| `quick_replies` | Hazır yanıtlar | `title`, `body`, `created_by` |
| `audit_log` | Etkinlik kaydı | `actor_id`, `actor_name`, `as_user_id`, `as_user_name`, `action`, `target`, `detail`, `ts` |
| `push_subscriptions` | Web Push abonelikleri | `endpoint` (birincil anahtar), `user_id`, `p256dh`, `auth` |
| `contacts` | Telefon rehberindeki adlar | `(number_id, remote_id)` birincil anahtar, `name` |

Silme davranışı yabancı anahtarlarla tanımlıdır. Numara silinince sohbetleri, mesajları, notları ve atamaları gider (`CASCADE`). Kullanıcı silinince mesajlardaki `sent_by`/`as_user` ve sohbetlerdeki `assigned_to` `NULL` olur (`SET NULL`), erişimleri ve push abonelikleri gider.

### Şema sürümleri

Şema sürümü `PRAGMA user_version` ile tutulur. Açılışta eksik adımlar tek bir işlem (transaction) içinde sırayla uygulanır. Tablo yeniden kurulumları için işlem süresince yabancı anahtar denetimi kapatılır, ardından `PRAGMA foreign_key_check` ile bütünlük doğrulanır. Güncel sürüm **7**'dir.

| Sürüm | İçerik |
| --- | --- |
| 1 | İlk şema: kullanıcılar (sabit rollerle), numaralar, erişim, sohbetler, mesajlar, push abonelikleri |
| 2 | `roles` tablosu ve varsayılan üç rol; kullanıcıların `role_id`'ye taşınması; hesap durumu ve son giriş; numara başına `read`/`write`; mesajlarda `as_user`; sohbet atama; `audit_log`; `quick_replies` |
| 3 | Sohbet durumu (`open`/`closed`), `tags`, `chat_tags`, `chat_notes` |
| 4 | Numara türü (`numbers.provider`: `baileys`/`mock`) |
| 5 | `users.token_version`: şifre değişince o kullanıcının eski oturumları düşer |
| 6 | `contacts`: numara başına telefon rehberindeki kişi adları |
| 7 | `audit_log.number_id`: etkinlik kaydı numara erişimine göre süzülür |

## Canlı olaylar

`LiveHub` (`events.hub.ts`) kullanıcı kimliğine göre açık SSE bağlantılarını tutar.

- `publish(numberId, event)`: olayı yalnızca `viewersOfNumber` kümesindeki kullanıcıların bağlantılarına iletir. Hedefler her olayda veritabanından hesaplanır.
- `broadcast(event)`: numaradan bağımsız olaylar (`tags_changed`) için tüm bağlantılara.
- `GET /api/events`: `data: <LiveEvent JSON>` biçiminde adsız SSE mesajları, 25 sn'de bir yorum satırı ping.
- Her abonelik bir `allow` denetimi taşır. Olay iletilmeden önce oturum `resolve()` ile yeniden çözülür ve numara erişimi denetlenir. Oturum geçersizse (hesap kapatıldı, şifre değişti, geçiş izni kalktı) akış veri göndermeden kapanır. Aynı denetim her ping'de de yapılır.

Olay tipleri (`LiveEvent`, `src/shared/types.ts`): `message`, `chat_updated`, `note`, `note_deleted`, `viewers`, `tags_changed`, `chats_synced`, `number_status`. Arayüz bu olayları TanStack Query önbelleğine doğrudan yazar (`web/src/features/app/live.ts`, `web/src/api/cache.ts`).

"Şu an bakıyor" listesi (`chats/viewers.ts`) bellekte tutulur. İstemci 20 sn'de bir `POST /api/chats/:id/viewing` gönderir, 45 sn sessiz kalan kayıt 15 sn'lik taramada düşer ve değişiklik `viewers` olayıyla yayılır. Bu bilgi anlıktır ve sunucu yeniden başlayınca sıfırlanır.

**Web Push** (`push.notifier.ts`): VAPID anahtarları tanımlıysa etkindir. Hedef `viewersOfNumber` kümesidir, panelden gönderen kullanıcı hariç tutulur. Bildirim TTL'i 1 saattir. Push servisinden 404/410 dönen abonelik silinir. Abonelik yalnızca bilinen tarayıcı push servislerinin (FCM, Mozilla, Apple, Windows) HTTPS adreslerine kabul edilir. Alan uzunlukları sınırlıdır. Ekranına geçilmişken abonelik açılamaz. Service worker (`web/src/sw.ts`) bildirimi gösterir ve tıklamada açık bir pencereyi öne getirip `url`'e (`/?chat=<id>`) yönlendirir.

## Test yaklaşımı

Testler `bun test` ile çalışır. Her test `test/helpers.ts` içindeki `setup()` ile kendi ortamını kurar:

- `DATABASE_PATH=":memory:"` ile bellek içi SQLite (gerçek şema ve geçişler dahil).
- İki ayrı test sağlayıcısı örneği yönlendiriciye `baileys` ve `mock` olarak bağlanır. "Gerçek" taraftaki gönderimler ayrıca kaydedilir, yönlendirmenin doğru sağlayıcıya gittiği doğrulanır.
- Push bildirici bellekte toplanan bir sahteyle değiştirilir. Testler bildirim hedeflerini ve "gönderene gitmez" kuralını denetler.
- Uygulama gerçek `createApp` ile kurulur. İstekler `app.request()` ile çerez saklayan bir istemciyle gönderilir (HTTP sunucusu açılmaz).

Güncel durum: **6 dosyada 41 test, 397 doğrulama** (`expect`).

| Dosya | Kapsam |
| --- | --- |
| `test/api.test.ts` | Giriş (hatalı şifre 401 ve kayda geçmesi, çerezsiz 401, devre dışı hesabın girememesi ve açık oturumunun düşmesi); numara ekleme, eşleştirme, gelen/giden mesaj; tekrar gelen olayın tek kaydı, geç gelen mesajın son mesajı ezmemesi, sayfalama; numara erişimi (yok/okuma/yazma ve `numbers.view_all`); arama, atama, hazır yanıt, rapor |
| `test/features.test.ts` | Sohbet durumu (kapatma, filtre, müşteri yazınca yeniden açılma); etiketler (yönetim, sohbete takma, filtre, silinince sohbetten kalkma); notlar (ekleme, okuma, silme kuralları, izleme modu); "şu an bakıyor" (liste, olay, ekranına geçenin sayılmaması); cevap süresi ve CSV; gerçek ve test numarasının yan yana çalışması, sahte mesajın yalnızca test numarasına kabulü |
| `test/rbac.test.ts` | Ekranına geç (hedefin gördüğünü görme ve adına yazma; yalnızca izleme izniyle gönderememe; izinsiz ya da daha yetkili kullanıcıya geçilememesi; izin kalkınca geçişin düşmesi); kullanıcı ve rol yönetimi koruma kuralları (kendi rolünü değiştirememe, son Patron koruması, sistem rolü, kendinden yetkili rol/kullanıcı, kullanıcısı olan rolün silinememesi, 13 izinlik katalog); sürüm 1 veritabanının güncel modele taşınması |
| `test/security.test.ts` | Ekranına geçmede numara erişiminin gerçek kişiyle sınırlanması (göremediği numarayı görememe, ortak numarada düşük seviye); hesap kapatılınca canlı akışın veri göndermemesi; geçişteyken push açılamaması, bilinmeyen push servisinin reddi; yetki dağıtma sınırı (kendinde olmayan numara erişimini verememe, kendi erişimini değiştirememe); izleme modunda yönetim işlemlerinin kapalı olması; 415, 403 (CSRF), 413; kullanıcı adı + IP ve IP başına giriş sınırı, `TRUST_PROXY` kapalıyken başlığın yok sayılması; numara yönetimi ve kullanıcı yönetiminin numara erişimiyle sınırlanması; etkinlik kaydının numaraya göre süzülmesi; şifre değişince diğer oturumların düşmesi; virgüllü CSV hücreleri |
| `test/history.test.ts` | Kişi adları (anlamsız profil adında numara, rehber adının önceliği ve sonradan gelmesi); geçmiş eşitlemesi (sohbet başına son 5 mesaj, okunmamış/bildirim/mesaj olayı yok, tek `chats_synced`, tekrar gelen paketin etkisizliği, kapalı sohbetin açılmaması) |
| `test/baileys.messages.test.ts` | Baileys mesajının metne çevrilmesi (metin, medya etiketleri, teknik türler) ve zaman damgası dönüşümü |

Ek denetimler: `bun run typecheck` (sunucu, betikler, testler) ve `bun run web:typecheck` (arayüz ve service worker).

**Gerçek numarayla doğrulama.** Otomatik testler sağlayıcıyı taklit eder. Baileys katmanı bu yüzden ayrıca gerçek bir numarayla denendi (28 Ekim 2026). Eşleştirme kodu, `messaging-history.set` ile gelen son sohbetler (3 parça, 96 sohbet), `contacts` ile gelen 267 rehber adı, LID kimlikli bir kişinin telefon numarasına eşlenmesi, canlı gelen mesaj ve panelden gönderim beklendiği gibi çalıştı. Bu deneme iki hatayı da ortaya çıkardı ve ikisi düzeltildi. Birincisi, silinen numaranın oturum klasörü aynı kimliği alan yeni numaraya geçiyordu; oturum adına artık rastgele bir ek konuyor. İkincisi, fazla haneli Türkiye numaraları kabul ediliyordu; artık 12 hane şartı var. Sağlayıcı soyutlamasının değeri burada görüldü. Geçmiş eşitlemesi ve kişi adları gerçek numarada doğrulandıktan sonra aynı davranışlar WhatsApp'a ihtiyaç duymayan testlere dönüştürüldü (`test/history.test.ts`).

## Tasarım ilkeleri

- **Yetkinin tek kaynağı sunucudur.** Arayüz, kullanıcının etkin izinlerine bakarak yalnızca uygun düğmeleri gösterir. Her karar yine de sunucuda, her istekte, veritabanındaki güncel rol ve atamalarla verilir.
- **Çerezde yetki yok.** JWT yalnızca kimlik taşır (`uid`, `as`). İzinler her istekte yüklenir, değişiklikler anında etkili olur ve iptal için ayrı bir oturum listesi gerekmez.
- **Varlık bilgisi sızmaz.** Görülemeyen numara ya da sohbet için 404 döner. Girişte var olmayan kullanıcı adı da aynı yanıtı alır, yanıt süresi de aynıdır.
- **Yetki büyümez.** Rol, izin ve numara erişimi yalnızca dağıtanın sahip olduğu ölçüde verilebilir. Ekranına geçmede izinler ve numara erişimi kesişimdir.
- **Uzun ömürlü bağlantılarda da denetim.** SSE akışı yetkiyi yalnızca açılışta değil, her olayda denetler.
- **Ortak giriş korumaları.** JSON zorunluluğu, gövde sınırı ve kaynak (CSRF) denetimi tüm API'ye tek noktadan uygulanır.
- **Tek giriş noktası.** Mesajlar yalnızca `MessageService` üzerinden kaydedilir, yayılır ve bildirilir. Kaynak (`contact`/`phone`/`panel`) ve gönderen her zaman bellidir.
- **Denetim adları kalıcıdır.** Etkinlik kaydı ve notlar kişi adlarını kimliğin yanında saklar. Kullanıcı silinse de geçmiş okunur kalır.
- **Sağlayıcıdan bağımsız çekirdek.** Uygulama yalnızca `MessagingProvider` arayüzünü bilir. Gerçek ve test numaraları aynı kod yolunu kullanır, testler WhatsApp'a ihtiyaç duymaz.
- **Açık bağımlılıklar.** Ortam yalnızca `config/env.ts` içinde okunur. Tüm bağımlılıklar `AppDeps` ile verilir. Modüller arası sözleşmeler `shared/contracts.ts` ve `shared/types.ts` içindedir.
- **İdempotent olay işleme.** `provider_id` tekilliği, sırası bozuk gelen olaylara karşı korumalı "son mesaj" güncellemesi.
- **Güvenli dışa aktarma.** CSV'de formül enjeksiyonuna karşı hücre kaçışı, Türkçe Excel uyumu (BOM, `;`).
- **Türkçe öncelikli.** Tüm hata mesajları Türkçedir. Listeler Türkçe alfabeye göre sıralanır (`Intl.Collator("tr")`).
