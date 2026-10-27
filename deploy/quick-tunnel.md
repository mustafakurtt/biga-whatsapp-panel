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

## Sınırlamalar

- **Canlı akış (SSE) çalışmaz.** Cloudflare Quick Tunnel, Server-Sent Events'i desteklemez. `/api/events` üzerinden gelen anlık güncellemeler tünelde gelmez; yeni mesajı görmek için sayfayı yenilemeniz gerekebilir. Push bildirimleri bundan etkilenmez. Gerçek sunucuda (Caddy) SSE çalışır.
- Adres her `cloudflared` çalıştırmasında **değişir**. Yeni adreste PWA'yı yeniden kurmanız ve bildirimleri yeniden açmanız gerekir. Eski adresin aboneliği işe yaramaz.
- En fazla 200 eşzamanlı istek ve çalışma süresi garantisi yok. Sadece deneme içindir.
- Adresi bilen herkes giriş ekranını görür. Güçlü şifre kullanın ve deneme bitince tüneli kapatın (Ctrl+C).
- Sabit adres ve SSE desteği isterseniz Cloudflare'de kayıtlı bir alan adıyla **adlandırılmış tünel** (named tunnel) kurulabilir, ama bu, kalıcı kurulum için `docs/deploy.md`'deki yoldan daha karmaşıktır.

Kaynak: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>
