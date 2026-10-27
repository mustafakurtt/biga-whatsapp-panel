# Biga Panel: Özellikler

Bu belge Biga Panel'in tüm özelliklerini alan alan anlatır. Her özellik için ne yaptığı, kimin kullanabileceği (gereken izin) ve bir kullanım ipucu verilir. İzin anahtarları (`messages.send` gibi) [Roller ve izinler](#roller-ve-izinler) bölümünde tablo halinde açıklanır. Uç noktaların teknik sözleşmesi [api.md](api.md) dosyasındadır.

**İçindekiler**

1. [Gelen kutusu ve sohbet](#gelen-kutusu-ve-sohbet)
2. [Canlı akış, bildirimler ve PWA](#canlı-akış-bildirimler-ve-pwa)
3. [Ekip çalışması](#ekip-çalışması)
4. [Roller ve izinler](#roller-ve-izinler)
5. [Ekranına geç](#ekranına-geç)
6. [Hesap yönetimi](#hesap-yönetimi)
7. [Denetim: etkinlik kaydı ve CSV](#denetim-etkinlik-kaydı-ve-csv)
8. [Raporlar](#raporlar)
9. [Numara yönetimi](#numara-yönetimi)
10. [Güvenlik](#güvenlik)
11. [Bağlantı yöntemi](#bağlantı-yöntemi)

---

## Gelen kutusu ve sohbet

Panelin merkezi ortak gelen kutusudur. Kullanıcı yetkili olduğu numaraları görür. Her numaranın sohbetleri son mesaja göre (yeniden eskiye) sıralanır. Numara listesinde her numaranın toplam okunmamış mesaj sayısı görünür.

| Özellik | Ne yapar | Kim kullanır |
| --- | --- | --- |
| **Sohbet listesi** | Numaradaki sohbetler. Her sohbette kişi adı ve telefon numarası, son mesaj, okunmamış sayısı, atanan kişi, durum ve etiketler | Numarayı görebilen herkes |
| **Mesaj geçmişi** | Sohbetin mesajları eskiden yeniye, 100'erli sayfalar halinde. Daha eski mesajlar sayfa sayfa yüklenir | Numarayı görebilen herkes |
| **Panelden yanıt** | Sohbete metin mesajı gönderir (en fazla 4096 karakter) | `messages.send` + numarada yazma erişimi |
| **Yeni sohbet başlatma** | Telefon numarası ve ilk mesajla yeni sohbet açar. Göndermeden önce numaranın WhatsApp kullanıp kullanmadığı denetlenir | `chats.start` + numarada yazma erişimi |
| **Okundu işareti** | Sohbet açılınca okunmamış sayısı sıfırlanır ve bu bilgi diğer ekranlara anında yansır | Numarayı görebilen herkes |
| **Mesaj kaynağı** | Her mesaj üç kaynaktan biriyle işaretlenir: *Müşteri*, *Telefondan* (numaranın telefonundaki WhatsApp'tan yazıldı), *Panel* (gönderen kullanıcının adıyla) | Herkes görür |

**Neden önemli:** Numaranın sahibi telefondan yazmaya devam etse bile o mesajlar da panele "Telefondan" olarak düşer. Sohbetin tamamı tek yerde ve eksiksizdir.

**Mesaj içerikleri.** Metin mesajları olduğu gibi gösterilir. Medya ve özel içerikler panelde açıklayıcı bir etiketle görünür: `[Fotoğraf]`, `[Video]`, `[Ses kaydı]`, `[Belge]`, `[Çıkartma]`, `[Konum]`, `[Kişi kartı]`, `[Anket]`. Fotoğraf ve videonun açıklaması, belgenin dosya adı etiketin yanında yazar. Tepki, silme/düzenleme bildirimi gibi teknik olaylar mesaj olarak listelenmez. Panel bire bir sohbetlerle çalışır. Gruplar, durum (story) yayınları ve kanallar listelenmez.

**Kişi adları.** Sohbetin adı şu sırayla seçilir: numaranın telefonundaki **rehberde kayıtlı ad**, kişinin kendi WhatsApp **profil adı**, ikisi de yoksa **telefon numarası**. Harf ya da rakam içermeyen profil adları ("." gibi) yok sayılır. Rehber adları numara eşleştirilirken WhatsApp'tan gelir ve rehberde ad değişince güncellenir.

**Kayıt başlangıcı ve son sohbetler.** Numara ilk kez eşleştirildiğinde WhatsApp son sohbetleri bağlı cihaza gönderir. Panel bunlardan bire bir sohbetleri alır ve her sohbetin **son 5 mesajını** kaydeder. İçe aktarılan mesajlar okunmamış sayılmaz, bildirim göndermez ve kapalı sohbeti açmaz. Daha eski geçmiş çekilmez. Sonrasında gelen ve giden tüm mesajlar kaydedilir. Bu aktarım yalnızca ilk eşleştirmede olur. Daha önce bağlanmış bir numarada son sohbetleri getirmek için numarayı silip yeniden eşleştirmek gerekir.

**Sağlamlık.** Aynı mesaj WhatsApp'tan iki kez gelirse bir kez kaydedilir. Geç ulaşan eski bir mesaj sohbetin "son mesaj" bilgisini ezmez. Gizli kimlikle (LID) gelen kişiler mümkün olduğunda telefon numaralarıyla eşlenir, böylece aynı kişinin sohbeti tek kalır.

> **İpucu:** Yeni sohbette numarayı `0555 111 22 33`, `+90 555 111 22 33` ya da `905551112233` biçiminde yazabilirsiniz. Panel ülke kodlu biçime kendisi çevirir: ülke kodu yazılmamışsa 0 ile başlayan 11 haneli ve 2–5 ile başlayan 10 haneli numaralar Türkiye numarası kabul edilir (`212 555 12 34` İstanbul sabit hattıdır). Yabancı numaraları `+` ile ülke koduyla yazın.

---

## Canlı akış, bildirimler ve PWA

| Özellik | Ne yapar | Kim kullanır |
| --- | --- | --- |
| **Canlı akış** | Yeni mesaj, okundu/atama/durum/etiket değişikliği, yeni ya da silinen not, "şu an bakıyor" listesi, etiket listesi ve numara durumu sayfa yenilemeden tüm ilgili ekranlara yansır | Giriş yapmış herkes. Her olay yalnızca o numarayı görebilenlere gider |
| **Push bildirimi** | Sekme ya da uygulama kapalıyken yeni mesaj bildirimi. Bildirime dokununca ilgili sohbet açılır | Giriş yapmış ve bildirime izin vermiş herkes, görebildiği numaralar için |
| **Kurulabilir uygulama (PWA)** | Panel telefona ya da masaüstüne uygulama olarak kurulur. Uygulama kabuğu önbellekten hızlı açılır | Herkes |
| **Tema** | Açık, koyu ya da sistem temasını izleyen görünüm. Seçim cihazda hatırlanır | Herkes |

**Bildirim içeriği.** Müşteriden gelen mesajda başlık "Kişi · Numara", gövde mesajın ilk 140 karakteridir. Ekipten giden mesajlarda ("Numara → Kişi") gövdede yazan kişi de yazar: "Ayşe: …", ekranına geçilerek yazıldıysa "Patron (Ali olarak): …", telefondan yazıldıysa "Telefondan: …". Mesajı panelden gönderen kişinin kendisine bildirim gitmez. Çıkış yapılan cihazın aboneliği sunucudan silinir, o cihaza artık bildirim (ve mesaj önizlemesi) gitmez.

**Yetki her olayda denetlenir.** Canlı akış ve push hedefleri her olayda veritabanından hesaplanır. Bir kullanıcının numara ataması ya da rolü değiştiğinde bir sonraki olaydan itibaren etkili olur. Devre dışı bırakılan kullanıcıya bildirim gitmez.

**Kurulum notu.** Push bildirimleri için sunucuda VAPID anahtarı tanımlı olmalıdır (`bun run vapid`, ardından `.env`). Anahtar yoksa panel çalışmaya devam eder, yalnızca push kapalı olur. Tarayıcılar push'u yalnızca HTTPS ya da `localhost` üzerinde açar. iPhone ve iPad'de push, panel **ana ekrana eklendikten sonra** (iOS 16.4 ve üzeri) çalışır.

> **İpucu:** Ekip üyelerinden paneli telefonlarında ana ekrana eklemelerini ve bildirime izin vermelerini isteyin. Böylece panel ayrı bir mesajlaşma uygulaması gibi çalışır.

---

## Ekip çalışması

### Sohbet atama

Bir sohbet tek bir kullanıcıya atanabilir. Atanan kişinin adı sohbet listesinde görünür.

- **Kendine üstlenme ve bırakma:** Numarada yazma erişimi olan herkes, atanmamış ya da zaten kendisine atanmış bir sohbeti üstlenebilir veya bırakabilir.
- **Başkasına atama ve başkasından alma:** `chats.assign` izni gerekir.
- Sohbet ancak o numarayı görebilen bir kullanıcıya atanabilir.

### Filtreler ve sohbet durumu

| Filtre | Gösterdiği |
| --- | --- |
| **Tümü** | Numaradaki tüm sohbetler |
| **Okunmamış** | Okunmamış mesajı olan sohbetler |
| **Benim** | Size atanmış sohbetler |
| **Atanmamış** | Henüz kimseye atanmamış sohbetler |
| **Açık / Kapalı** | Sohbet durumuna göre (filtrelerle birlikte kullanılabilir) |
| **Etiket** | Seçilen etikete sahip sohbetler |
| **Arama kutusu** | Kişi adı, telefon numarası ya da son mesaj metninde arar |

Sohbet **kapatılabilir** (iş bitti) ve yeniden **açılabilir**. Müşteri kapalı bir sohbete yeniden yazarsa sohbet kendiliğinden açılır. Hiçbir talep gözden kaçmaz. Durum değiştirmek için numarada yazma erişimi gerekir.

### Etiketler

Renkli etiketler (gri, kırmızı, turuncu, sarı, yeşil, turkuaz, mavi, mor, pembe) sohbetleri sınıflandırır: "Sipariş", "Şikâyet", "Teklif" gibi.

- **Etiket tanımlama** (ekleme, ad/renk değiştirme, silme): `tags.manage`. Etiket adları büyük/küçük harf duyarsız olarak tekildir. Silinen etiket tüm sohbetlerden kalkar.
- **Sohbete etiket takma:** numarada yazma erişimi yeterlidir. Bir sohbete en fazla 50 etiket takılabilir.
- Etiket listesi değiştiğinde açık tüm ekranlar anında güncellenir.

### Ekip içi notlar

Notlar sohbete eklenen, **müşterinin görmediği** ekip içi açıklamalardır ("Fatura adresi değişti, muhasebeye iletildi" gibi).

- Sohbeti görebilen herkes not ekleyebilir (salt okunur kullanıcılar dahil). Not en fazla 2000 karakterdir.
- Not yalnızca yazan kişi ya da `users.manage` izni olan bir yönetici tarafından silinebilir.
- Notta yazanın adı saklanır. Ekranına geçilerek yazıldıysa adına yazılan kullanıcı da kaydedilir.

### Hazır yanıtlar

Sık kullanılan yanıtlar (adres, çalışma saatleri, IBAN, kargo bilgisi…) başlık ve metin olarak tanımlanır, mesaj yazarken tek seçimle kullanılır.

- **Kullanmak:** herkes.
- **Eklemek, düzenlemek, silmek:** `quick_replies.manage`. Liste Türkçe alfabeye göre sıralanır.

### "Şu an bakıyor"

Bir sohbeti açık tutan ekip üyeleri sohbette görünür. Böylece aynı müşteriye iki kişinin aynı anda cevap yazması önlenir. Sohbet açıkken ekran 20 saniyede bir haber verir. 45 saniye sessiz kalan kişi listeden düşer. Ekranına geçerek izleyen biri bu listede **görünmez**.

### Mesaj araması

Tüm görebildiğiniz numaralarda mesaj metninde arama yapar (en az 2 karakter). En yeni 50 sonuç; her sonuçta sohbet ve numara adı bulunur.

> **İpucu:** Günün başında **Atanmamış** filtresiyle yeni talepleri ekip arasında dağıtın, ardından herkes **Benim** filtresiyle kendi işine odaklansın. İşi biten sohbeti kapatın. Müşteri yeniden yazarsa sohbet kendiliğinden açılır.

---

## Roller ve izinler

Erişim iki katmanlıdır: **rol** (hangi işlemler) ve **numara erişimi** (hangi numaralar, hangi seviyede). Asıl karar her zaman sunucuda verilir. Arayüz yalnızca yetkili olunan düğme ve menüleri gösterir.

### Roller

Her rol bir izin listesidir. Roller **Yönetim → Roller** ekranında oluşturulur ve düzenlenir. Kurulumda üç rol gelir:

| Rol | İzinler | Not |
| --- | --- | --- |
| **Patron** | Tüm izinler | Sistem rolü: değiştirilemez, silinemez |
| **Temsilci** | `messages.send`, `chats.start` | Düzenlenebilir |
| **Salt okunur** | (izin yok) | Atandığı numaraları okur. Not ekleyebilir. Düzenlenebilir |

### İzin kataloğu (13 izin)

| Grup | İzin | Anlamı |
| --- | --- | --- |
| Numaralar | `numbers.view_all` | Atama olmadan tüm numaraları görür |
| Numaralar | `numbers.manage` | Numara ekler; görebildiği numaraları siler, bağlar, yeniler. Eklediği numaraya yazma erişimi kendiliğinden verilir |
| Mesajlar | `messages.send` | Yazma erişimi olan numaralarda mesaj gönderir |
| Mesajlar | `chats.start` | Yeni sohbet başlatır |
| Mesajlar | `chats.assign` | Sohbeti başkasına atar (kendine üstlenmek için yazma erişimi yeter) |
| Mesajlar | `quick_replies.manage` | Hazır yanıtları yönetir |
| Mesajlar | `tags.manage` | Etiketleri yönetir (sohbete etiket takmak için yazma erişimi yeter) |
| Yönetim | `users.manage` | Kullanıcıları ve rolleri yönetir |
| Ekranına geç | `impersonate.view` | Başka kullanıcının ekranına geçer (izler) |
| Ekranına geç | `impersonate.send` | Başkasının ekranındayken mesaj gönderir |
| Denetim | `audit.view` | Etkinlik kaydını görür |
| Denetim | `reports.view` | Raporları görür |
| Denetim | `data.export` | Sohbet dökümünü ve etkinlik kaydını indirir (CSV) |

### Numara erişimi

Her kullanıcıya her numara için ayrı bir seviye verilir:

| Seviye | Anlamı |
| --- | --- |
| **Erişim yok** | Numarayı ve sohbetlerini hiç görmez. Sunucu, var olduğunu bile belli etmez (404) |
| **Okuma** | Sohbetleri ve mesajları görür, not ekleyebilir. Yanıt yazamaz, sohbet atayamaz, durum ya da etiket değiştiremez |
| **Yazma** | Okuma + yanıt, sohbet üstlenme, durum ve etiket değişikliği. Rolde `chats.start` varsa yeni sohbet de başlatır |

Kurallar:

- **Yazma erişimi, rolde `messages.send` varsa geçerlidir.** Yoksa numaraya yazma verilmiş olsa bile okuma sayılır. Rol ve numara ataması birbirini tamamlar, hiçbiri tek başına fazladan yetki vermez.
- **`numbers.view_all`** izni olan kullanıcı tüm numaraları atamaya gerek olmadan görür. Erişim seviyesi rolde `messages.send` varsa yazma, yoksa okumadır.

### Koruma kuralları

- Kimse **kendinden yetkili** bir rol oluşturamaz, kendinden yetkili bir kullanıcıya rol veremez ya da onu düzenleyemez/silemez. Sahip olmadığınız bir izni bir role ekleyemezsiniz.
- Kendi rolünüzü değiştiremez, kendi hesabınızı devre dışı bırakamaz, kendinizi silemezsiniz.
- Sistemde **en az bir aktif Patron** kalmak zorundadır.
- Kullanıcısı olan bir rol silinemez. Önce kullanıcılar başka role taşınır.
- **Numara erişimi de sınırlıdır.** `numbers.view_all` izni olmayan bir yönetici, kendi erişiminden fazlasını kimseye veremez: göremediği bir numaraya erişim veremez, yalnızca okuyabildiği bir numarada yazma veremez. Kendi numara erişimini de değiştiremez. Kendi erişmediği bir numaraya erişimi olan kullanıcıyı düzenleyemez, şifresini sıfırlayamaz ya da silemez. Numara yönetimi de yalnızca görebildiği numaralarda çalışır.

> **İpucu:** Ekip liderleri için "Yönetici" gibi bir rol oluşturun: `numbers.view_all`, `messages.send`, `chats.start`, `chats.assign`, `reports.view`. Böylece Patron yetkisi vermeden ekibi yönetebilirler.

---

## Ekranına geç

Yetkili kişi bir ekip üyesinin ekranına geçip paneli **onun gözünden** görür: onun numaraları, onun sohbet listesi, onun erişim seviyeleri. Bunlar her zaman geçen kişinin kendi yetkisiyle sınırlıdır (aşağıdaki güvencelere bakın). Destek vermek, işleyişi denetlemek ya da bir sorunu yerinde görmek için kullanılır. Ekranda kimin ekranında olunduğu açıkça gösterilir ve tek tıkla kendi hesabınıza dönersiniz.

### İki mod

| Mod | Gereken izin | Ne yapılabilir |
| --- | --- | --- |
| **İzleme** | `impersonate.view` | Tamamen salt okunur. Kullanıcının gördüğü sohbetler görülür. Etkin izinlerden yalnızca `numbers.view_all`, `audit.view` ve `reports.view` kalır. Mesaj, not, atama, durum, etiket, numara/etiket/hazır yanıt yönetimi ve dışa aktarma kapalıdır. Tüm numaralar okuma erişimiyle görünür |
| **Adına yazma** | `impersonate.view` + `impersonate.send` | İzlemeye ek olarak, hem kullanıcının hem sizin yazabildiğiniz numaralarda onun adına mesaj gönderilir, sohbet başlatılır, not eklenir |

Adına gönderilen mesajlar ve notlar **"Patron (Ali olarak)"** biçiminde kaydedilir: gerçek gönderen ve adına yazılan kişi birlikte saklanır. Etkinlik kaydında da her iki kişi yer alır. Geçişin başlangıcı ve bitişi (hangi modda olduğuyla birlikte) kayda geçer.

### Güvenceler

- **Kimse geçerek yetki kazanamaz.** Yalnızca izinleri sizinkilerin alt kümesi olan, aktif bir kullanıcının ekranına geçilebilir. Geçiş sırasında etkin izinler, hedefin izinleri ile sizin izinlerinizin **kesişimidir**.
- **Numara erişimi de kesişimdir.** Kullanıcının göremediği numarayı görmezsiniz. Kendi hesabınızla göremediğiniz bir numarayı da onun ekranından göremezsiniz. Ortak numaralarda iki erişimin düşüğü geçerlidir: yazma ancak ikinizde de yazma varsa.
- Geçiş sırasında **kullanıcı/rol yönetimi** ve **yeni bir ekrana geçme** izinleri hiçbir koşulda kullanılamaz. İç içe geçiş yoktur.
- Başkasının ekranındayken **push bildirimi açılamaz**. Böylece bir kullanıcının bildirimleri başka bir tarayıcıya taşınamaz.
- Kendi ekranınıza geçemezsiniz.
- İzlerken **okunmamış sayıları değişmez** ve "şu an bakıyor" listesinde görünmezsiniz. Kullanıcının kendi iş akışı bozulmaz.
- Kurallar her istekte yeniden denetlenir. Hedef kullanıcı devre dışı kalırsa ya da sizin izniniz kaldırılırsa geçiş kendiliğinden sona erer ve kendi hesabınıza dönersiniz. Canlı akış da oturumu her olayda yeniden denetler. Geçiş izni kalkarsa, hesabınız kapatılırsa ya da şifreniz değişirse akış veri göndermeyi bırakır ve kapanır.

**Kurumsal kullanım.** Panel kimin ne yazdığını kaydeder ve yöneticilerin ekip ekranlarını görmesine imkân verir. Ekip üyelerinin bu konuda şirket politikası (KVKK aydınlatma metni gibi) kapsamında bilgilendirilmesi önerilir.

> **İpucu:** Yeni bir ekip üyesinin ilk haftasında ekranına **izleme** modunda geçerek iş akışını sessizce takip edebilirsiniz. Okunmamış sayıları değişmez, üye çalışmasına devam eder.

---

## Hesap yönetimi

**Yönetim → Kullanıcılar** ekranı (`users.manage`):

| İşlem | Ayrıntı |
| --- | --- |
| **Kullanıcı ekleme** | Kullanıcı adı (3–40 karakter; harf, rakam, `.`, `_`, `-`), ad soyad, şifre (en az 6 karakter), rol ve numara erişimleri |
| **Düzenleme** | Ad, rol, şifre sıfırlama, numara erişimleri. Kullanıcı adı sonradan değiştirilemez |
| **Şifre değişikliği** | Şifresi değişen kullanıcının **diğer tüm oturumları** düşer. Kendi şifresini değiştiren yönetici o oturumda kalır, diğer cihazlarından çıkar |
| **Devre dışı bırakma** | Devre dışı kullanıcı giriş yapamaz. Açık oturumu **bir sonraki istekte** düşer. Kayıtları ve geçmişi korunur |
| **Silme** | Kullanıcı kaldırılır. Etkinlik kaydı ve notlarda adı okunur kalır |
| **Son giriş** | Her kullanıcının son giriş zamanı listede görünür |

**Oturum.** Giriş sonrası oturum, imzalı ve `httpOnly` bir çerezde 7 gün geçerlidir. Kullanıcı ve izinleri her istekte veritabanından okunur. Rol, izin ya da hesap durumu değişikliği anında etkili olur, yeniden giriş gerekmez. Şifreler yalnızca hash olarak saklanır. Aynı kullanıcı adıyla aynı adresten art arda 5 hatalı girişten sonra o adresten giriş 5 dakika kilitlenir. Çok sayıda hatalı deneme yapan bir adres 15 dakika engellenir. Ayrıntılar: [Güvenlik](#güvenlik).

**İlk hesap.** Kurulumda ilk Patron hesabı komut satırından oluşturulur:

```sh
bun run user:create patron <şifre> "Ad Soyad" Patron
```

> **İpucu:** İşten ayrılan bir çalışanı silmek yerine **devre dışı bırakın**. Hesap anında kapanır, geçmişteki tüm işlemleri adıyla birlikte kayıtta kalır.

---

## Denetim: etkinlik kaydı ve CSV

### Etkinlik kaydı

**Yönetim → Etkinlik kaydı** (`audit.view`) panelde olan her önemli işlemi kim, kimin adına, ne zaman, neye yaptı bilgisiyle listeler. Kayıtlar yeniden eskiye, 100'erli sayfalar halinde gelir.

| Kategori | Kaydedilen işlemler |
| --- | --- |
| Oturum | Giriş, **hatalı giriş denemesi** (denenen kullanıcı adıyla), çıkış |
| Ekranına geç | Geçiş başladı (izleme / gönderebilir), kendi hesabına döndü |
| Mesajlaşma | Mesaj gönderdi, yeni sohbet başlattı, sohbet atadı, sohbet durumunu değiştirdi, etiketleri değiştirdi, not ekledi/sildi |
| Dışa aktarma | Sohbet dökümünü indirdi, etkinlik kaydını indirdi |
| Yönetim | Numara ekledi/sildi, eşleştirme kodu aldı; kullanıcı, rol, etiket ve hazır yanıt ekleme/güncelleme/silme |

Toplam 29 işlem türü kaydedilir. Tam liste: [api.md](api.md) (`AuditEntry.action`).

**Filtreler.** Kişiye göre filtrelendiğinde, o kişinin kendi yaptıklarıyla birlikte **onun ekranında yapılanlar** da listelenir. İşlem türüne göre de filtrelenebilir.

**Numara sınırı.** Numarayla ilgili kayıtlar (mesaj, atama, not, dışa aktarma, numara ekleme/silme/eşleştirme) yalnızca o numarayı görebilenlere listelenir. `numbers.view_all` izni olan kişi tüm kayıtları görür. Yönetim ve oturum kayıtları numaraya bağlı değildir, etkinlik kaydını görebilen herkese açıktır.

**Kalıcı adlar.** Kayıtlarda kişi adları da saklanır. Kullanıcı sonradan silinse bile geçmiş kayıtlar okunur kalır.

### CSV dışa aktarma

| Dışa aktarma | Gereken izin | İçerik |
| --- | --- | --- |
| **Sohbet dökümü** | `data.export` + sohbeti görebilme | Zaman, yön (gelen/giden), kaynak (Müşteri/Telefondan/Panel), yazan (ekranına geçilerek yazıldıysa "Patron (Ali olarak)"), mesaj |
| **Etkinlik kaydı** | `audit.view` + `data.export` | Seçili filtrelerle en fazla 10.000 kayıt: zaman, kim, kimin adına, işlem, hedef, ayrıntı |

Dosyalar Türkçe Excel'de doğrudan açılır: UTF-8 (BOM'lu) ve `;` ayırıcı. Virgül, noktalı virgül ya da satır sonu içeren hücreler tırnak içine alınır, böylece virgül ayırıcılı Excel ayarlarında da hücreler bölünmez. Hücre başındaki `=`, `+`, `-`, `@` karakterleri etkisizleştirilir, böylece dosya açılırken formül çalışmaz. Her dışa aktarma işleminin kendisi de etkinlik kaydına geçer.

> **İpucu:** Bir müşteri şikâyetinde sohbet dökümünü CSV olarak indirin. Kimin ne zaman ne yazdığı, panelden mi telefondan mı yazıldığı satır satır görünür.

---

## Raporlar

**Yönetim → Raporlar** (`reports.view`) son 1–90 günün (varsayılan 7) özetini verir. Rapor yalnızca kullanıcının görebildiği numaraları kapsar.

| Bölüm | İçerik |
| --- | --- |
| **Toplamlar** | Gelen mesaj, giden mesaj, panelden giden, telefondan giden, mesajlaşılan sohbet sayısı |
| **Cevap süresi** | Ortalama ve medyan cevap süresi, ölçülen cevap sayısı |
| **Günlük dağılım** | Her gün için gelen ve giden mesaj sayısı |
| **Numara bazında** | Her numaranın gelen ve giden mesaj sayısı |
| **Kullanıcı bazında** | Her kullanıcının gönderdiği mesaj sayısı, verdiği ilk cevap sayısı ve ortalama cevap süresi (en çok gönderenden aza) |

**Cevap süresi nasıl ölçülür:** müşterinin cevapsız ilk mesajından, o sohbetteki ilk giden mesaja kadar geçen süre. Genel cevap süresi panelden ve telefondan verilen cevapları kapsar. Kullanıcı bazındaki cevap süresi yalnızca o kullanıcının panelden verdiği cevaplardır. Günler sunucunun saat dilimine göre hesaplanır.

> **İpucu:** Medyan cevap süresi, birkaç çok geç cevaplanmış sohbetten etkilenmez. Ekibin tipik hızını görmek için ortalamayla birlikte medyana da bakın.

---

## Numara yönetimi

**Yönetim → Numaralar** (`numbers.manage`):

| İşlem | Ayrıntı |
| --- | --- |
| **Numara ekleme** | Etiket (ekipte görünen ad, ör. "Satış") ve ülke kodlu telefon. Aynı numara iki kez eklenemez |
| **Eşleştirme kodu** | 8 haneli kod ile telefondan bağlama (adımlar: [README](../README.md#numara-bağlama)). Bağlantı kurulunca ekran kendiliğinden güncellenir |
| **QR ile bağlama** | Kod yerine QR okutarak bağlama |
| **Durumu yenile** | Numaranın bağlantı durumunu yeniden sorgular |
| **Silme** | Numara ve sohbetleri panelden kaldırılır, sunucudaki oturum anahtarları silinir, bağlıysa telefondaki "Bağlı cihazlar" listesinden de çıkarılır |
| **Gelen mesaj simüle et** | Yalnızca test numaralarında: seçilen kişiden sahte gelen mesaj oluşturur |

### Gerçek ve test numaraları yan yana

Her numaranın bir türü vardır. **Gerçek WhatsApp** numaraları WhatsApp'a bağlanır. **Test numaraları** aynı paneli, aynı rolleri ve aynı akışı kullanır ama mesajları WhatsApp'a gitmez. İki tür aynı panelde yan yana durabilir. Test numaraları "Test" rozetiyle ayrışır. Test numaralarının açık olup olmadığı sunucu ayarıdır (`ALLOW_MOCK`, production'da varsayılan olarak kapalı).

**Neden önemli:** Yeni ekip üyeleri gerçek müşterilere dokunmadan paneli öğrenir. Roller ve iş akışları canlıya almadan önce denenebilir.

### Numara durumları

| Durum | Panelde | Anlamı |
| --- | --- | --- |
| `WORKING` | Bağlı | Numara bağlı, mesaj alıp gönderiyor |
| `SCAN_QR_CODE` | Eşleştirme bekliyor | Eşleştirme kodunun ya da QR'ın telefonda girilmesi bekleniyor |
| `STARTING` | Bağlanıyor | Bağlantı kuruluyor ya da kopan bağlantı yeniden kuruluyor |
| `RESTRICTED` | Kısıtlandı | WhatsApp numaraya geçici kısıtlama bildirdi. Gelen mesajlar akmaya devam eder, panelden gönderim 24 saat durdurulur |
| `FAILED` | Yeniden eşleştirme gerekli | Numara telefondan "Bağlı cihazlar" listesinden çıkarıldı ya da WhatsApp bağlantıyı reddetti |
| `STOPPED` | Kapalı | Bağlantı kapalı: eşleştirme süresi doldu, oturum başka bir yerde açıldı ya da yeniden bağlanma denemeleri tamamlandı |

Durum değişiklikleri canlı akışla anında tüm ilgili ekranlara yansır. Sunucu yeniden başladığında daha önce bağlanmış numaralar kendiliğinden yeniden bağlanır.

> **İpucu:** Numaralara ekibin tanıdığı etiketler verin ("Satış", "Destek", "Muhasebe"). Bildirimlerde ve raporlarda numaralar bu adla görünür.

---

## Güvenlik

Biga Panel'de güvenlik kararları sunucuda, her istekte verilir. Arayüz yalnızca yetkili olunan düğmeleri gösterir, asıl denetim API'dedir.

| Koruma | Ne yapar | Neden önemli |
| --- | --- | --- |
| **Giriş kilidi** | Aynı kullanıcı adı ve adresten art arda 5 hatalı denemede 5 dakika, çok sayıda deneme yapan adrese 15 dakika kilit (429). Başka adresten gelen denemeler gerçek kullanıcıyı kilitlemez. Her hatalı deneme adresiyle birlikte etkinlik kaydına geçer | Şifre tahmin denemelerini yavaşlatır ve görünür kılar |
| **Kullanıcı adı sızdırmama** | Var olmayan kullanıcı adında da şifre doğrulaması yapılır. Yanıt süresi ve mesajı aynıdır ("Kullanıcı adı veya şifre hatalı") | Hangi kullanıcı adlarının var olduğu dışarıdan anlaşılmaz |
| **Güvenli oturum çerezi** | İmzalı JWT, `httpOnly`, `SameSite=Lax`, HTTPS'te `Secure`. Çerezde yalnızca kimlik vardır, izinler her istekte veritabanından okunur | Rol değişikliği, devre dışı bırakma ve geçiş iptali anında etkili olur |
| **Şifre değişince oturum düşürme** | Şifresi değişen kullanıcının diğer tüm oturumları geçersiz olur, bildirim abonelikleri silinir. Çıkış yapılan oturumun çerezi kopyalanmış olsa bile sunucuda geçersizdir | Ele geçirilmiş ya da unutulmuş açık oturumlar şifre sıfırlamayla kapanır |
| **CSRF koruması** | Durum değiştiren istekler yalnızca panelin kendi sayfasından kabul edilir (`Sec-Fetch-Site` ya da `Origin` denetimi). Gövdeli istekler `application/json` olmak zorundadır (415) | Başka bir siteden, kullanıcının oturumu kullanılarak işlem yapılamaz |
| **İstek sınırları** | API gövdesi en fazla 1 MB (413). Tüm girdiler şemayla ve uzunluk sınırlarıyla doğrulanır | Aşırı büyük ya da bozuk isteklerle sunucu yorulamaz |
| **Varlık gizleme** | Görülemeyen numara ve sohbetler için "bulunamadı" (404) döner | Yetkisi olmayan kişi bir kaydın var olup olmadığını öğrenemez |
| **Yetki dağıtma sınırı** | Kimse kendinde olmayan bir izni ya da numara erişimini başkasına veremez | Yönetici yetkisi kademeli dağıtılabilir, yetki kendiliğinden büyümez |
| **Ekranına geç sınırları** | İzinler ve numara erişimi iki kişinin kesişimidir. İzleme modu tamamen salt okunurdur. Geçişteyken push açılamaz | Denetim aracı, yetki kazanma aracına dönüşemez |
| **Canlı akışta sürekli denetim** | SSE akışı her olayda oturumu ve numara erişimini yeniden denetler, geçersiz oturumda kapanır | Yetkisi kalkan kişiye bir sonraki mesaj bile gitmez |
| **Push servisi doğrulama** | Bildirim abonelikleri yalnızca bilinen tarayıcı push servislerine (Google, Mozilla, Apple, Microsoft) HTTPS üzerinden kabul edilir | Sunucu, bildirim kılığında rastgele adreslere istek atmaz |
| **Güvenli CSV** | Formül enjeksiyonuna karşı hücre kaçışı | İndirilen dosya Excel'de açılırken komut çalıştıramaz |
| **Kalıcı denetim izi** | Girişler, hatalı denemeler, ekranına geçmeler ve tüm yönetim işlemleri kim/kimin adına bilgisiyle kaydedilir | Her işlemin sorumlusu sonradan da bellidir |

Production kurulumunda HTTPS, güvenlik başlıkları ve yedekleme için: [deploy.md](deploy.md).

---

## Bağlantı yöntemi

Numaralar, WhatsApp Web'in çoklu cihaz protokolü üzerinden (açık kaynak Baileys kütüphanesi) sunucuya **bağlı cihaz** olarak eklenir. Bağlama 8 haneli eşleştirme kodu ya da QR ile yapılır ve cihaz telefondaki "Bağlı cihazlar" listesinde görünür. Bu yöntem resmi WhatsApp Business API değildir. Bu yüzden kullanım doğal kalmalıdır: sizi tanıyan kişilerle, sohbet temposunda yazışma.

### Neden bu yöntem

Bağlı cihaz yöntemi bilinçli bir başlangıç tercihidir. Amaç, ekip gelen kutusunun tamamını kısa sürede ve mevcut numaralarla çalışır halde göstermekti. Bu yöntem için Meta işletme hesabı, işletme doğrulaması, numaranın WhatsApp Business uygulamasına taşınması ya da bir çözüm ortağı üzerinden kayıt gerekmez. Numara, telefondaki WhatsApp'tan birkaç saniyede bağlanır ve telefonda kullanılmaya devam eder.

Yöntem gayriresmidir ve WhatsApp kullanım koşullarının dışında kalır. Bu yüzden panel, numarayı sıradan bir WhatsApp Web kullanıcısından ayırt edilemeyecek şekilde çalıştırmak üzere tasarlandı. Gönderimler insan hızında ve "yazıyor…" göstergesiyle gider. Bağlı cihaz çevrim içi görünmez. Tam geçmiş istenmez. Yeni sohbet açmadan önce numaranın WhatsApp'ta olup olmadığı denetlenir. Kopan bağlantı kontrollü biçimde yeniden kurulur. WhatsApp bir kısıtlama sinyali verirse gönderim kendiliğinden durur. Ban riskini asıl belirleyen kullanım biçimidir. Tanıdık kişilerle, sohbet temposunda yapılan yazışmada risk düşük tutulur. Toplu gönderim ve tanımadığı kişilere ilk mesaj ise riski belirgin artırır. Risk hiçbir koşulda sıfır değildir. WhatsApp protokolü değiştikçe Baileys'in güncellenmesi gerekir.

Resmi yol açık tutuldu. WhatsApp bağlantısı tek bir arayüzün (`MessagingProvider`) arkasındadır. Resmi Cloud API, numaranın hem WhatsApp Business uygulamasında hem API'de çalıştığı *Coexistence* biçimi dahil, yeni bir sağlayıcı olarak eklenebilir. Gelen kutusu, roller, ekranına geç, raporlar ve etkinlik kaydı değişmeden çalışır. Bugün gerçek ve test numaralarının yan yana durması da bu katman sayesindedir. Aynı panelde resmi ve gayriresmi numaralar birlikte kullanılabilir.

Panel bu yöntemin riskini azaltan korumalarla gelir:

| Koruma | Ne yapar |
| --- | --- |
| **İnsan hızında gönderim** | Her numaranın gönderimleri sıraya girer. İki gönderim arasında en az 3–5 saniye bekleme olur, her mesajdan önce mesaj uzunluğuna göre kısa bir "yazıyor…" göstergesi gönderilir |
| **Kısıtlamada otomatik duraklama** | WhatsApp bir mesajı kısıtlama koduyla (463) reddederse numara **Kısıtlandı** durumuna geçer ve panelden gönderim 24 saat durdurulur. Gelen mesajlar akmaya devam eder |
| **Kontrollü yeniden bağlanma** | Kopan bağlantı artan aralıklarla (en fazla 60 sn) ve en fazla 10 kez denenir. Oturum başka bir yerde açıldıysa (440) ya da WhatsApp bağlantıyı reddettiyse (403) yeniden deneme yapılmaz |
| **Yeni sohbet öncesi denetim** | Yeni sohbet başlatmadan önce numaranın WhatsApp kullanıp kullanmadığı sorgulanır. Kullanmayan numaraya mesaj gönderilmez |
| **Çevrim içi görünmeme** | Bağlı cihaz bağlandığında "çevrim içi" durumu yayınlamaz |
| **Tam geçmiş eşitlemesi yok** | Bağlanırken tüm mesaj geçmişi istenmez. Yalnızca WhatsApp'ın her bağlı cihaza gönderdiği son sohbetler alınır, her sohbetten son 5 mesaj kaydedilir |

Oturum anahtarları sunucuda `BAILEYS_AUTH_DIR` klasöründe numara başına saklanır. Bu klasör numaraya erişim anlamına geldiği için gizli tutulmalı ve yedeklenmelidir. Aynı oturum aynı anda tek bir sunucuda çalışmalıdır. Production kurulumu için: [deploy.md](deploy.md).

### Gerçek numarayla doğrulama

Bağlantı katmanı 28 Ekim 2026'da gerçek bir WhatsApp numarasıyla uçtan uca denendi. Telefondan 8 haneli eşleştirme koduyla bağlanan numara birkaç saniyede **Bağlı** durumuna geçti. İlk eşitlemede 96 bire bir sohbet son mesajlarıyla ve 267 rehber adı panele geldi. Gizli kimlikle (LID) yazan bir kişinin sohbeti doğru telefon numarasıyla eşleşti. Gelen mesaj sayfa yenilenmeden listeye düştü, panelden verilen yanıt da karşı tarafa ulaştı. Grup ve kanal mesajları beklendiği gibi dışarıda kaldı.

---

## Yapılabilir ama bilerek eklenmeyenler

Aşağıdakiler kullanılan altyapıyla mümkündür. Şimdilik değerleri, getirdikleri risk ve bakım yüküne değmediği için eklenmedi. İhtiyaç olursa nasıl yapılacağı da not edildi.

| Özellik | Neden şimdilik yok | Eklenirse nasıl |
| --- | --- | --- |
| **Kişi profil fotoğrafları** | Ekip gelen kutusunda kişiyi tanıtan bilgi ad ve numaradır, ikisi de gösteriliyor. Fotoğraf için her kişiye ayrı WhatsApp sorgusu gerekir. Kısa sürede çok sayıda profil sorgulamak bağlı bir cihaz için doğal olmayan bir kullanım profili oluşturur. Fotoğraf adresleri birkaç günde geçersizleşir ve fotoğraflar kişisel veridir (KVKK) | Fotoğraf yalnızca açılan sohbet için ve günde en fazla bir kez çekilir (Baileys `profilePictureUrl`). Sunucuda önbelleğe alınır, numaraya erişimi olanlara yetki denetimli bir uç noktadan sunulur. Kişi fotoğrafını gizlediyse baş harfler kalır |
| **Numaranın kendi profili** (ad, fotoğraf) | Numaraya verilen etiket ("Satış", "Destek") ekipte bu işi zaten görüyor | Bağlantıda gelen profil adı ve aynı fotoğraf yöntemi |
| **Medya içeriği** (fotoğraf, ses, belge) | Mesajlar `[Fotoğraf]` gibi etiketlerle görünür. İndirmek depolama, saklama süresi ve erişim denetimi gerektirir | Medya istek üzerine indirilir, sınırlı süre saklanır, sohbete erişimi olanlara sunulur |
| **Resmi WhatsApp bağlantısı** (Cloud API / Coexistence) | İlk sürümde hızlı ve işletme hesabı gerektirmeyen bağlantı seçildi (bkz. [Neden bu yöntem](#neden-bu-yöntem)) | `MessagingProvider` arayüzünü uygulayan yeni bir sağlayıcı. Numara türü `baileys` / `mock` yanına üçüncü bir tür olarak eklenir |
| **Grup sohbetleri** | Panel müşteriyle bire bir yazışma için tasarlandı. Gruplarda atama, cevap süresi ve "kim yazdı" kavramları farklı işler | Gruplar ayrı bir sohbet türü olarak alınır, katılımcı adlarıyla gösterilir |
| **Çok sunuculu ölçek** | Tek süreç ve SQLite, küçük ve orta ekipler için kurulumu ve yedeklemeyi basit tutar. Bağlı cihaz oturumu zaten tek yerde çalışmak zorundadır | Veritabanı katmanı PostgreSQL'e taşınır. Canlı akış için ortak bir yayın kanalı (ör. Redis) eklenir |
| **Daha eski mesaj geçmişi** | İlk eşitlemede her sohbetin son 5 mesajı alınır. Tam geçmiş istemek bağlantı sırasında yük ve risk getirir | Sohbet başına istek üzerine geçmiş (Baileys `fetchMessageHistory`) |
