# Yedekten geri yükleme

Yedekler `deploy/backup.sh` ile alınır (varsayılan klasör: `deploy/backups/`):

- `app-YYYYmmdd-HHMMSS.db.gz`: veritabanı (kullanıcılar, mesajlar, roller, kayıtlar)
- `baileys-YYYYmmdd-HHMMSS.tar.gz`: WhatsApp oturum anahtarları

Tüm komutları sunucuda, `deploy/` klasöründe çalıştırın. Örneklerde zaman damgası `20261027-031500`; kendi dosyanızın adını yazın.

## 0. Önce şu anki hali de yedekleyin

Geri yükleme mevcut veriyi siler. Bir şey ters giderse dönebilmek için:

```sh
./backup.sh
```

## 1. Uygulamayı durdurun

```sh
docker compose stop app
```

Uygulama dururken veritabanı dosyası değiştirilmeli. Çalışırken üzerine yazmak veritabanını bozar.

## 2. Veritabanını geri yükleyin

```sh
gunzip -c backups/app-20261027-031500.db.gz | \
  docker compose run --rm -T --no-deps --entrypoint sh app -c \
  'rm -f "$DATABASE_PATH" "$DATABASE_PATH-wal" "$DATABASE_PATH-shm" && cat > "$DATABASE_PATH"'
```

`-wal` ve `-shm` dosyaları silinmeli. Eski WAL dosyası kalırsa yeni veritabanıyla karışır.

## 3. (Gerekirse) WhatsApp oturumlarını geri yükleyin

```sh
docker compose run --rm -T --no-deps --entrypoint sh app -c \
  'rm -rf "$BAILEYS_AUTH_DIR" && tar -xzf - -C "$(dirname "$BAILEYS_AUTH_DIR")"' \
  < backups/baileys-20261027-031500.tar.gz
```

Bilmeniz gerekenler:

- **Aynı oturum aynı anda iki yerde çalışmamalı.** Yedeği başka bir makineye açıyorsanız eski makinedeki uygulama kapalı olmalı. Yoksa iki taraf birbirini düşürür (440 `connectionReplaced`) ve ban riski artar.
- WhatsApp oturum anahtarları zamanla değişir. Eski bir yedek her zaman çalışmayabilir. Numara "Hata" durumuna düşerse panelden yeniden eşleştirin (Yönetim → numara → eşleştirme kodu al).
- Sadece veritabanını geri yüklüyorsanız bu adımı atlayın. Mevcut oturumlar kalır.

## 4. Başlatın ve kontrol edin

```sh
docker compose up -d
docker compose ps          # app "healthy" olmalı
docker compose logs -f app # hata var mı bakın (çıkmak için Ctrl+C)
```

Panele girip kullanıcıların ve sohbetlerin geldiğini kontrol edin.

## Yedekleri sunucu dışında saklama

Sunucu tamamen kaybolursa sunucudaki yedekler de gider. Düzenli olarak başka bir yere kopyalayın. Örneğin kendi bilgisayarınızdan:

```sh
scp -r kullanici@sunucu:/opt/biga-panel/deploy/backups ./biga-yedekler
```

`baileys-*.tar.gz` dosyaları WhatsApp numaralarının anahtarıdır. Şifresiz bulut klasörlerine koymayın. Gerekirse şifreleyin, örneğin `gpg -c dosya.tar.gz`.
