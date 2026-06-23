# Sibergüvenlik to Cisco Umbrella Sync Agent

Bu proje, [Sibergüvenlik](https://siberguvenlik.gov.tr/) API'sinden tehdit istihbaratı domain listelerini çeken ve [Cisco Umbrella](https://umbrella.cisco.com/) platformuna otomatik olarak aktaran hafif, hızlı ve kararlı bir entegrasyon aracıdır.



## Temel Özellikler
- **Delta Senkronizasyonu:** `date_gte` parametresi sayesinde sadece en son çalıştırılmadan sonra eklenen yeni domainleri çeker.
- **API Hız Sınırı (Rate Limiting) Yönetimi:** Cisco Umbrella'nın 200 domain/dakika kısıtlamasına uyum sağlar; limit yaklaştığında otomatik olarak beklemeye geçer.
- **Hata Toleransı (Resilience):** Fetch (veri çekme) ve Upload (yükleme) aşamaları birbirinden bağımsızdır. Hata durumunda tüm veriyi tekrar çekmeden kaldığınız yerden devam edebilirsiniz.
- **Durum Takibi:** `state.json` dosyası ile en son hangi tarihe kadar veri çekildiğini (bookmark) hatırlar.
- **Hafif Yapı:** Ekstra ağır altyapı gerektirmez, doğrudan Node.js üzerinde çalışır.

## Gereksinimler
- [Node.js](https://nodejs.org/) (v16 veya üzeri)
- Gerekli paketlerin kurulumu:
  ```bash
  npm install axios dotenv