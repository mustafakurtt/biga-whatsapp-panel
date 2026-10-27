# Biga Panel'i sunucuya kurma

Bu rehber paneli bir Linux sunucuda 7/24 ve HTTPS ile çalıştırmayı anlatır. Terminal kullanmayı bilmeniz yeterli. Docker veya sunucu yönetimi konusunda uzman olmanız gerekmez.

Kurulum iki parçadan oluşur, ikisi de Docker ile çalışır:

- **app**: panelin kendisi (API ve arayüz). Veriler `app-data` adlı Docker biriminde (volume) durur.
- **caddy**: dışarıdan gelen HTTPS isteklerini panele iletir. Let's Encrypt sertifikasını kendisi alır ve yeniler.

İlgili dosyalar: `Dockerfile`, `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/.env.production.example`, `deploy/backup.sh`, `deploy/restore.md`. Sunucu almadan önce telefonda denemek için: `deploy/quick-tunnel.md`.

---

## 1. Gerekenler

1. **Alan adı**, örneğin `panel.sirketiniz.com`.
2. **DNS A kaydı**: bu ad sunucunun genel (public) IP adresini göstermeli. Alan adını aldığınız firmanın panelinden eklenir. Cloudflare kullanıyorsanız ilk kurulumda kaydı **"DNS only"** (gri bulut) yapın, sertifika alındıktan sonra isterseniz açarsınız.
3. **Docker kurulu bir Linux sunucu.** Ubuntu 24.04 veya Debian 12 önerilir. En az 1 GB RAM ve 10 GB disk yeterli.
4. Sunucuda **80 ve 443 portları** dışarıya açık olmalı. Sertifika için 80 de gerekir.

### Ev sunucusu mu, VPS mi?

Paneli bir VPS'te (kiralık sunucu) çalıştırmak kolaydır. WhatsApp tarafında ise şunu bilin:

- WhatsApp numarası sunucuya **bağlı cihaz** olarak eklenir ve WhatsApp bağlantının hangi IP'den geldiğini görür. **Veri merkezi (VPS, bulut) ve VPN IP'leri ban riskini artırır.** Evdeki veya ofisteki normal internet bağlantısı (ev IP'si) daha az risklidir.
- Bu yüzden WhatsApp için en az riskli seçenek **evde/ofiste sürekli açık duran küçük bir bilgisayardır** (mini PC, eski bir dizüstü, ev sunucusu). Kurulum aynıdır. Ek olarak modemde 80/443 portlarını bu bilgisayara yönlendirmeniz gerekir. IP'niz değişiyorsa dinamik DNS kullanın. Operatörünüz CGNAT kullanıyorsa port yönlendirme çalışmaz; o durumda Cloudflare adlandırılmış tünel (named tunnel) gibi bir çözüm gerekir.
- **Aynı WhatsApp oturumu asla iki yerde aynı anda çalışmamalı.** Örneğin `data/baileys` klasörünü kendi bilgisayarınızdan sunucuya kopyalayıp ikisini birden açarsanız iki taraf birbirini düşürür. Loglarda `440` / `connectionReplaced` görünür ve ban riski artar. Taşırken önce eskisini kapatın.
- Bu yöntem resmi değildir ve WhatsApp kullanım koşullarına aykırıdır (bkz. [ozellikler.md → Neden bu yöntem](ozellikler.md#neden-bu-yöntem)). Hangi IP'yi kullanırsanız kullanın risk sıfır değildir.

---

## 2. Sunucuyu hazırlama (bir kez)

Sunucuya SSH ile bağlanın, sonra:

```sh
# Docker'ı kurun (resmi kurulum betiği)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # sudo'suz docker için; sonra çıkıp yeniden bağlanın

# Güvenlik duvarı (Ubuntu)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Proje dosyalarını sunucuya koyun. Bu rehber `/opt/biga-panel` klasörünü kullanır.

```sh
sudo mkdir -p /opt/biga-panel && sudo chown $USER /opt/biga-panel
# Git deposu varsa:
git clone https://github.com/mustafakurtt/biga-whatsapp-panel.git /opt/biga-panel
# Yoksa kendi bilgisayarınızdan kopyalayın (node_modules, data, .env HARİÇ):
#   scp -r Dockerfile .dockerignore package.json bun.lock tsconfig.json src scripts web deploy kullanici@sunucu:/opt/biga-panel/
```

---

## 3. İlk kurulum

Tüm komutlar `deploy/` klasöründe çalıştırılır:

```sh
cd /opt/biga-panel/deploy
```

### 3.1 Ayar dosyası

```sh
cp .env.production.example .env
chmod 600 .env
chmod +x backup.sh         # yedek betiğini çalıştırılabilir yapar
openssl rand -hex 32        # çıktıyı JWT_SECRET'a yapıştırın
nano .env
```

Doldurmanız gerekenler: `DOMAIN`, `ACME_EMAIL`, `JWT_SECRET`, `VAPID_SUBJECT`. `COOKIE_SECURE=true` ve `ALLOW_MOCK=false` olarak kalmalı. Her satırın açıklaması dosyanın içinde yazıyor.

### 3.2 İmajı derleme

```sh
docker compose build
```

İlk derleme birkaç dakika sürer.

### 3.3 Push bildirimi anahtarları (VAPID)

```sh
docker compose run --rm --no-deps app bun scripts/vapid.ts
```

Çıkan iki satırı (`VAPID_PUBLIC_KEY=...`, `VAPID_PRIVATE_KEY=...`) `.env` dosyasındaki boş satırların yerine yapıştırın. Bu işlemi **bir kez** yapın. Anahtarları sonradan değiştirirseniz tüm kullanıcıların bildirimleri yeniden açması gerekir.

### 3.4 Başlatma

```sh
docker compose up -d
docker compose ps
```

`app` satırında birkaç saniye sonra `healthy` yazmalı. Caddy sertifikayı ilk açılışta alır. Ardından `https://panel.sirketiniz.com` adresini tarayıcıda açın.

Kontrol:

```sh
curl https://panel.sirketiniz.com/health    # {"ok":true}
```

`restart: unless-stopped` sayesinde sunucu yeniden başlarsa veya uygulama çökerse konteynerler kendiliğinden yeniden açılır.

### 3.5 İlk Patron kullanıcısı

```sh
docker compose exec app bun scripts/create-user.ts patron 'GüçlüBirŞifre' "Ad Soyad" Patron
```

Şifreyi tek tırnak içinde yazın. Komut shell geçmişine kaydedilir. İsterseniz sonra `history -c` ile temizleyin veya ilk girişten sonra şifreyi panelden değiştirin. Diğer kullanıcıları panelden (Yönetim) ekleyebilirsiniz. Komut satırından eklemek için son parametreye rol adı yazılır, örneğin `Temsilci`.

### 3.6 WhatsApp numarası bağlama

Panelde Yönetim → Numara ekle → "Eşleştirme kodu al". Telefonda: WhatsApp → Bağlı cihazlar → Cihaz bağla → "Bunun yerine telefon numarasıyla bağlan" → kodu girin. Ayrıntılar README'de.

---

## 4. Yeni sürüme güncelleme

```sh
cd /opt/biga-panel
./deploy/backup.sh               # önce yedek
git pull                         # veya yeni dosyaları kopyalayın
cd deploy
docker compose up -d --build     # yeni imajı derler, uygulamayı yeniden başlatır
docker compose ps                # healthy mi?
docker image prune -f            # eski imajları temizler (isteğe bağlı)
```

- Güncelleme sırasında panel birkaç saniye kapanır. Eski konteyner kapanır, yenisi açılır. İkisi aynı anda çalışmaz, bu WhatsApp oturumu için önemlidir.
- Veritabanı değişiklikleri (migration) uygulama açılırken otomatik yapılır ve geri alınmaz. Eski sürüme dönmek gerekirse eski kodla birlikte güncellemeden önce aldığınız veritabanı yedeğini de geri yükleyin (bkz. `deploy/restore.md`).
- Caddy sürümünü yükseltmek için `docker-compose.yml` içindeki `caddy:2.11.7-alpine` satırını değiştirip `docker compose up -d` çalıştırın.

---

## 5. Yedekleme ve geri yükleme

`deploy/backup.sh` sunucuda çalışır ve çalışan konteynere bağlanarak yedek alır. Sunucuya `sqlite3` kurmanız gerekmez.

- **Veritabanı:** SQLite WAL modunda çalıştığı için dosya düz kopyalanmaz. Bunun yerine `VACUUM INTO` ile tutarlı bir kopya alınır, bütünlük kontrolünden geçirilir ve sıkıştırılır.
- **WhatsApp oturumları:** `baileys` klasörü `tar.gz` olarak alınır.
- Dosyalar zaman damgalıdır (`app-20261027-031500.db.gz`). Her türden son 14 dosya tutulur (`KEEP` ile değişir).

Elle çalıştırma:

```sh
/opt/biga-panel/deploy/backup.sh
# Farklı klasör ve saklama sayısı:
BACKUP_DIR=/var/backups/biga KEEP=30 /opt/biga-panel/deploy/backup.sh
```

Her gece otomatik yedek için `crontab -e` ile şu satırı ekleyin:

```cron
15 3 * * * /opt/biga-panel/deploy/backup.sh >> /var/log/biga-backup.log 2>&1
```

Log dosyasına yazabilmek için ya root'un crontab'ını kullanın ya da log yolunu kendi ev klasörünüze alın. Betiği çalıştıran kullanıcı `docker` komutunu sudo'suz çalıştırabilmeli.

**Yedekleri sunucu dışına da alın.** Sunucu giderse yanında duran yedekler de gider. Geri yükleme adımları ve dışarıya kopyalama: [`deploy/restore.md`](../deploy/restore.md).

---

## 6. Loglar ve durum

```sh
cd /opt/biga-panel/deploy
docker compose ps                         # durum (healthy / unhealthy / restarting)
docker compose logs -f app                # panel logları, canlı (Ctrl+C ile çıkın)
docker compose logs --since 1h app        # son 1 saat
docker compose logs -f caddy              # HTTPS / sertifika / istek logları
docker compose restart app                # paneli yeniden başlat
```

Daha ayrıntılı log için `.env` içinde `LOG_LEVEL=debug` yapıp `docker compose up -d` çalıştırın. Sorun çözülünce `info`'ya geri alın. Loglar 10 MB'lık dosyalarla sınırlıdır, diski doldurmaz.

---

## 7. Gizli tutulması gerekenler

| Ne | Nerede | Neden |
|---|---|---|
| `deploy/.env` | sunucu | `JWT_SECRET` ile herkesin adına oturum açılabilir. `VAPID_PRIVATE_KEY` ile kullanıcılarınıza bildirim gönderilebilir. |
| WhatsApp oturumları | `app-data` birimi → `/app/data/baileys` | **Bu klasöre sahip olan WhatsApp numaralarınızı kontrol eder.** |
| Veritabanı | `app-data` birimi → `/app/data/app.db` | Tüm müşteri mesajları, kullanıcılar, şifre özetleri. |
| Yedekler | `deploy/backups/` ve dışarıya aldığınız kopyalar | Yukarıdakilerin hepsini içerir. |

- Bunları git'e eklemeyin. `deploy/.gitignore` `.env` ve `backups/` dosyalarını zaten dışarıda bırakır.
- İmaj bu dosyaları içermez (`.dockerignore`). İmajı paylaşmak güvenlidir, birimi (volume) ve yedekleri paylaşmak değildir.
- Sunucuya SSH için şifre yerine anahtar kullanın ve sunucuya erişebilen kişi sayısını az tutun.

---

## 8. Sorun giderme

**Site açılmıyor / sertifika alınamıyor**
- `docker compose logs caddy` çıktısına bakın.
- `DOMAIN` doğru mu? DNS A kaydı bu sunucunun IP'sini gösteriyor mu? (`ping panel.sirketiniz.com`)
- 80 ve 443 açık mı? Hem sunucu firmasının güvenlik duvarını hem `ufw`'yi kontrol edin.
- Sunucuda başka bir web sunucusu (apache, nginx) 80/443'ü tutuyor olabilir: `sudo ss -ltnp | grep -E ':80|:443'`.
- Cloudflare kullanıyorsanız ilk sertifika için kaydı "DNS only" yapın.

**`app` sürekli yeniden başlıyor / `unhealthy`**
- `docker compose logs app`. "Ortam değişkenleri geçersiz" yazıyorsa `.env`'de bir hata vardır, en sık görüleni 32 karakterden kısa `JWT_SECRET`.

**Giriş yapılıyor ama hemen çıkış oluyor**
- `COOKIE_SECURE=true` olmalı ve site `https://` ile açılmalı.
- `JWT_SECRET` değiştiyse herkesin yeniden giriş yapması normaldir.

**Canlı akış çalışmıyor (yeni mesaj sayfa yenilenmeden gelmiyor)**
- Tarayıcıda Geliştirici araçları → Ağ (Network) → `events` isteği açık kalmalı ve 25 saniyede bir `ping` gelmeli.
- Sunucudan test (önce panelden giriş yapıp tarayıcıdaki oturum çerezini kopyalayın):
  `curl -N -H 'Cookie: <çerez>' https://panel.sirketiniz.com/api/events` komutu `: bağlandı` yazıp açık kalmalı.
- Araya başka bir proxy, CDN veya kurumsal güvenlik duvarı girdiyse tamponlama yapıyor olabilir. Gelen Caddyfile'da tamponlama kapalıdır (`flush_interval -1`) ve SSE sıkıştırılmaz.
- Cloudflare **Quick Tunnel** SSE'yi desteklemez (bkz. `deploy/quick-tunnel.md`).

**Push bildirimi gelmiyor**
- `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` dolu mu? Doldurduktan sonra `docker compose up -d` çalıştırdınız mı?
- `VAPID_SUBJECT` gerçek bir `mailto:` adresi olmalı.
- iPhone: push yalnızca **ana ekrana eklenmiş** uygulamada çalışır (iOS 16.4+).
- Telefonun veya tarayıcının ayarlarında site bildirimleri engellenmiş olabilir.
- VAPID anahtarları değiştiyse kullanıcılar bildirimleri panelden kapatıp yeniden açmalı.

**WhatsApp: `440` / `connectionReplaced`**
- Aynı oturum başka bir yerde de açık demektir: kendi bilgisayarınızda çalışan geliştirme sürümü, eski sunucu, ikinci bir konteyner olabilir. `docker ps` ile kaç tane `app` çalıştığına bakın ve diğer kopyayı kapatın. Uygulamayı asla `--scale` ile çoğaltmayın.

**WhatsApp: `401` / oturum kapatıldı (loggedOut)**
- Numara telefondan "Bağlı cihazlar" listesinden çıkarılmış veya WhatsApp oturumu sonlandırmış olabilir. Numara panelde "Hata" görünür. Panelden yeniden eşleştirin.
- Sık tekrarlıyorsa numara kısıtlanmış veya banlanmış olabilir. Ev IP'si notunu okuyun (bölüm 1).

**Disk doluyor**
- `df -h` ve `docker system df` ile kontrol edin. `docker image prune -f` eski imajları siler. Yedek klasörünü ve `KEEP` değerini kontrol edin.

---

## Ek: Güvenlik başlıkları hakkında

Caddy şu başlıkları ekler: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`. CSP olarak yalnızca `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` gönderilir.

Tam bir CSP (`script-src`, `style-src`, `font-src`) **bilerek eklenmedi**. Arayüzde tema için satır içi bir `<script>` ve Google Fonts var. Katı bir politika bunları, ileride eklenecek medya veya görsel kaynaklarını ya da service worker'ı sessizce bozabilir. Eklemek isterseniz önce `Content-Security-Policy-Report-Only` başlığıyla deneyin ve tarayıcı konsolunda ihlal kalmayınca zorunlu hale getirin. Başlangıç noktası olarak şu politika kullanılabilir (satır içi tema betiği için `'sha256-...'` özetinin eklenmesi gerekir):

```
default-src 'self'; script-src 'self' 'sha256-<tema-betiği-özeti>'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'
```
