# Sunucu almadan telefonda deneme (Cloudflare Quick Tunnel)

PWA kurulumu, service worker ve push bildirimleri **HTTPS** ister (`localhost` hariç). Telefon `localhost`'a erişemediği için bilgisayarınızdaki paneli geçici bir HTTPS adresiyle açabilirsiniz. Hesap ve alan adı gerekmez.

## Adımlar

1. `cloudflared` kurun: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/> (Windows: `winget install --id Cloudflare.cloudflared`).
2. Proje klasöründe `.env` dosyasında şunları ayarlayın:
   ```env
   COOKIE_SECURE=true
   VAPID_PUBLIC_KEY=...   # bun run vapid çıktısı
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:gercek-adresiniz@ornek.com
   ```
   - `COOKIE_SECURE=true`: tünel HTTPS olduğu için çerez güvenli işaretlenmeli. Tarayıcılar `http://localhost` için de güvenli çerezi kabul eder, yani bilgisayardan denemeye devam edebilirsiniz. Sorun çıkarsa deneme bitince `false` yapın.
   - `VAPID_SUBJECT` gerçek bir `mailto:` adresi olmalı. `example.com` bırakılırsa Apple (iPhone) push isteklerini reddedebilir.
3. Arayüzü derleyip sunucuyu başlatın:
   ```sh
   bun run web:build
   bun run dev
   ```
4. Ayrı bir terminalde tüneli açın:
   ```sh
   cloudflared tunnel --url http://localhost:3000
   ```
   Çıktıda `https://<rastgele-kelimeler>.trycloudflare.com` gibi bir adres çıkar. Telefonda bu adresi açın, giriş yapın, "Ana ekrana ekle" ile kurun ve bildirimleri açın.
   - iPhone'da push yalnızca **ana ekrana eklenmiş** PWA'da çalışır (iOS 16.4+).

## Tünelin sınırlamaları

- **Canlı akış (SSE) çalışmaz.** Cloudflare Quick Tunnel, Server-Sent Events'i desteklemez. `/api/events` üzerinden gelen anlık güncellemeler tünelde gelmez; yeni mesajı görmek için sayfayı yenilemeniz gerekebilir. Push bildirimleri bundan etkilenmez. Gerçek sunucuda (Caddy) SSE çalışır.
- Adres her `cloudflared` çalıştırmasında **değişir**. Yeni adreste PWA'yı yeniden kurmanız ve bildirimleri yeniden açmanız gerekir. Eski adresin aboneliği işe yaramaz.
- En fazla 200 eşzamanlı istek ve çalışma süresi garantisi yok. Sadece deneme içindir.
- Adresi bilen herkes giriş ekranını görür. Güçlü şifre kullanın ve deneme bitince tüneli kapatın (Ctrl+C).
- Sabit adres ve SSE desteği isterseniz Cloudflare'de kayıtlı bir alan adıyla **adlandırılmış tünel** (named tunnel) kurulabilir, ama bu, kalıcı kurulum için `docs/deploy.md`'deki yoldan daha karmaşıktır.

Kaynak: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>

---

# Tünelsiz: aynı Wi-Fi ağından deneme

Telefon ve bilgisayar aynı ağdaysa panel tünel olmadan da açılır. Canlı akış bu yolda çalışır. PWA kurulumu ve bildirimler ise yalnızca Android Chrome'da, aşağıdaki bayrakla çalışır. Tarayıcılar bu özellikleri HTTPS ya da `localhost` dışında açmaz.

1. `.env` içinde `COOKIE_SECURE=false` olmalı. Düz HTTP'de güvenli çerez kaydedilmez, giriş yapılamaz.
2. Bilgisayarın yerel adresini bulun: Windows'ta `ipconfig` (Wi-Fi → IPv4, ör. `192.168.1.107`), macOS/Linux'ta `ip addr` ya da `ifconfig`.
3. Güvenlik duvarında port 3000'i yalnızca yerel ağa açın. Windows'ta **yönetici** PowerShell ile:
   ```powershell
   New-NetFirewallRule -DisplayName "Biga Panel 3000 (yerel ağ)" -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress LocalSubnet -Action Allow -Profile Any
   # Deneme bitince:
   Remove-NetFirewallRule -DisplayName "Biga Panel 3000 (yerel ağ)"
   ```
4. Arayüzü derleyip sunucuyu başlatın (`bun run web:build`, `bun run start`). Telefonda `http://<yerel-adres>:3000` adresini açın.
5. **Android'de PWA ve bildirim için:** telefonda `chrome://flags` → **Insecure origins treated as secure** → kutuya `http://<yerel-adres>:3000` yazın → **Enabled** → Chrome'u yeniden başlatın. Ardından menüden "Uygulamayı yükle" deyin ve bildirim izni verin.
6. **iPhone'da** böyle bir ayar yoktur. Ağ üzerinden panel kullanılır ama kurulum ve bildirim için tünel ya da HTTPS kurulum gerekir.
