# Sibergüvenlik to Cisco Umbrella Sync Agent

Bu proje, [Sibergüvenlik](https://siberguvenlik.gov.tr/) API'sinden tehdit istihbaratı domain listelerini çeken ve [Cisco Umbrella](https://umbrella.cisco.com/) platformuna otomatik olarak aktaran hafif, hızlı ve kararlı bir entegrasyon aracıdır.

---

## 🏗️ Mimari ve İşleyiş

Sistem, veri çekme (Fetch) ve veriyi yükleme (Upload) aşamalarını birbirinden ayırarak maksimum verimlilik ve hata toleransı sağlar.



```text
[Sibergüvenlik API] --> (Delta Fetch) --> [domains.txt] --> (Batch Upload) --> [Cisco Umbrella]
                                               ^
                                               |
                                        [state.json (lastRun)]



 📋 Temel Özellikler
Delta Senkronizasyonu: date_gte parametresi sayesinde sadece en son çalıştırılmadan sonra eklenen yeni domainleri çeker.

API Hız Sınırı (Rate Limiting) Yönetimi: Cisco Umbrella'nın 200 domain/dakika kısıtlamasına uyum sağlar; limit yaklaştığında otomatik olarak beklemeye geçer.

Hata Toleransı (Resilience): Fetch ve Upload aşamaları birbirinden bağımsızdır. Hata durumunda tüm veriyi tekrar çekmeden kaldığınız yerden devam edebilirsiniz.

Durum Takibi: state.json dosyası ile en son hangi tarihe kadar veri çekildiğini hatırlar.

Hafif Yapı: Ekstra ağır altyapı gerektirmez, doğrudan Node.js üzerinde çalışır.

🚀 Kurulum
Gereksinimler: Node.js (v16 veya üzeri) yüklü olmalıdır.

Paketleri Yükleyin:

Bash
npm install axios
💻 Kullanım Talimatları
1. Tam Senkronizasyon (Fetch + Upload)
Sistemi ilk kez çalıştırıyorsanız veya tüm güncellemeleri çekip yüklemek istiyorsanız:

Bash
node index.js
Bu komut önce API'den yeni domainleri çeker, ardından Cisco Umbrella'ya yükler.

2. Sadece Yükleme (Upload - --skip-fetch)
Eğer daha önce veri çektiyseniz (veya domains.txt dosyanız doluysa) ve API'yi tekrar yormadan sadece mevcut listeyi Cisco Umbrella'ya yüklemek istiyorsanız:

Bash
node index.js --skip-fetch
📂 Dosya Yapısı
index.js: Ana otomasyon scripti.

state.json: Senkronizasyonun kaldığı son zaman bilgisini (lastRun) saklar. Delta fetch için kritik öneme sahiptir.

domains.txt: Yerel "kaynak" dosyası; çekilen tüm domainlerin listesi burada birikir.

⚙️ Yapılandırma
index.js dosyasının üst kısmındaki değişkenleri kendi ortamınıza göre güncelleyin:

UMBRELLA_URL: Cisco Umbrella customerKey içeren uç noktanız.

BATCH_SIZE: Varsayılan olarak 200 (API limitine göre).

TOTAL_PAGES: API'deki toplam sayfa sayısı.

🔧 Hata Giderme
"No such file" hatası: Scripti ilk kez normal (parametresiz) modda çalıştırdığınızdan emin olun; dosyalar ilk çalıştırmada oluşturulur.

429 Too Many Requests: Script bunu otomatik yönetir ve bekler, müdahale etmenize gerek yoktur.

400 Bad Request: customerKey değerinizi ve JSON gövdesinin Umbrella API şemasına uygunluğunu kontrol edin.

Bu proje, Threat Intelligence süreçlerini otomatize etmek amacıyla "Enterprise-Lite" mimari prensiplerine göre tasarlanmıştır.                                   