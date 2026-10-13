# <img src="mms/assets/icons/logo.svg" alt="Multi Media Studio logosu" width="64" height="64" align="center"> Multi Media Studio

Videolarınızı çok kanallı bir zaman çizelgesiyle doğrudan tarayıcınızda düzenleyin.

Multi Media Studio, kliplerinizi kesmenizi, katmanlamanızı, renklendirmenizi, başlık ve müzik eklemenizi, ardından MP4 veya WebM olarak dışa aktarmanızı sağlayan açık kaynaklı bir video düzenleyicidir. Telefonda mobil video düzenleyicilerine benzeyen bir yerleşim, masaüstünde ise tam bir çalışma alanı sunar.

Tüm işlemler tarayıcınızda yerel olarak gerçekleşir. Medyanız hiçbir sunucuya yüklenmez. Projeler yalnızca bu tarayıcıda, bu cihazda saklanır.

🌐 **Canlı Demo Bağlantısı :** https://aligokdam.github.io/multi.media.studio/

---

## Özellikler

- 🎞️ Çok kanallı zaman çizelgesi: video, fotoğraf, metin, müzik ve ses
- ✂️ Bölme, kırpma, çoğaltma, hız ve ses ayarı, geri al ve yinele
- 🎨 Renk filtreleri, Cutout ve diğer GPU efektleri, geçişler
- 🔤 Giriş ve çıkış hareketli başlıklar, kendi yazı tiplerinizi ekleme
- 😀 Hazır çıkartmalar ve kendi görselleriniz
- 🎵 Telifsiz müzik ve ses efektleri (CC0)
- 🖼️ Fotoğraf düzenleyici ve kolaj
- 💾 8K'ya kadar, 24 ile 60 fps arası MP4 ve WebM dışa aktarma
- 📱 Telefon, tablet ve bilgisayar, açık ve koyu tema, birçok dil
- 🔒 Her şey cihazınızda, hiçbir şey yüklenmez

---

## Nasıl Çalışır

1. Oluştur'a basıp fotoğraf ya da video seçin. Fotoğraflar fotoğraf düzenleyicide, videolar video düzenleyicide açılır.
2. Video, fotoğraf ve ses ekleyin.
3. Zaman çizelgesinde düzenleyin: kesin, başlık, geçiş, efekt ve renk ekleyin.
4. Videonuzu MP4 veya WebM olarak dışa aktarın.

---

## Proje Yapısı

Kökte yalnızca üç dosya vardır. Uygulama iki klasöre bölünmüştür: `mms/` uygulamanın kendisini (kod, bileşenler, stiller), `m.m.s/` ise diller, kütüphaneler, örnekler, betikler ve tek dosyalık sürümü içerir. Böylece her iki klasör de GitHub'ın tek seferde yükleme sınırının altında kalır. Klasör adları İngilizcedir ve her klasörün ne işe yaradığı `m.m.s/DOCS.md` rehberinde anlatılır.

```text
multi.media.studio/
├── index.html              ana sayfa ve koşullar (uygulamanın giriş noktası)
├── README.md               bu dosya
├── LICENSE                 MIT lisansı
├── mms/                    uygulama
│   ├── app.webmanifest     uygulama kimliği: ad, simge, renk (ana ekrana ekleme)
│   ├── assets/
│   │   ├── css/            base, landing, studio, photo-editor stilleri
│   │   ├── icons/          uygulama simgeleri ve README logosu
│   │   └── fonts/          açık lisanslı yazı tipleri (tek dosyada) ve lisans metinleri
│   ├── src/
│   │   ├── main.js, boot.js, config.js
│   │   ├── core/           ortak yardımcılar, dil, ayarlar ve tema, simgeler
│   │   ├── studio/         proje listesi, video düzenleyici, zaman çizelgesi, denetçi
│   │   ├── photo-editor/   fotoğraf düzenleyici ve kolaj
│   │   ├── media/          dosya içeri aktarma ve doğrulama
│   │   ├── render/         WebGL birleştirici, efektler, filtreler, geçişler, metin, yazı tipleri, çıkartmalar
│   │   ├── audio/          müzik ve ses efektlerini üreten sentezleyici
│   │   ├── export/         MP4 ve WebM dışa aktarma
│   │   ├── storage/        yerel depolama ve .mmsp paketleri
│   │   └── workers/        dalga biçimi ve zaman esnetme işçileri
│   └── components/         ortak arayüz bileşenleri ve kütüphane panelleri
└── m.m.s/                  uygulamanın yanındaki dosyalar
    ├── DOCS.md             geliştirici rehberi (her klasörün açıklaması)
    ├── locales/            diller
    ├── libraries/          mediabunny (MPL-2.0), fflate (MIT)
    ├── examples/           örnek efekt ve geçiş dosyaları
    ├── standalone/         tek dosyalık sürüm (index.html klasörden açılınca bunu kullanır)
    └── scripts/            dil denetleyici, tek dosya derleme
```

Yerel olarak çalıştırmanın en kolay yolu `index.html` dosyasını çift tıklayarak açmaktır. Tarayıcılar klasörden açılan sayfalarda modülleri engellediği için uygulama bu durumda otomatik olarak `m.m.s/standalone/multi-media-studio.html` sürümüne geçer. İsterseniz klasörü bir statik sunucuyla da sunabilirsiniz (örneğin `python3 -m http.server`).
`python3 m.m.s/scripts/build-single.py` bu tek dosyalık sürümü yeniden derler.

---

## License

MIT License

---

Created by **Ali Gökdam**
