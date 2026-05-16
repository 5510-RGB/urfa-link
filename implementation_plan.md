# Urfa-Link Mobil Uygulama (Capacitor) Dönüşüm Planı

Projeni web platformundan çıkarıp gerçek bir mobil uygulama (.apk / .aab) haline getirmek için kod mimarisinde bazı ayarlamalar yapmamız gerekiyor.

## Neden Bu Değişiklikler Gerekiyor?
Mobil uygulama telefona kurulduğunda kendi içindeki [index.html](file:///c:/Users/mehme/OneDrive/Masa%C3%BCst%C3%BC/antigraviti%20denme/urfa_link/static/index.html) ve [app.js](file:///c:/Users/mehme/OneDrive/Masa%C3%BCst%C3%BC/antigraviti%20denme/urfa_link/static/app.js) dosyalarını çalıştırır. Şu ana kadar sayfaların ("/") ve API isteklerinin ("/users/register" vb.) hepsi aynı sunucuda olduğu düşünülerek yazıldı. Ancak mobil uygulama dosyaları telefonda (Örn: `file://` veya `http://localhost`) çalışırken, API isteklerinin internetteki **Render (urfa-link.onrender.com)** sunucunuza gitmesi gerekecek. 

Ayrıca FastAPI sunucun şu an dışarıdan gelen (farklı domain/mobil app) isteklere güvenlik sebebiyle kapalıdır (CORS Hatası).

## Proposed Changes

### 1. Backend (FastAPI) CORS İzinleri (Cross-Origin Resource Sharing)
Mobil uygulamanın (telefonun içindeki adresin) Render'daki API'ye erişebilmesi için FastAPI'ye `CORSMiddleware` ekleyeceğiz.

#### [MODIFY] [main.py](file:///c:/Users/mehme/OneDrive/Masa%C3%BCst%C3%BC/antigraviti%20denme/urfa_link/main.py)
- `fastapi.middleware.cors.CORSMiddleware` içeri aktarılacak.
- `app.add_middleware(...)` ile mobil uygulamanın API'ye erişmesine (Okuma/Yazma) izin verilecek.

### 2. Frontend (JavaScript) API Adreslerinin Güncellenmesi
Telefondaki uygulamanın API olarak kendi içindeki dosyaları değil, Render sunucusunu hedef almasını sağlayacağız.

#### [MODIFY] [static/app.js](file:///c:/Users/mehme/OneDrive/Masa%C3%BCst%C3%BC/antigraviti%20denme/urfa_link/static/app.js)
- Dosyanın en üstüne bir `API_BASE_URL` değişkeni eklenecek (Eğer uygulamadaysa `https://urfa-link.onrender.com` olacak).
- Dosya içindeki tüm `fetch('/users/...')` ve `fetch('/admin/...')` komutları `fetch(API_BASE_URL + '/users/...')` şeklinde güncellenecek.
- WebSocket bağlantısı da (Chat için) `wss://urfa-link.onrender.com` şeklinde güncellenecek.

### 3. Capacitor Kurulumu
Node.js ve NPM kullanılarak web projemizin içine mobil altyapı kurulacak.

#### [NEW] `package.json` ve `capacitor.config.ts`
- Terminal üzerinden `npm install @capacitor/core @capacitor/cli` çalıştırılacak.
- `npx cap init urfalink com.urfalink.app --web-dir static` komutuyla proje başlatılacak.
- `npx cap add android` komutu ile Android klasörü (uygulaması) oluşturulacak.

## User Review Required
> [!IMPORTANT]
> Bu plan, projenizin Android Studio ile açılıp **APK** olarak derlenebilir hale gelmesini sağlayacaktır. Onaylıyorsan kodları düzenlemeye ve kurulumlara hemen başlayacağım!
