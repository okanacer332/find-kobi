# KobiFind - KOBİ Kazıyıcı ve Lider Bulma Platformu

KobiFind, belirli bir sektör dikeyinde ve konumdaki KOBİ'leri (Küçük ve Orta Büyüklükteki İşletmeleri) bulup verilerini toplayan, modern ve premium tasarımlı bir tam yığın (full-stack) web uygulamasıdır. 

Sistem Google Haritalar (Google Maps) sonuçlarını tarar; bulduğu işletmelerin web sitelerine giderek e-posta, telefon ve içerik analizi yapar. İsteğe bağlı olarak **Gemini 1.5 Flash API** entegrasyonu sayesinde, şirket sitelerindeki metinleri yapay zekayla anlamlandırarak **Şirket Sahibi / Kurucusu** adını ve **2-3 cümlelik Türkçe şirket özetlerini** çıkarabilir.

## Temel Özellikler

1. **Google Haritalar Kazıyıcı**: Puppeteer tarayıcısı ile herhangi bir sektörel kelimeyi ve konumu (örn. "Zirai İlaç Bayileri, Yalova") aratıp sonuçları kaydırarak toplar.
2. **Derin Web Crawler**: Şirket sitelerinin ana sayfa, İletişim ve Hakkımızda sayfalarını tarayarak e-posta ve alternatif telefon numaralarını çeker.
3. **Yapay Zeka ile Zenginleştirme (Gemini AI)**: Şirket web sitelerinin içeriğini analiz edip şirket yöneticisini/sahibini ve şirket faaliyet özetini bulur.
4. **Gerçek Zamanlı Terminal**: Socket.io bağlantısı sayesinde, tarayıcının o anda ne yaptığını, hangi işletmeyi incelediğini anlık olarak log akışından takip edebilirsiniz.
5. **Gelişmiş Şirket Veri Tabanı**: Çekilen tüm verileri anında arama, kampanya bazlı filtreleme, puan filtreleme ve e-posta durum filtrelemesi ile inceleyebilirsiniz.
6. **Excel / CSV Dışa Aktarma**: Toplanan verileri Türkçe karakter sorunu olmadan (UTF-8 BOM desteği ile) MS Excel formatında indirebilirsiniz.

## Klasör Yapısı

* **`backend/`**: Express, Puppeteer, Socket.io ve `database.js` (local JSON veritabanı `db.json` yönetimi) sunucu kodlarını barındırır.
* **`frontend/`**: React, Vite, Vanilla CSS ve Lucide-react simgeleriyle premium arayüz kodlarını barındırır.
* **`run.bat`**: Windows için kolay başlatıcı betik.

## Kurulum ve Çalıştırma

Uygulamayı çalıştırmak son derece basittir:

1. Proje ana klasöründeki (`find-kobi/`) **`run.bat`** dosyasına çift tıklayın.
2. Betik, gerekli bağımlılıkları (`node_modules`) kontrol eder, eksikse otomatik yükler.
3. Ardından sunucu (Port 5000) ve arayüz (Port 5173) sunucularını paralel başlatır.
4. Tarayıcınızda otomatik olarak `http://localhost:5173` adresi açılacaktır.

*Not: Arka planda açılan iki adet siyah komut satırı penceresini kapatmayın. Uygulamayı sonlandırmak istediğinizde bu pencereleri kapatabilirsiniz.*

## Yapay Zeka Ayarları (Gemini API)

* Uygulama açıldıktan sonra sol menüdeki **Sistem Ayarları** sekmesine gidin.
* Google AI Studio üzerinden aldığınız ücretsiz veya düşük ücretli **Gemini API Anahtarınızı** ilgili kutuya yapıştırıp kaydedin.
* Bu andan itibaren başlatacağınız tüm tarama kampanyalarında, web sitesine sahip olan KOBİ'lerin sahipleri ve özetleri yapay zeka tarafından tespit edilerek veri tabanınıza eklenecektir. (Eğer API anahtarı girilmezse, kural tabanlı regex analizcisi ve meta açıklamalarıyla veri çekimi devam eder).
