# WhatsApp Paneli

Birden fazla WhatsApp numarasını tek panelden yöneten küçük bir uygulama. Panelde roller, ortak gelen kutusu, "kim kime ne yazdı" kaydı, canlı akış ve push bildirimleri var.
WhatsApp tarafında [Baileys](https://github.com/WhiskeySockets/Baileys) kullanılıyor. Numara, eşleştirme koduyla sunucuya **bağlı cihaz** olarak eklenir.

> Bu yöntem resmi değildir ve WhatsApp kullanım koşullarına aykırıdır. Ban riski vardır, o yüzden sadece deneme numaralarıyla kullanın.

## Kurulum

```sh
bun install
cp .env.example .env        # JWT_SECRET'ı doldurun (en az 32 karakter)
bun run user:create patron <şifre> "Ad Soyad" patron
bun run dev                 # http://localhost:3000
```

- `PROVIDER=mock`: WhatsApp olmadan deneme yapılır. Eşleştirme kodu `MOCK1234` olur ve numara 1 saniye sonra bağlanır. Gelen mesajı taklit etmek için `POST /api/dev/inbound` kullanılır.
- `PROVIDER=baileys`: gerçek WhatsApp. Oturum dosyaları `data/baileys/` klasöründe durur. Bu klasör gizli tutulmalı, çünkü numaraya erişim anlamına gelir.
- Push bildirimi için `bun run vapid` ile anahtar üretin ve çıktıyı `.env` dosyasına ekleyin. Bildirimler sadece `localhost` adresinde ya da HTTPS üzerinden çalışır.

## Numara bağlama (Baileys)

1. Yönetim → Numara ekle (ad + telefon).
2. "Eşleştirme kodu al" ile 8 haneli kodu alın.
3. Telefonda: WhatsApp → Bağlı cihazlar → Cihaz bağla → "Bunun yerine telefon numarasıyla bağlan" → kodu girin.

Telefondan "Bağlı cihazlar" listesinden çıkarılan numaranın durumu "Hata" olur. Yeniden eşleştirmek gerekir.

## Komutlar

`bun test` · `bun run typecheck` · API sözleşmesi: [docs/api.md](docs/api.md)
