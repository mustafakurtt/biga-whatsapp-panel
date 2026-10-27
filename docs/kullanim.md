# Biga Panel: Günlük Kullanım Rehberi

Bu rehber paneli her gün kullanacak kişiler içindir. Her rol için adım adım, sade bir anlatım sunar. Özelliklerin ayrıntısı [ozellikler.md](ozellikler.md) dosyasındadır.

> Ekranda yalnızca yetkili olduğunuz bölümler ve düğmeler görünür. Bir şeyi göremiyorsanız rolünüzde o izin yoktur ya da o numaraya erişiminiz yoktur. Yöneticinize başvurun.

---

## Herkes için: ilk adımlar

1. **Giriş yapın.** Yöneticinizin verdiği kullanıcı adı ve şifreyle giriş yapın. Oturumunuz bu cihazda 7 gün açık kalır. Şifre art arda 5 kez yanlış girilirse bu cihazdan giriş 5 dakika kilitlenir, sonra yeniden deneyebilirsiniz. Başka birinin hatalı denemeleri sizi kilitlemez.
2. **Paneli uygulama olarak kurun (önerilir).** Telefonda tarayıcının menüsünden *Ana ekrana ekle* seçeneğini kullanın. Bilgisayarda adres çubuğundaki *Yükle* simgesine tıklayın.
3. **Bildirimlere izin verin.** Panel sorduğunda izin verin. Böylece panel kapalıyken de yeni mesajlardan haberiniz olur. iPhone'da bildirimler, panel ana ekrana eklendikten sonra çalışır.
4. **Temayı seçin.** Açık, koyu ya da cihazınızın temasını izleyen görünüm.

---

## Patron

Patron panelin tüm yetkilerine sahiptir. Rolü değiştirilemez ve sistemde her zaman en az bir aktif Patron bulunur.

### Kurulumdan sonra bir kez

1. **Numaraları bağlayın.** *Yönetim → Numaralar → Numara ekle*. Etiket (ör. "Satış") ve telefonu girin, **Eşleştirme kodu al** deyin. Telefonda: *WhatsApp → Ayarlar → Bağlı cihazlar → Cihaz bağla → "Bunun yerine telefon numarasıyla bağlan"* ve kodu girin. Durum **Bağlı** olunca hazırsınız.
2. **Rolleri gözden geçirin.** *Yönetim → Roller*. Hazır gelen *Temsilci* ve *Salt okunur* rollerini olduğu gibi kullanabilir ya da kendi rollerinizi oluşturabilirsiniz (aşağıdaki [Denetçi](#özel-rol-örneği-denetçi) örneğine bakın).
3. **Ekibi ekleyin.** *Yönetim → Kullanıcılar → Yeni kullanıcı*. Ad, kullanıcı adı, ilk şifre ve rolü girin. Ardından **Numara erişimi** bölümünde her numara için *Erişim yok*, *Okuma* ya da *Yazma* seçin.
4. **Etiketleri ve hazır yanıtları hazırlayın.** *Yönetim → Etiketler* ("Sipariş", "Şikâyet", "Teklif"…) ve *Yönetim → Hazır yanıtlar* (adres, çalışma saatleri, ödeme bilgisi…).
5. **Push bildirimleri** sunucuda açık değilse teknik sorumludan VAPID anahtarlarının tanımlanmasını isteyin.

### Her gün

1. **Gelen kutusuna bakın.** Numaralar arasında geçin. **Atanmamış** filtresiyle yeni talepleri görün ve ilgili kişiye atayın.
2. **Ekibi takip edin.** Bir ekip üyesinin ekranına geçmek için *Ekranına geç* seçeneğini kullanın ve kişiyi seçin. İzleme modu tamamen salt okunurdur ve izlediğiniz sürece onun okunmamış sayıları değişmez. İşiniz bitince tek tıkla kendi hesabınıza dönün. Bildirimleri yalnızca kendi hesabınızdayken açabilirsiniz. Onun adına yazarsanız mesaj "Patron (Ali olarak)" diye kaydedilir.
3. **Raporlara bakın.** *Yönetim → Raporlar*: gelen ve giden mesajlar, numara ve kişi bazında dağılım, ortalama ve medyan cevap süresi. Dönemi 1 ile 90 gün arasında seçin.
4. **Etkinlik kaydını kontrol edin.** *Yönetim → Etkinlik kaydı*: girişler, hatalı giriş denemeleri, gönderilen mesajlar ve yönetim değişiklikleri. Kişiye ya da işleme göre filtreleyin, gerekirse CSV olarak indirin.

### Ara sıra

- **Çalışan ayrıldığında:** kullanıcıyı silmek yerine **devre dışı bırakın**. Hesap anında kapanır, geçmişi adıyla kayıtta kalır.
- **Şifre unutulduğunda ya da bir cihaz kaybolduğunda:** kullanıcıyı düzenleyip yeni şifre girin. Şifre değişince o kullanıcının diğer tüm cihazlardaki oturumları kapanır.
- **Yetki dağıtırken:** kimse kendinde olmayan bir izni ya da numara erişimini başkasına veremez. Ekip lideri gibi kullanıcı yöneten bir rol, yalnızca kendi görebildiği numaralara erişim dağıtabilir (rolde `numbers.view_all` yoksa).
- **Numara "Yeniden eşleştirme gerekli" görünüyorsa:** numara telefondan *Bağlı cihazlar* listesinden çıkarılmıştır. Yeniden eşleştirme kodu alıp bağlayın.
- **Numara "Kısıtlandı" görünüyorsa:** WhatsApp numaraya geçici kısıtlama bildirmiştir. Gelen mesajlar panele düşmeye devam eder, panelden gönderim 24 saat durur. Bu sürede gerekli yanıtları telefondaki WhatsApp uygulamasından verin. O mesajlar da panelde "Telefondan" olarak görünür.

---

## Temsilci

Temsilci müşteri mesajlarını yanıtlar ve yeni sohbet başlatır. Yalnızca kendisine *Yazma* erişimi verilen numaralarda yazabilir.

### Güne başlarken

1. Gelen kutusunu açın ve çalıştığınız numarayı seçin.
2. **Benim** filtresiyle size atanmış sohbetlere bakın.
3. **Atanmamış** filtresinde bekleyen talepleri görün. İlgileneceğiniz sohbeti **kendinize atayın**, böylece ekip o sohbetle sizin ilgilendiğinizi görür.

### Bir sohbeti yanıtlarken

1. Sohbeti açın. Okunmamış sayısı kendiliğinden sıfırlanır.
2. Üstte başka bir ekip arkadaşının adı "şu an bakıyor" olarak görünüyorsa, aynı müşteriye iki kişi birden yazmamak için önce onunla konuşun.
3. Yanıtınızı yazın ya da **hazır yanıtlardan** birini seçip gerekirse düzenleyin, ardından gönderin.
4. Ekip arkadaşlarınız için bir bilgi bırakmak istiyorsanız **not** ekleyin. Notları müşteri görmez.
5. Sohbete uygun **etiketleri** takın ("Sipariş", "Şikâyet"…).
6. İş bittiğinde sohbeti **kapatın**. Müşteri yeniden yazarsa sohbet kendiliğinden açılır.

### Yeni sohbet başlatma

1. Numarayı seçin ve yeni sohbet başlatın.
2. Müşterinin telefonunu (`0555…` ya da `+90 555…` biçiminde) ve ilk mesajı yazın.
3. Numara WhatsApp kullanmıyorsa panel bunu bildirir ve mesaj gönderilmez.

**İyi kullanım.** Panel mesajları sırayla ve doğal bir hızda gönderir. Ardı ardına gönderdiğiniz mesajların birkaç saniye arayla gitmesi normaldir. Panelden yalnızca sizi tanıyan kişilerle, normal sohbet temposunda yazışın.

### Bir mesajı bulmak

Üstteki arama ile görebildiğiniz tüm numaralarda mesaj metni arayabilirsiniz (en az 2 karakter). Sohbet listesindeki arama kutusu ise o numarada kişi adı, telefon ya da son mesaja göre arar.

---

## Salt okunur

Salt okunur kullanıcı, kendisine atanan numaraların sohbetlerini okur. Mesaj göndermez, sohbet başlatmaz, atama yapmaz, durum ya da etiket değiştirmez. Muhasebe, kalite ya da yönetim asistanı gibi bilgiye ihtiyaç duyan ama müşteriye yazmayan kişiler için uygundur.

1. Gelen kutusunda size açılan numaraları ve sohbetlerini görürsünüz. Yeni mesajlar sayfa yenilemeden gelir.
2. Filtreleri (Okunmamış, Atanmamış, Açık/Kapalı, etiket) ve aramayı kullanarak ilgilendiğiniz sohbetleri bulun.
3. Ekibe bilgi iletmek için sohbete **not** ekleyebilirsiniz ("Fatura kesildi" gibi). Notu müşteri görmez.
4. Bildirimlere izin verirseniz, görebildiğiniz numaralara gelen mesajlardan haberdar olursunuz.

---

## Özel rol örneği: Denetçi

Roller ihtiyaca göre tasarlanır. Örneğin tüm numaraları okuyabilen, kayıtları ve raporları inceleyen ama müşteriye yazmayan bir **Denetçi** rolü:

**Rolü oluşturmak (Patron ya da `users.manage` yetkisi olan biri):**

1. *Yönetim → Roller → Yeni rol*. Ad: **Denetçi**.
2. Şu izinleri işaretleyin:
   - `numbers.view_all`: atama gerekmeden tüm numaraları görür (mesaj gönderme izni olmadığı için okuma erişimiyle)
   - `audit.view`: etkinlik kaydını görür
   - `reports.view`: raporları görür
   - `data.export`: sohbet dökümünü ve etkinlik kaydını CSV olarak indirir
3. Kaydedin ve kişiye *Yönetim → Kullanıcılar* ekranından bu rolü verin. `numbers.view_all` sayesinde numara erişimlerini tek tek atamanız gerekmez.

**Denetçinin günü:**

1. *Yönetim → Raporlar* ile dönemin mesaj hacmine ve cevap sürelerine bakar. Cevap süresi uzayan numaraları ya da kişileri belirler.
2. *Yönetim → Etkinlik kaydı* ile belirli bir kişinin işlemlerini filtreler: kendi yaptıkları ve onun ekranında yapılanlar birlikte listelenir.
3. İncelenen bir sohbeti CSV olarak indirir: her satırda zaman, yön, kaynak (Müşteri / Telefondan / Panel) ve yazan kişi bulunur.
4. Bulgularını sohbete **not** olarak bırakabilir.

**Ekranına geç hakkında.** Bir role `impersonate.view` eklemek mümkündür. Ancak bir kişinin ekranına yalnızca izinleri sizinkilerin alt kümesi olan kullanıcılar için geçilebilir. Yukarıdaki Denetçi rolünde `messages.send` olmadığı için bu rol, Temsilci'lerin ekranına geçemez. Kimse ekranına geçerek fazladan yetki kazanamaz. Temsilci ekranlarını izlemesi gereken bir rol, Temsilci'nin izinlerini de içermelidir.

---

## Bilinmesi iyi olanlar

- Panelden gönderilen her mesaj, gönderenin adıyla kaydedilir. Yöneticiler ekip üyelerinin ekranını görebilir. Bu kullanım şirket politikası (KVKK aydınlatması gibi) çerçevesinde ekibe duyurulmalıdır.
- Fotoğraf, video, ses kaydı ve belge gibi içerikler panelde `[Fotoğraf]`, `[Ses kaydı]` gibi etiketlerle görünür. İçeriği görmek için numaranın telefonundaki WhatsApp'ı kullanın.
- Numara ilk bağlandığında son sohbetler panele gelir, her sohbetten son 5 mesajla. Bunlar okunmamış sayılmaz. Daha eski mesajlar için telefondaki WhatsApp'ı kullanın.
- Sohbetler telefonunuzun rehberindeki adla görünür. Rehberde kayıtlı değilse kişinin WhatsApp profil adı, o da yoksa numarası görünür.
