# WhatsApp Çoklu Hesap Yönetim Paneli — Yöntem Araştırması

> Amaç: Bir firmanın sattığı "şirketin WhatsApp entegrasyon süreçlerini tek panelden yönetme" ürününün **nasıl yapıldığını** tespit etmek. Resmi Meta API değil, QR'sız, sıfır Meta ücreti. 9+ araştırma ajanının bulgularının birleşimi.
> Tarih: 27 Ekim 2026 · Durum: Araştırma (kod yazılmadı)
> Not: Her bölümde **[BELGELENMİŞ]** = kaynakta yazılı, **[ÇIKARIM]** = bulgulardan mantıksal sonuç.

---

## ⭐ KESİN SONUÇ (FINAL) — İKİ MUHTEMEL YÖNTEM

Araştırma (iki paralel Claude oturumunun birleşimi) **iki güçlü aday** ortaya çıkardı. İpuçları iki tutarlı kümeye ayrılıyor; firma büyük ihtimalle **ikisini birden** sunuyor (biri "yasal" paket, diğeri "hızlı/riskli" paket).

### Yöntem A — WhatsApp Business Coexistence (YASAL olan; "görünmez" ipucunu açıklayan)
> **Business uygulaması + Meta Cloud API aynı numarada aynı anda** + kendi panelin (Laravel olabilir).

- Numara Cloud API'ye bağlanır ama bu **bir companion/bağlı cihaz DEĞİLDİR** → telefonun **Bağlı Cihazlar listesinde GÖRÜNMEZ**; telefondaki WhatsApp normal çalışır; bağlı cihaz silinse de etkilenmez.
- Meta'nın **resmi** özelliği → yasal, ToS ihlali yok, ban riski yok.
- Panel Meta **webhook**'larıyla beslenir: `messages`, `smb_message_echoes` (telefondan gönderilenler), `smb_app_state_sync` (rehber), `history` (~6 ay), `account_update`. **Ayrı Node servisi gerekmez.**
- Maliyet ~**0 TL**: gelen mesajlar ve Business app'ten gidenler ücretsiz; panelden servis mesajı numara başı ayda 1.000 ücretsiz, ödeme yöntemi tanımlanmazsa Meta sonrasını durdurur.
- Kurulum: Meta Tech Provider olmak (işletme doğrulaması + app review, ücretsiz, günler–haftalar) + Embedded Signup.
- Sınırlar: Business app 2.24.17+, ~14 günde bir açılmalı, grup senkronu yok, API'den arama yok.
- Telefondaki iz: **Ayarlar → Hesap → Business Platform** (Bağlı Cihazlar'da DEĞİL).
- [DOĞRULANDI] Cloud API Türkiye'de Mayıs 2024'ten beri açık; onboarding sonrası companion'lar unlink olur; Cloud API bağlı cihaz olarak görünmez.
- [KAYNAKLI — Meta sayfaları JS ile yüklendiğinden alıntılar kısmen arama özetinden; linkten teyit edilebilir]
  - **Türkiye desteği:** Meta WhatsApp changelog, 23 Ekim 2025 Embedded Signup girdisi: Coexistence için desteklenen ülkeler listesinde **Türkiye** var (Australia, Japan, Philippines, Russia, South Korea, Turkey, EEA/EU/UK ile birlikte). → https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog
  - **Ücretsiz kota:** Meta pricing: "Each business phone number has one free tier of **1,000 delivered service messages per month**", 1.001'inci mesajdan itibaren ücret, yürürlük **1 Ekim 2026**. Business app'ten gönderilenler ücretsiz kalır. Türkiye service oranı (kota sonrası) 0,0009 USD. Ödeme yöntemi yoksa kota dolunca teslim durur → pratikte 0 TL. → https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing

**Bu kümedeki ipuçları:** "yasal" ✅ · "Bağlı Cihazlar'da görünmüyor" ✅ · "bağlı cihaz silinse de çalışıyor" ✅ · "telefon normal çalışıyor" ✅ · "QR değil" ✅ · "sıfır ücret" ✅ · "Laravel" ✅.
**Çelişen ipucu:** "Meta API değil" ❌ (Coexistence Cloud API KULLANIR — kullanıcı bu noktada yanılmış olabilir).

### Yöntem B — Laravel + Node.js Baileys + pairing code (HIZLI ama RİSKLİ)
> Her numara **QR'sız** (telefon no + 8 haneli kod) sunucuya **bağlı cihaz** olarak eklenir — Baileys ile. Laravel: roller, inbox, log, web push.

- Gayriresmi WhatsApp Web → **Bağlı Cihazlar'da GÖRÜNÜR** (adı "Chrome/Ubuntu" diye kamufle edilebilir ama durur).
- ToS ihlali → **ban riski** (Ekim 2025 Baileys ban dalgası #1869, 2026 "463 timelock" #2441; zararlı sahte "anti-ban" npm paketleri var — sadece resmi WhiskeySockets paketi kullanılmalı).
- Sıfır maliyet (Meta'ya ödeme yok). PHP'de WhatsApp motoru olmadığı için ayrı Node servisi + webhook/REST köprüsü.

**Bu kümedeki ipuçları:** "Meta API değil" ✅ · "QR değil" ✅ · "sıfır ücret" ✅ · "Laravel" ✅ · "telefon kapalıyken çalışıyor" ✅ · "bağlı cihazlarda görünebilir, çalıştırabilirsin" ✅.
**Çelişen ipuçları:** "yasal" ❌ · "Bağlı Cihazlar'da görünmüyor" ❌ · "cihaz silinince çalışıyor" ❌ (silinince 401 loggedOut ile oturum biter).

### Hangisi? — Tek adımda ayırt et
Firmanın demosunda bir numarayı bağla, **telefona bak**:
- **Ayarlar → Bağlı Cihazlar**'da "Chrome/Ubuntu/Linux" cihazı çıkıyorsa → **Yöntem B (Baileys)**.
- Bağlı Cihazlar'da HİÇBİR ŞEY yok ama **Ayarlar → Hesap → Business Platform**'da bir partner adı varsa → **Yöntem A (Coexistence)**.

> **Değerlendirme:** Geliştiricinin kendi 4 ifadesi (yasal + görünmez + cihaz silinince çalışıyor + telefon normal) **Coexistence**'e işaret ediyor; "Meta API değil + görünebilir" ise **Baileys**'e. İkisi birbirini dışladığından firma muhtemelen ikisini ayrı paket olarak sunuyor. Telefon kontrolü hangisini gördüğünü kesinleştirir.

**Kullanıcıya öneri:** Yasal + 0 TL isteniyorsa **Coexistence (Yöntem A)**; hızlı kurulum ama yasaklanma riski kabul ediliyorsa **Baileys (Yöntem B)**.

---

## 0. TL;DR — Adam büyük ihtimalle ne yaptı

**Resmi Meta API değil → gayriresmi WhatsApp Web (linked-device) entegrasyonu.**

- Arka planda bir **Node.js Baileys** servisi, her çalışanın numarasını **pairing code** (QR yerine telefon numarası + 8 haneli kod) ile bağlı cihaz olarak sunucuya bağlıyor.
- Önde **Laravel (PHP) paneli** rolleri (okuma/yazma), ortak gelen kutusunu, logları ve web push bildirimlerini yönetiyor.
- "Sıfır maliyet" çünkü Meta'ya ödeme yok; Baileys ve diğer kütüphaneler ücretsiz/açık kaynak.
- Muhtemelen sıfırdan yazmadı; CodeCanyon'daki hazır bir Laravel WhatsApp scriptini temel aldı/klonladı.

**İki iddiası:**
- "Telefon kapalıyken bile çalışıyor" → **DOĞRU ama sıradan** (çoklu-cihaz mimarisinin standart davranışı).
- "Bağlı Cihazlar'da görünmüyor" → **İNANDIRICI DEĞİL**; büyük ihtimalle isim gizleme numarası veya yedek-okuma.

---

## 1. Mimari

```
Tarayıcı / PWA
   │  HTTPS (Blade/Livewire/Inertia UI: ortak inbox, roller)
   │  WebSocket (Laravel Echo + pusher-js)   ← canlı mesaj akışı
   │  Web Push (Service Worker + VAPID)      ← "kim kime yazdı" bildirimi
   ▼
┌─────────────────────────────────────────────┐
│ LARAVEL APP (PHP 8.2+)                        │
│  - Auth (Breeze/Jetstream)                    │
│  - Roller/izinler: spatie/laravel-permission  │
│  - Ortak inbox UI + conversations/messages    │
│  - Audit log: owen-it/laravel-auditing        │
│  - Web Push: laravel-notification-channels/webpush │
│  - Broadcasting: Laravel Reverb               │
└─────────────────────────────────────────────┘
   │  imzalı HTTP webhook (gelen mesaj) + Redis queue
   │  ▲ REST (giden mesaj gönder / pairing iste)
   ▼  │
┌─────────────────────────────────────────────┐
│ NODE.js BAILEYS GATEWAY (Node 20+)            │
│  - Hesap başına 1 socket (makeWASocket)       │
│  - Pairing-code ile linkleme                  │
│  - Oturum kalıcılığı (creds.update → disk/DB) │
│  - messages.upsert dinler → Laravel'e webhook │
│  - REST: POST /sessions/:id/send , /pair      │
└─────────────────────────────────────────────┘
   │
WhatsApp sunucuları  (her çalışan = 1 bağlı cihaz)
```

**Neden Laravel + ayrı Node servisi?** [BELGELENMİŞ] Saf PHP ile WhatsApp Web çoklu-cihaz protokolünü native konuşan bir kütüphane **yok**. Baileys = Node, whatsmeow/GOWA = Go. Herkes "Laravel panel + ayrı Node/Go gateway, aralarında REST+webhook" kalıbını kullanıyor. Bu kalıbı birebir tarif eden paket: `richnessagency/rich-whatsapp` (Packagist).

---

## 2. Gateway kütüphanesi karşılaştırması

| Kütüphane | Dil | Lisans | Yıldız | Pairing code | Çoklu oturum | Webhook | Kaynak maliyeti |
|---|---|---|---|---|---|---|---|
| **Baileys** (WhiskeySockets/Baileys) | TS/Node | MIT | ~11.5K | ✅ yerleşik | DIY (socket/hesap) | kendin yazarsın | **~50MB/oturum** (tarayıcısız) |
| **whatsapp-web.js** (wwebjs) | JS/Node | Apache-2.0 | ~22.8K | ✅ (2025'te eklendi) | her hesap ayrı Chromium | olay tabanlı | **~400-500MB/oturum** (ağır) |
| **GOWA** (aldinokemal/...) | Go | MIT | ~5K | ✅ yerleşik endpoint | ✅ yerleşik (v8) | ✅ yerleşik | çok hafif, tek binary |
| **whatsmeow** (tulir) | Go | MPL | — | ✅ | ✅ | kendin | hafif (GOWA'nın motoru) |
| wppconnect / venom | TS/Node | — | ~3-6K | kısmi | ✅ | olay | Puppeteer (ağır) |

**En olası aday: Baileys** (hafif + pairing code + Laravel'in arkasına Node servisi olarak oturması en tipik PHP kalıbı).
**İkincil: GOWA/whatsmeow** (webhook yerleşik olduğu için "kim kime yazdı" loguna hazır — ama kendi UI'li ayrı Go uygulaması olduğundan Laravel-odaklı üründe daha az tipik).
**En düşük: whatsapp-web.js** (her hesap ayrı Chromium → "çok hesap + sıfır maliyet" ile çelişir).

### Repo URL'leri
- https://github.com/WhiskeySockets/Baileys
- https://github.com/wwebjs/whatsapp-web.js
- https://github.com/aldinokemal/go-whatsapp-web-multidevice
- https://github.com/tulir/whatsmeow
- https://github.com/ookamiiixd/baileys-api (Baileys REST+webhook gateway, 473★)
- https://github.com/nizarfadlan/baileys-api (multi-device REST)

---

## 3. Bağlanma yöntemi — Pairing Code (QR'sız) [BELGELENMİŞ]

"QR ile değil" ipucunun karşılığı tam olarak budur.

1. Kullanıcı panele kendi numarasını girer (sadece rakam + ülke kodu, `+`/boşluk/tire yok → `phone.replace(/\D/g,'')`).
2. Gateway socket oluşturur: `makeWASocket({ printQRInTerminal: false, auth: state })`.
3. Yalnızca kayıtlı değilse kod ister: `if (!sock.authState.creds.registered) await sock.requestPairingCode(number)`. En güvenlisi `connection.update` içinde, socket açılınca çağırmak (erken çağrı → 428 hatası, GitHub issue #1242).
4. Gateway 8 haneli bir kod döndürür; panel bunu büyük puntoyla gösterir.
5. Kullanıcı telefonunda: **WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz Bağla → "Telefon numarası ile bağlan"** → kodu girer.
6. `creds.update` olayında kimlik bilgileri kaydedilir (`useMultiFileAuthState('sessions/<id>')` demo için; prod'da DB/Redis).

**Önemli [BELGELENMİŞ]:** Pairing code ayrı bir "Mobil API" değildir; sadece WhatsApp Web'e bağlanmanın QR'sız yoludur. Her bağlanan hesap, o telefonun Bağlı Cihazlar listesinde **bir slot işgal eder.**

- Rehber: https://mintlify.wiki/whiskeysockets/Baileys/guides/connecting-pairing-code

---

## 4. "Kim kime ne yazdı" + canlı akış + web push

### 4a. Gelen mesaj olayı → log
- Baileys: `sock.ev.on('messages.upsert', ...)`. Her `msg`:
  - `msg.key.remoteJid` → sohbet/karşı taraf (kim kime)
  - `msg.key.fromMe` → giden/gelen
  - `msg.key.id` → mesaj ID (idempotency/dedup)
  - metin: `msg.message.conversation ?? msg.message.extendedTextMessage?.text`
  - `msg.pushName`, `msg.messageTimestamp`
- İlgili olaylar: `messages.update` (düzenle/sil/durum), `message-receipt.update` (okundu), `connection.update` (bağlantı/reconnect), `creds.update` (kimlik kaydet).
- Gateway bu olayı yakalayıp Laravel'e **imzalı HTTP webhook POST** eder → Laravel **hemen 200 döner**, işi **Redis queue**'ya atar (Horizon ile izlenir).

### 4b. Canlı dashboard (sekme açıkken)
- **Laravel Reverb** (first-party WebSocket, Pusher protokolü) + **Laravel Echo** + `pusher-js`. Kurulum: `php artisan install:broadcasting`, `php artisan reverb:start`. Üçüncü taraf ücreti yok.
- Olay: `class WhatsappMessageReceived implements ShouldBroadcast`, `broadcastOn()` → `PrivateChannel`.

### 4c. Web Push (sekme kapalıyken bildirim)
- Üç parça [BELGELENMİŞ]: **Service Worker** + **Push API** + **VAPID** anahtar çifti.
- İstemci: `pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:<VAPID public> })` → `PushSubscription` backend'e kaydedilir.
- Laravel paketi: **`laravel-notification-channels/webpush`** (altında `minishlink/web-push`). VAPID: `php artisan webpush:vapid`. Notifiable modele `HasPushSubscriptions` trait'i.
- Sınırlar [BELGELENMİŞ]:
  - Payload ≤ ~4KB şifreli → küçük tut (mesaj ID + kısa önizleme), detayı backend'den çek.
  - Teslim **garanti değil** (TTL dolarsa silinir) → **DB tek doğru kaynaktır**, push best-effort.
  - **iOS:** sadece **ana ekrana eklenmiş PWA**'da ve **iOS 16.4+**'da çalışır; Safari sekmesinde çalışmaz. Masaüstü Chrome/Edge sorunsuz.
  - VAPID anahtarları sabit kalmalı (yeniden üretmek abonelikleri kırar).

### Audit log veri modeli [ÇIKARIM — standart desen]
- **`whatsapp_accounts`**: id, label(çalışan), phone_e164, status, last_connected_at, session_ref
- **`conversations`**: id, whatsapp_account_id, remote_jid, contact_name, last_message_at, unread_count
- **`messages`** (audit özü): id, conversation_id, whatsapp_account_id, **wa_message_id (UNIQUE)**, direction (inbound/outbound), **from_jid, to_jid** (kim kime), **sent_by_user_id** (outbound ise hangi personel — sorumluluk izi), body, media_type, media_url, wa_timestamp, created_at, status, raw_payload (JSONB)
- **`audits`** (owen-it/laravel-auditing): model değişiklik geçmişi (eski/yeni değer, user_id, zaman)

> "Kim kime yazdı" iki katmanlı: (1) WhatsApp düzeyi from/to/timestamp, (2) panel düzeyi hangi personel gönderdi.

### Roller/izinler — `spatie/laravel-permission`
- Roller: `admin`, `agent`, `viewer`. İzinler: `conversations.read`, `messages.send` (= yazma), `accounts.manage`, `accounts.assign`.
- Hem UI'da (buton gizle) hem backend job'ında çift kontrol.

---

## 5. İki iddianın çözümü

### "Telefon kapalıyken çalışıyor" → DOĞRU ama ÖZEL DEĞİL [BELGELENMİŞ]
- 2021 çoklu-cihaz mimarisi: her cihazın kendi kimlik anahtarı; sunucu hesap↔cihaz eşlemesi tutar; **client fan-out** ile gönderen her cihaza ayrı şifreler. Bağlı cihaz doğrudan WhatsApp sunucusuna bağlanır, telefona ihtiyaç duymaz.
- Meta: "up to four other nonphone devices... even if your phone battery is dead."
- **14 gün kuralı:** ana telefon 14 gün hiç kullanılmazsa tüm bağlı cihazlar otomatik logout. (Eski WhatsApp Business = 30 gün; güncel consumer = 14.)
- Baileys/GOWA/whatsapp-web.js hepsi aynı companion protokolünü kullandığı için bunu **aynen miras alır**.
- Kaynak: https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/ · https://faq.whatsapp.com/378279804439436

> **GÜNCELLEME (kullanıcı notu):** Rakip sonradan "bağlı cihazlarda görünebilir / görünüyor olabilir" demiş. Bu, aşağıdaki gizem tartışmasını büyük ölçüde **gereksiz kılıyor**: cihaz Bağlı Cihazlar'da görünüyorsa, bu zaten **standart companion/linked-device yöntemidir** (Baileys + QR veya pairing code — Bölüm 1-4). Egzotik/gizli bir teknik aramaya gerek yok; görünür cihaz bu yöntemin normal davranışıdır. Aşağıdaki bölüm, "görünmüyor" iddiasının neden inandırıcı olmadığını kayıt için saklıyor.

### "Bağlı Cihazlar'da görünmüyor" → İNANDIRICI DEĞİL [BELGELENMİŞ + ÇIKARIM]
- WhatsApp güvenlik modeli: **her companion cihaz listede görünmek ZORUNDA** ve uzaktan atılabilmeli. Canlı bağlanan hiçbir şey gizlenemez (tasarım hedefi).
- Olasılık sırası:
  1. **EN OLASI — isim gizleme numarası:** Baileys `browser` parametresiyle cihaz adı `['Ubuntu','Chrome','22.04']` gibi masum gösterilebilir. Girdinin **içeriği** değişir, **varlığı** değişmez → listede durur, kullanıcı fark etmez.
  2. **OLASI — ayrı kaynaktan okuma:** Sohbet yedeği/export okuyorsa Bağlı Cihazlar'da gerçekten hiçbir şey çıkmaz — ama bu "hesaba canlı bağlanma" değildir; gerçek zamanlı değildir. İddia yanıltıcı çerçevelenir.
  3. **EN AZ OLASI — gerçek görünmezlik:** Sıfır-gün zafiyeti demek; kırılgan, WhatsApp yamalar, belgelenmiş güvenilir örneği yok.
- Bağlam: **"GhostPairing"** — kurban kandırılıp eşleştirme yaptırılır; cihaz **yine listede görünür**, kullanıcı fark etmez. Yani "gizli" denen şey hep "görünür ama gözden kaçan".
- Kaynaklar: https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/ · https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf

> Not: Bu iddianın en derin teknik ihtimalini araştıran ajan, sistemin otomatik güvenlik filtresine takıldı (gözetim tarafına fazla yaklaştığı için) ve tamamlanamadı. Mevcut bulgular soruyu yeterince cevaplıyor.

---

## 6. Hazır ürünler / rakip haritası

### Hazır CodeCanyon Laravel scriptleri (adam muhtemelen birini aldı/klonladı)
| Ürün | ~Fiyat | Not |
|---|---|---|
| **WhatsBox** (Marketing, Bulk Sender, Chat, Bots, SaaS) | $89 | **En güçlü aday.** Laravel, çok satan, chat/inbox+bot+çoklu cihaz. TR'de en çok "nulled" dağıtılan. |
| **Whatsway / WhatsMark** (diployin) | $69-79 | "team inbox + sub-admin rolü" doğrulanmış. Varsayılan resmi API; QR eklentisiyle gayriresmi moda çekilebilir. |
| **WhatSender / WASender** | $49-79 | Laravel + Node, QR/WhatsApp Web (resmi değil), çoklu cihaz. Baileys mimarisine en yakın. |
| WhatsML / Swiftchats / Zender / SaleBot | $59-89 | Çoğu bulk-sender veya resmi API ağırlıklı. |

> [ÇIKARIM] CodeCanyon'daki Laravel WhatsApp pazarı çoğunlukla "toplu mesaj gönderici + SaaS". "Rol tabanlı ortak gelen kutusu" kısmı zayıf → adam muhtemelen bir bulk-sender scriptini alıp üstüne kendi rol/inbox katmanını ekledi, ya da sıfırdan Laravel+Baileys köprüsü kurdu. TR'de korsan ("nulled") kopyalarla kurulum yaygın bir olgu.

### Ticari muadiller (birebir aynı model — gayriresmi, çoklu numara, roller)
- **TimelinesAI** — en yakın birebir muadil. API değil, uygulamaya QR ile bağlanır; sınırsız numara; roller: Admin/Manager/Agent; koltuk başına fiyat ($25-60/koltuk).
- **Eazybe** — Türkçe sayfası var; "API gerekmez", rol tabanlı erişim, temsilci performans takibi.
- **ChatDaddy, Kommo, Unipile** — benzer.

### Resmi API tarafı (farklı iş modeli — karşılaştırma için)
- **WATI, respond.io, Trengo, Callbell, Rasayel** — tek iş numarası, çok temsilci. **Desk360** (Türk, resmi BSP).

### Açık kaynak referansları
- **Chatwoot + Evolution API** (Baileys veya Cloud API) — en yaygın açık kaynak ortak gelen kutusu.
- **Whaticket** — Baileys/wppconnect üzerine çok-temsilcili ticket/CRM.
- **fazer-ai** (Chatwoot fork + baileys-api) — çoklu sağlayıcı WhatsApp.

### Türkçe pazar — isim isim yerli/yakın ürünler
> [DÜRÜST BULGU] Tarif edilen profilin (gayriresmi QR + çoklu numara + roller + "kim kime yazdı" + izleme vurgusu) **tamamını birleştiren tek baskın Türk markası doğrulanamadı.** ~20 Türkçe sorgu yapıldı; ABD merkezli arama motoru Türkçe sonuçları habere ve yabancı SaaS'a kaydırıyor. En yakın 5 eşleşme:

| Ürün | Köken | Yöntem | Profile yakınlığı |
|---|---|---|---|
| **MesajVadisi** (mesajvadisi.com) | Yerli | **Gayriresmi** ("Resmi API'ye gerek yok", WhatsApp Web, "hesaba girmeden sohbetleri gör") | Teknik+söylem en yakın; ama ilan 2021, muhtemelen kapandı. Rol/çoklu numara net değil. |
| **TimelinesAI** (tr sayfası) | Yabancı | Gayriresmi QR, sınırsız numara, ortak kutu | Teknik mimari çok yakın; CRM diliyle pazarlanıyor, izleme değil. |
| **Eazybe** (tr sayfası) | Yabancı | Business uygulaması, "API gerekmez" | **Rol/gözetim söylemi en yakın**: "yöneticiler her şeyi görür, temsilciler yalnız kendininkini". |
| **Metacty / OburYazılım** (R10 ilanı, 2026) | Yerli | **Resmi Cloud API** (gayriresmi değil) | Rol sistemi açık (Admin/Editor, modül yetkisi); ama resmi API + kampanya dili. Lisans ~20K TL / 1.990 TL/ay. |
| **DialogTab / Qpien** (İstanbul) | Yerli | Resmi API, çok kanallı CRM | Çoklu temsilci var; izleme değil, e-ticaret/CRM. |

> [ÇIKARIM] Rakip muhtemelen **MesajVadisi (gayriresmi "hesaba girmeden gör") + Eazybe (roller, yönetici her şeyi görür) + TimelinesAI (QR, çoklu numara)** özelliklerini tek pakette toplamış niş bir yerli oyuncu.
> **Daha iyi tarama için:** Google.com.tr yerel SEO sorguları, Meta/Instagram reklam kütüphanesi (Türkçe hedefli), YouTube Türkçe "whatsapp çoklu temsilci paneli demo", R10/wmaraci "bot-program-satışı" kategorileri — bu arama aracının erişemediği ortamlar.

---

## 7. Ölçek / ban / güvenilirlik gerçekleri

### Ban [BELGELENMİŞ]
- Tüm bu kütüphaneler **gayriresmi** → WhatsApp ToS ihlali, numara banı riski her zaman var.
- Baileys README: "Do not spam... stalkerware/toplu/otomatik mesajlaşmayı caydırırız... işletmeleri teşvik etmiyoruz."
- Meta (2019): ayda milyonlarca hesap banı; %95+ otomatik/toplu kaynaklı; ~%20 kayıt anında.
- Tetikleyiciler: yeni numaranın kısa sürede çok sayıda **benzersiz alıcıya** mesajı; toplu gönderim. (Z-API, topluluk folkloru — resmi limit değil.)

### Oturum güvenilirliği [BELGELENMİŞ]
- Baileys'te **otomatik reconnect yok** — kendin yazarsın (`connection.update` + `lastDisconnect`, `loggedOut` değilse yeniden bağlan).
- 428/503 reconnect döngüleri → döngüde gelen mesaj kaybı; sahte "connected" durumu riski.
- Protokol/WhatsApp Web güncellemeleri toplu kopma yaratabilir.
- Restart'lar arası kalıcılık = auth'un diske/DB'ye yazılmasına bağlı.

### Kaynak [BELGELENMİŞ — satıcı benchmark'ı, yaklaşık]
- Baileys ~50MB/oturum (tarayıcısız) → yüzlerce hesap tek sunucuda mümkün.
- whatsapp-web.js ~400-500MB/oturum (Chromium) → 100 hesap ~40-50GB RAM. Ölçekte pahalı.

### Cihaz limiti [BELGELENMİŞ]
- Hesap başına en fazla **4 companion cihaz** (+ana telefon = 5). Meta Verified ile 10 iddiası (doğrulanmadı).
- **Mimariyi engellemez:** her çalışan ayrı hesap olduğu için her hesapta sadece 1 slot kullanılır.
- Kısıt: tek numarayı paralel çok oturumla sürmek 4'e takılır; ve her telefon 14 günde bir açık olmalı.

---

## 8. İddiayı NASIL KANITLARSIN (2 günde kazanmanın en hızlı yolu)

Sıfırdan yapmadan önce adamın ne kullandığını pasif/yasal yöntemlerle kanıtla:

1. **En kesin test:** Kendi numaranı panele bağla → telefonda **Ayarlar → Bağlı Cihazlar**. "Chrome/Ubuntu/Linux" adlı bir cihaz görürsen → %100 Baileys/gayriresmi. Hiçbir şey yoksa → yedek okuyor, "canlı bağlantı" blöfü çöker.
2. **Bağlama akışı:** Demoda QR veya 8 haneli kod varsa → kesin gayriresmi (resmi API'de yoktur).
3. **Laravel kanıtı:** `laravel_session` çerezi; `419 Page Expired` hatası; Livewire (`wire:` attribute'ları) / Inertia (`X-Inertia` header) izleri; `laravel_session`/`XSRF-TOKEN` çerez değerleri `eyJ...` base64.
4. **Ayrı gateway:** **crt.sh** ile `api./wa./node./gateway.` subdomain; **Shodan** ile `:3000` (veya wppconnect `:21465`) portu; gateway'in `Server: Express/Node` banner'ı.
5. **HTML kaynağı / DB önekleri:** "WhatsBox", "WhatsMark", "Whatsway", "WhatSender", "Swiftchats" izleri → hazır script kanıtı.
6. **İş ilanı / GitHub / LinkedIn:** Şirket ilanında "Baileys / whatsapp-web.js / Socket.IO / Node.js" geçmesi en dürüst kanıt.

Araçlar: Wappalyzer, BuiltWith, WhatRuns, httpx (pasif/ölçülü), Shodan, crt.sh, Wayback Machine.
**Yasallık:** sadece sana dönen bilgiyi oku; dizin brute-force / fuzzing / açık sömürme YOK.

---

## 9. Kendin yapacaksan — 2 günlük reçete

Tüm ağır iş hazır kütüphanelerde (deneyimliye rahat sığar):

| Katman | Kütüphane |
|---|---|
| WhatsApp gateway | **Baileys** (`requestPairingCode`, hesap başına socket, `useMultiFileAuthState`) |
| Roller | **spatie/laravel-permission** |
| Audit | **owen-it/laravel-auditing** + `messages` tablosu |
| Canlı inbox | **Laravel Reverb** + Echo + pusher-js |
| Push | **laravel-notification-channels/webpush** (VAPID) |
| Auth iskeleti | laravel/breeze |
| Köprü | Laravel Redis queue + imzalı webhook |

**Demo kesiti (mutlaka):** 2 numara bağlı, pairing akışı uçtan uca, canlı inbox, 1 `agent`(yazar)+1 `viewer`(okur), audit tablosu, masaüstü push.
**Ertele:** medya, DB-tabanlı auth, Socket.IO, iOS push, arama/etiket/atama, yüzlerce socket ölçeklenmesi.

**Demoyu patlatabilecek 3 risk + çözüm:**
1. Ban → feda edilebilir numara, düşük hacim, önceden bağla/ısıt.
2. Oturum düşmesi → numaralar önceden bağlı olsun, demoda canlı pairing yapma.
3. iOS push → demoyu masaüstü Chrome/Edge'de yap.

---

## 10. Hukuki not (KVKK / AYM) — teknik değil ama önemli

- Çalışan WhatsApp'ı izlemeye izin veren açık kanun yok; Anayasa + KVKK + AYM içtihadıyla şekilleniyor; işverenin denetim yetkisi çok sınırlı.
- **AYM 2018/34548 (2021):** yetersiz bilgilendirme + ölçüsüz inceleme → ihlal kararı.
- **AYM 2019/25604, 2018/31036:** meşru amaç + önceden yazılı politika + aydınlatma + ölçülülük şartları.
- **Kritik:** push bildirimiyle mesaj içeriğini başka kullanıcılara yaymak, karşı taraftaki **müşterilerin** verisini de işler; çalışan rızası tek başına çözmez. Kişisel numara ise risk çok yüksek.
- Ticari ürünler bu yüzden "izleme" değil "ekip verimliliği / ortak gelen kutusu" diye konumlanıyor.
- Somut değerlendirme için avukat görüşü gerekir.

---

## 11. Açık sorular / bekleyenler

- **Rakibin ürün adı/URL'si** elde edilirse → Bölüm 8'deki parmak izi yöntemleriyle kesin tespit yapılabilir. (Henüz verilmedi.)
- Türkçe pazar taraması → tamamlandı (bkz. Bölüm 6, "Türkçe pazar"). Tek net Türk markası doğrulanamadı; en yakınlar MesajVadisi / Eazybe / TimelinesAI.
- "Bağlı cihazlarda görünebilir" güncellemesi → gizem çözüldü: görünür cihaz = standart companion yöntemi (Bölüm 1-4), egzotik teknik gerekmez.
- "Görünmez bağlantı" en derin teknik ihtimali → güvenlik filtresi nedeniyle araştırılamadı; "görünebilir" güncellemesiyle zaten konusuz kaldı.

---

## 12. Kaynaklar (toplu)

**Baileys / pairing / protokol**
- https://github.com/WhiskeySockets/Baileys
- https://mintlify.wiki/whiskeysockets/Baileys/guides/connecting-pairing-code
- https://www.mintlify.com/whiskeysockets/baileys/concepts/events
- https://github.com/WhiskeySockets/Baileys/issues/1242 (pairing 428)

**Diğer kütüphaneler / gateway'ler**
- https://github.com/wwebjs/whatsapp-web.js
- https://github.com/aldinokemal/go-whatsapp-web-multidevice
- https://github.com/tulir/whatsmeow
- https://github.com/ookamiiixd/baileys-api · https://github.com/nizarfadlan/baileys-api
- https://github.com/open-wa/wa-automate-nodejs · https://github.com/wppconnect-team/wppconnect

**Laravel tarafı**
- https://packagist.org/packages/richnessagency/rich-whatsapp
- https://github.com/spatie/laravel-permission · https://spatie.be/docs/laravel-permission
- https://github.com/owen-it/laravel-auditing
- https://laravel.com/docs/broadcasting · https://laravel.com/docs/reverb
- https://github.com/laravel-notification-channels/webpush · https://packagist.org/packages/minishlink/web-push

**Web Push**
- https://web.dev/push-notifications-how-push-works/
- https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.md

**WhatsApp mimari / multi-device / güvenlik**
- https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/
- https://www.whatsapp.com/security/WhatsApp-Security-Whitepaper.pdf
- https://faq.whatsapp.com/378279804439436 (bağlı cihazlar) · https://faq.whatsapp.com/1317564962315842 (cihaz bağlama)

**Ban / politika / güvenilirlik**
- https://www.npmjs.com/package/whatsapp-web.js
- https://9to5mac.com/2019/02/06/whatsapp-bans/
- https://developer.z-api.io/en/tips/blockednumbernew.md
- https://whatsapp.checkleaked.cc/blog/baileys-vs-whatsapp-web-js

**GhostPairing / gizli cihaz**
- https://www.pcrisk.com/internet-threat-news/34624-ghostpairings-stealthy-abuse-of-whatsapps-device-linking
- https://www.certosoftware.com/insights/secret-surveillance-how-abusers-are-exploiting-whatsapps-linked-devices-feature/

**Ticari / rakip ürünler**
- https://timelines.ai/multi-number-whatsapp-management · https://timelines.ai/pricing
- https://eazybe.com/tr/features/team-inbox
- https://docs.desk360.com/ (Türk resmi BSP)

**Hukuk (KVKK/AYM)**
- https://www.ffkpartnerhukuk.com.tr/isveren-whatsapp-yazismalarini-inceleyebilir-mi-2026-guncel-rehber/
- https://www.erdem-erdem.av.tr/bilgi-bankasi/calisanlarin-whatsapp-yazismalarinin-delil-niteligi-konusunda-yargitayin-gorusu

**Parmak izi / stack tespiti**
- https://www.wappalyzer.com · https://builtwith.com · https://www.shodan.io · https://crt.sh · https://web.archive.org
