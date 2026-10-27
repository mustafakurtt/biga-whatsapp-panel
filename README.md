# Biga Panel

**Şirketin WhatsApp numaraları için ekip gelen kutusu.** Biga Panel, şirketin birden fazla WhatsApp numarasını tek bir web panelinde toplar. Ekip bu numaralara gelen mesajları ortak bir gelen kutusunda görür, yanıtlar, sohbetleri birbirine atar, etiketler ve ekip içi notlar bırakır. Her mesajın kim tarafından yazıldığı kayıt altındadır. Erişim; rol ve izinlerle, numara başına okuma/yazma seviyesiyle yönetilir. Yetkili kişiler bir ekip üyesinin ekranına geçip onun gördüğünü görebilir. Panel canlı çalışır (sayfa yenilemeden), telefona ve masaüstüne push bildirimi gönderir ve ana ekrana kurulabilen bir uygulama (PWA) olarak açılır.

---

## Öne çıkanlar

| Alan | Ne sağlar | Neden önemli |
| --- | --- | --- |
| **Ortak gelen kutusu** | Tüm numaralar tek panelde. Sohbet listesi, mesaj geçmişi, panelden yanıt, yeni sohbet başlatma | Müşteri mesajları tek bir telefona bağlı kalmaz, ekip birlikte çalışır |
| **"Kim kime ne yazdı"** | Her giden mesajda gönderen kullanıcı kayıtlıdır. Telefondan yazılan mesajlar da "Telefondan" olarak panele düşer | Müşteriye verilen her yanıtın sahibi bellidir |
| **Canlı akış** | Yeni mesaj, atama, etiket, not ve numara durumu anında tüm ilgili ekranlara yansır (SSE) | Kimse sayfayı yenilemek zorunda kalmaz, aynı sohbete iki kişi birden cevap vermez |
| **Push bildirimleri ve PWA** | Sekme kapalıyken bile bildirim. Bildirime dokununca ilgili sohbet açılır. Ana ekrana kurulur | Mesajlar kaçmaz, panel mobil uygulama gibi kullanılır |
| **Ekip çalışması** | Sohbet atama, Benim/Atanmamış/Okunmamış filtreleri, açık/kapalı durumu, renkli etiketler, ekip içi notlar, hazır yanıtlar, "şu an bakıyor" göstergesi, mesaj araması | İş bölümü netleşir, tekrar eden yanıtlar hızlanır |
| **Roller ve izinler** | 13 ayrı izinden özel roller. Numara başına *erişim yok / okuma / yazma* | Herkes yalnızca işi için gereken numaraları ve işlemleri görür |
| **Ekranına geç** | Yetkili kişi bir kullanıcının ekranını onun gözünden görür, kendi yetkisiyle sınırlı olarak. Tamamen salt okunur izleme ya da (izin varsa) onun adına yazma | Ekip denetimi ve destek kolaylaşır. Adına yazılan mesaj "Patron (Ali olarak)" diye kaydedilir |
| **Güvenlik** | Giriş kilidi (aynı adresten 5 hatalı denemede 5 dakika, çok deneme yapan adrese 15 dakika), şifre değişince diğer oturumların düşmesi, CSRF koruması, istek boyutu sınırı, her istekte ve her canlı olayda yeniden yetki denetimi | Yetki sunucuda, her an güncel denetlenir. Bir kullanıcının erişimi kaldırıldığı anda biter |
| **Etkinlik kaydı** | Girişler, hatalı denemeler, gönderilen mesajlar, ekranına geçmeler ve tüm yönetim değişiklikleri. Filtre ve CSV dışa aktarma | Kim, kimin adına, ne zaman, ne yaptı sorusunun cevabı hazırdır |
| **Raporlar** | Gelen/giden sayıları, günlük dağılım, numara ve kullanıcı bazında kırılım, ortalama ve medyan cevap süresi | Ekip performansı ve yoğunluk ölçülebilir hale gelir |
| **Numara yönetimi** | 8 haneli eşleştirme kodu ya da QR ile bağlama, canlı durum takibi. Gerçek ve test numaraları yan yana | Numara eklemek dakikalar sürer. Ekip gerçek numaraya dokunmadan eğitilebilir |
| **Koruyucu gönderim katmanı** | Numara başına sıralı, insan hızında gönderim; "yazıyor…" göstergesi; kısıtlama sinyalinde otomatik duraklama; kontrollü yeniden bağlanma | Numaranın doğal bir kullanım profiliyle çalışmasına yardım eder |

Tüm özelliklerin ayrıntısı: [docs/ozellikler.md](docs/ozellikler.md).

**Durum.** Panel hem test numaralarıyla hem gerçek bir WhatsApp numarasıyla uçtan uca denendi. Gerçek numarada eşleştirme kodu, son sohbetlerin ve rehber adlarının ilk eşitlemesi, gelen mesajın canlı düşmesi ve panelden yanıt beklendiği gibi çalıştı. Sunucu tarafı 41 otomatik testle güvence altında: roller ve numara erişimi, ekranına geç sınırları, yönetim yetkisinin numara erişimiyle sınırı, CSRF, IP bazlı giriş sınırı, oturum düşürme, geçmiş eşitlemesi. Tip denetimleri temiz. WhatsApp bağlantısı tek bir arayüzün arkasında durduğu için ekip ve yeni kurallar gerçek numaraya dokunmadan test numarasıyla aynı akışta denenebiliyor. Altyapının izin verdiği ama bilerek eklenmeyen özellikler (profil fotoğrafları, medya indirme gibi) gerekçeleriyle [burada](docs/ozellikler.md#yapılabilir-ama-bilerek-eklenmeyenler) listelendi.

**Bağlantı yöntemi.** Numaralar, işletme hesabı ve doğrulama gerektirmeden hemen çalışsın diye bilerek bağlı cihaz yöntemiyle (Baileys) bağlanır. Yöntem gayriresmidir. Panel bu yüzden ban riskini düşük tutacak şekilde yapıldı: insan hızında gönderim, "yazıyor…" göstergesi, çevrim içi görünmeme, kısıtlama sinyalinde otomatik duraklama. Tanıdık kişilerle normal tempoda yazışmada risk düşüktür ama sıfır değildir. Resmi Cloud API (Coexistence dahil), panelin geri kalanına dokunmadan yeni bir bağlantı türü olarak eklenebilir: [gerekçe ve geçiş yolu](docs/ozellikler.md#neden-bu-yöntem).

---

## Gereksinimler

- **Bun 1.4.x** (proje `bun@1.4.3` ile sabitlenmiştir, bkz. `package.json` → `packageManager`)
- Gerçek numara bağlamak için: sunucunun internete çıkışı ve numaranın kayıtlı olduğu, WhatsApp'ı açık bir telefon
- Push bildirimleri için: `localhost` ya da HTTPS üzerinden erişim

Production kurulumu (Docker + Caddy ile otomatik HTTPS, yedekleme ve geri yükleme) için: **[docs/deploy.md](docs/deploy.md)**. Sunucu kurmadan önce telefondan denemek için hızlı tünel notları: [deploy/quick-tunnel.md](deploy/quick-tunnel.md).

---

## Hızlı başlangıç (yerel geliştirme)

```sh
# 1) Bağımlılıklar
bun install

# 2) Ortam dosyası
cp .env.example .env
#    JWT_SECRET'ı doldurun (en az 32 karakter). Örnek üretim:
bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())"

# 3) İlk yönetici hesabı (Patron rolü)
bun run user:create patron <şifre> "Ad Soyad" Patron

# 4) API sunucusu: http://localhost:3000 (değişiklikte kendini yeniden başlatır)
bun run dev

# 5) Ayrı bir terminalde arayüz: http://localhost:5173
bun run web:dev
```

Geliştirme sırasında arayüz **http://localhost:5173** adresinden açılır. Vite geliştirme sunucusu `/api` isteklerini API'ye (varsayılan `http://localhost:3000`, `API_TARGET` ortam değişkeniyle değiştirilebilir) aktarır ve canlı akışı tamponlamadan iletir.

**Derlenmiş arayüzle tek süreç:**

```sh
bun run web:build      # arayüzü web/dist klasörüne derler
bun src/index.ts       # ya da: bun run start → API + arayüz http://localhost:3000
```

Sunucu derlenmiş arayüzü `STATIC_DIR` (varsayılan `./web/dist`) klasöründen sunar. Tek sayfa uygulama yolları (`/admin/...` gibi) `index.html`'e yönlenir. Service worker ve push bildirimleri derlenmiş arayüzde etkindir.

> Veritabanı (SQLite) ilk açılışta `DATABASE_PATH` konumunda oluşturulur ve şema sürümü otomatik olarak güncellenir. Ayrı bir kurulum adımı gerekmez.

### Ortam değişkenleri

| Değişken | Varsayılan | Açıklama |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `production` ya da `test` |
| `HOST` / `PORT` | `0.0.0.0` / `3000` | Sunucunun dinlediği adres |
| `LOG_LEVEL` | `info` | pino günlük seviyesi |
| `DATABASE_PATH` | `./data/app.db` | SQLite dosyası |
| `JWT_SECRET` | (zorunlu) | Oturum çerezini imzalar. En az 32 karakter |
| `COOKIE_SECURE` | `false` | HTTPS arkasında `true` yapın |
| `TRUST_PROXY` | `false` | Ters vekil (Caddy) arkasında `true`: istemci adresi `X-Forwarded-For`'dan okunur. Docker Compose kurulumunda açıktır. Doğrudan internete açık sunucuda `false` kalmalı |
| `PROVIDER` | `baileys` | Yeni numaranın varsayılan türü: `baileys` (gerçek WhatsApp) ya da `mock` (test numarası) |
| `ALLOW_MOCK` | (boş) | Test numaralarına izin. Boşsa production dışında açıktır. `PROVIDER=mock` ise her zaman açıktır |
| `BAILEYS_AUTH_DIR` | `./data/baileys` | Numara başına WhatsApp oturum anahtarları. **Gizli tutulmalıdır** |
| `STATIC_DIR` | `./web/dist` | Derlenmiş arayüz klasörü |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | (boş) | Push bildirimleri. Boşsa push kapalıdır |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Push servisine bildirilen iletişim adresi |

Ortam değişkenleri tek bir yerde, `src/config/env.ts` içinde Zod şemasıyla doğrulanır. Hatalı değerde sunucu açıklayıcı bir mesajla başlamayı reddeder.

---

## Numara bağlama

1. Panelde **Yönetim → Numaralar → Numara ekle**: bir etiket (ör. "Satış") ve ülke koduyla telefon numarası girin. `0555…`, `+90 555…` gibi biçimler otomatik düzeltilir.
2. **Eşleştirme kodu al** ile 8 haneli kodu alın.
3. Telefonda:
   1. WhatsApp'ı açın.
   2. **Ayarlar → Bağlı cihazlar** bölümüne girin.
   3. **Cihaz bağla**'ya dokunun.
   4. Alttaki **"Bunun yerine telefon numarasıyla bağlan"** bağlantısına dokunun.
   5. Paneldeki kodu girin.
4. Bağlantı kurulunca numaranın durumu kendiliğinden **Bağlı** olur. Sayfa yenilemeye gerek yoktur.

Kod yerine QR ile bağlanmak isterseniz numaranın menüsündeki **QR koduyla bağla** seçeneği QR'ı gösterir. Telefonda **Bağlı cihazlar → Cihaz bağla** ile okutun.

Bağlanan numara telefondaki **Bağlı cihazlar** listesinde görünür. Numara oradan çıkarılırsa paneldeki durumu **Yeniden eşleştirme gerekli** (`FAILED`) olur ve yeniden eşleştirmek gerekir. Panelden silinen numara telefondaki listeden de çıkarılır. Sunucu yeniden başladığında daha önce bağlanmış numaralar kendiliğinden yeniden bağlanır.

Bağlantı yönteminin ayrıntısı ve yerleşik korumalar: [docs/ozellikler.md#bağlantı-yöntemi](docs/ozellikler.md#bağlantı-yöntemi).

---

## Test numaraları (WhatsApp olmadan deneme)

Panel, gerçek numaraların yanında **test numaralarını** da destekler. Test numarasının mesajları WhatsApp'a gitmez. Ekip eğitimi, demo ve geliştirme için uygundur.

- Numara eklerken **Tür: Test numarası** seçin (ya da `.env` içinde `PROVIDER=mock` ile varsayılanı test numarası yapın).
- Eşleştirme kodu `MOCK1234` olarak gelir ve numara yaklaşık 1 saniye içinde **Bağlı** olur.
- Gelen mesaj taklidi için numaranın menüsündeki **Gelen mesaj simüle et** seçeneğini kullanın (API: `POST /api/dev/inbound`, yalnızca test numaraları için).
- Test numaraları panelde "Test" rozetiyle ayrışır. Gerçek ve test numaraları aynı panelde yan yana durabilir.
- Production'da test numaraları varsayılan olarak kapalıdır. Açmak için `ALLOW_MOCK=true`.

---

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `bun run dev` | API sunucusunu izleme modunda başlatır (`bun --watch src/index.ts`) |
| `bun run start` | Sunucuyu başlatır (`bun src/index.ts`), derlenmiş arayüzü de sunar |
| `bun run web:dev` | Arayüz geliştirme sunucusu (Vite, port 5173, `/api` vekili) |
| `bun run web:build` | Arayüzü `web/dist` klasörüne derler (PWA, service worker dahil) |
| `bun test` | Tüm testleri çalıştırır (bellek içi veritabanı, test sağlayıcıları) |
| `bun run typecheck` | Sunucu, betikler ve testler için TypeScript denetimi |
| `bun run web:typecheck` | Arayüz ve service worker için TypeScript denetimi |
| `bun run user:create <kullanıcı_adı> <şifre> [ad] [rol]` | Komut satırından kullanıcı ekler. Rol varsayılanı `Patron` |
| `bun run vapid` | Push bildirimleri için VAPID anahtar çifti üretir. Çıktıyı `.env` dosyasına ekleyin |

---

## Belgeler

| Belge | İçerik |
| --- | --- |
| [docs/ozellikler.md](docs/ozellikler.md) | Tüm özellikler: ne yapar, kim kullanır (izin), kullanım ipuçları |
| [docs/kullanim.md](docs/kullanim.md) | Rol bazında günlük kullanım rehberi (Patron, Temsilci, Salt okunur, özel rol) |
| [docs/mimari.md](docs/mimari.md) | Kod yapısı, istek akışı, sağlayıcı katmanı, oturum ve yetki tasarımı, veri modeli, testler |
| [docs/api.md](docs/api.md) | API sözleşmesi: uç noktalar, nesneler, canlı akış olayları |
| [docs/deploy.md](docs/deploy.md) | Production kurulumu: Docker + Caddy (HTTPS), güncelleme, yedekleme/geri yükleme, sorun giderme |

---

## Teknoloji

| Katman | Kullanılan |
| --- | --- |
| Çalışma ortamı | Bun 1.4.3, TypeScript 5.9 (strict) |
| API | Hono 4, Zod 4 (istek doğrulama), pino (günlük) |
| Veritabanı | SQLite (`bun:sqlite`, WAL modu), `PRAGMA user_version` ile sürümlenen şema |
| WhatsApp | Baileys 7 (WhatsApp Web çoklu cihaz protokolü), qrcode |
| Canlı akış ve bildirim | Server-Sent Events, Web Push (VAPID, `web-push`) |
| Arayüz | React 19, React Router 7, TanStack Query 5, Vite 8 |
| PWA | vite-plugin-pwa + Workbox (özel service worker: önbellek, push, bildirim tıklama) |
| Dağıtım | Docker, Caddy (otomatik HTTPS). Bkz. [docs/deploy.md](docs/deploy.md) |
