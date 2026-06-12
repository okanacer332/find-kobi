import { runScraper } from './scraper.js';
import { initDb, getSettings } from './database.js';

async function test() {
  console.log('--- KOBİ Kazıyıcı Test Başlatılıyor ---');
  await initDb();
  
  const campaignId = 'test_campaign';
  const keyword = 'Zirai İlaç';
  const location = 'Yalova';

  try {
    await runScraper(
      campaignId,
      keyword,
      location,
      // onLog
      (msg) => console.log(`[LOG] ${msg}`),
      // onLeadFound
      async (lead) => {
        console.log('\n🌟 YENİ ŞİRKET BULUNDU:');
        console.log(`- İsim: ${lead.name}`);
        console.log(`- Tel: ${lead.phone}`);
        console.log(`- Web: ${lead.website}`);
        console.log(`- E-posta: ${lead.email}`);
        console.log(`- Sahibi: ${lead.owner}`);
        console.log(`- Özet: ${lead.summary}`);
        console.log('-------------------------\n');
      },
      // getSettings
      getSettings
    );
    console.log('--- Test Başarıyla Tamamlandı! ---');
  } catch (error) {
    console.error('Test sırasında hata oluştu:', error);
  }
}

test();
