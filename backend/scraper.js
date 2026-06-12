import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Helper to wait
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to clean URL
function cleanUrl(url) {
  if (!url) return '';
  let clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) {
    clean = 'http://' + clean;
  }
  return clean;
}

// Extract emails from HTML text
function extractEmails(text) {
  if (!text) return [];
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}/g;
  const matches = text.match(emailRegex) || [];
  // Return unique emails, ignore binary/image extensions
  const ignoredExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
  return [...new Set(matches)]
    .map(email => email.toLowerCase())
    .filter(email => !ignoredExtensions.some(ext => email.endsWith(ext)));
}

// Extract phones from HTML text
function extractPhones(text) {
  if (!text) return [];
  // Match Turkish phone formats and international formats
  const phoneRegex = /(?:\+90|0)?\s*\(?[2-9]\d{2}\)?\s*\d{3}\s*\d{2}\s*\d{2}/g;
  const matches = text.match(phoneRegex) || [];
  // Clean formatting and return unique
  return [...new Set(matches.map(p => p.replace(/[\s\(\)\-]/g, '')))]
    .filter(p => p.length >= 10 && p.length <= 13);
}

// Find possible owner name using Heuristics
function extractOwnerHeuristics(htmlText) {
  if (!htmlText) return '';
  const lines = htmlText.split('\n');
  const ownerKeywords = [
    'sahibi', 'kurucusu', 'yönetim kurulu başkanı', 'genel müdür', 'ceo', 
    'founder', 'owner', 'tarafından kurulmuştur', 'tarafından kuruldu'
  ];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const keyword of ownerKeywords) {
      if (lowerLine.includes(keyword)) {
        // Try to find capitalized words (names) near the keyword
        // e.g. "Ahmet Yılmaz tarafından kurulmuştur" or "Kurucusu Ahmet Yılmaz"
        // Simple regex to extract 2 or 3 consecutive capitalized words
        const nameMatches = line.match(/\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2})\b/g);
        if (nameMatches && nameMatches.length > 0) {
          // Exclude common Turkish month names or stop words if necessary
          const name = nameMatches[0];
          const ignored = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık', 'Türkiye'];
          if (!ignored.includes(name)) {
            return name;
          }
        }
      }
    }
  }
  return '';
}

// Call Gemini API to extract owner & summary
async function extractWithGemini(text, apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Aşağıda bir şirketin web sitesinden alınan metinler bulunmaktadır. 
Bu metinleri inceleyerek:
1. Şirketin kurucusunu, sahibini, genel müdürünü veya yönetim kurulu başkanının adını (Owner Name) tespit et. Bulamazsan boş bırak.
2. Şirketin ne iş yaptığını, hangi sektörde faaliyet gösterdiğini anlatan 2-3 cümlelik akıcı Türkçe bir özet (Summary) çıkar.

Yanıtı kesinlikle aşağıdaki JSON şablonunda ver ve JSON dışında hiçbir metin ekleme:
{
  "owner": "Bulunan İsim Soyisim veya boş",
  "summary": "Üretilen özet"
}

Analiz edilecek web sitesi içeriği:
---
${text.substring(0, 4000)}
---`;

    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }]
      }]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    const outputText = response.data.candidates[0].content.parts[0].text.trim();
    // Parse JSON safely (remove markdown blocks if present)
    const jsonStr = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);
    return {
      owner: result.owner || '',
      summary: result.summary || ''
    };
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    throw error;
  }
}

// Scrape a website's pages
async function scrapeWebsite(websiteUrl, geminiApiKey, onLog) {
  const url = cleanUrl(websiteUrl);
  onLog(`Web sitesi taranıyor: ${url}`);
  
  let websiteData = {
    email: '',
    phones: [],
    owner: '',
    summary: ''
  };

  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Get meta description as fallback summary
    const metaDesc = $('meta[name="description"]').attr('content') || 
                     $('meta[property="og:description"]').attr('content') || '';
    
    // Extract text from body
    $('script, style, iframe, noscript').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ');

    let emails = extractEmails(bodyText);
    let phones = extractPhones(bodyText);

    // Look for contacts/about pages
    const pageLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href && (
        text.includes('iletisim') || text.includes('iletişim') || 
        text.includes('hakkimizda') || text.includes('hakkımızda') || 
        text.includes('contact') || text.includes('about') ||
        text.includes('biz kimiz')
      )) {
        let fullLink = href;
        if (!href.startsWith('http')) {
          // Resolve relative URL
          try {
            fullLink = new URL(href, url).href;
          } catch (e) {
            fullLink = url + (href.startsWith('/') ? '' : '/') + href;
          }
        }
        pageLinks.push(fullLink);
      }
    });

    // Crawl first 2 subpages to find more contact info
    const uniqueSubpages = [...new Set(pageLinks)].slice(0, 2);
    let subpageTextCombined = '';

    for (const subpage of uniqueSubpages) {
      try {
        onLog(`Alt sayfa taranıyor: ${subpage}`);
        const subRes = await axios.get(subpage, {
          timeout: 6000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const $sub = cheerio.load(subRes.data);
        $sub('script, style, iframe, noscript').remove();
        const subText = $sub('body').text().replace(/\s+/g, ' ');
        subpageTextCombined += '\n' + subText;

        emails = emails.concat(extractEmails(subText));
        phones = phones.concat(extractPhones(subText));
      } catch (err) {
        onLog(`Alt sayfa taranamadı: ${subpage} (${err.message})`);
      }
    }

    // Deduplicate
    emails = [...new Set(emails)];
    phones = [...new Set(phones)];

    websiteData.email = emails[0] || '';
    websiteData.phones = phones;

    const allText = (bodyText + '\n' + subpageTextCombined).replace(/\s+/g, ' ');

    if (geminiApiKey) {
      try {
        onLog('Gemini AI ile şirket bilgileri analiz ediliyor...');
        const aiResult = await extractWithGemini(allText, geminiApiKey);
        websiteData.owner = aiResult.owner;
        websiteData.summary = aiResult.summary;
      } catch (aiErr) {
        onLog(`AI Analizi başarısız oldu (Hata: ${aiErr.message}). Kural tabanlı analize geçiliyor.`);
        websiteData.owner = extractOwnerHeuristics(allText);
        websiteData.summary = metaDesc || bodyText.substring(0, 150).trim() + '...';
      }
    } else {
      onLog('API anahtarı bulunamadı, kural tabanlı analiz yapılıyor...');
      websiteData.owner = extractOwnerHeuristics(allText);
      websiteData.summary = metaDesc || bodyText.substring(0, 150).trim() + '...';
    }

  } catch (error) {
    onLog(`Web sitesi taranamadı: ${url} (${error.message})`);
  }

  return websiteData;
}

// Main Puppeteer Scraper
export async function runScraper(campaignId, keyword, location, onLog, onLeadFound, getSettingsFn) {
  let browser = null;
  onLog(`Arama başlatıldı: "${keyword}" konum: "${location}"`);

  try {
    const settings = await getSettingsFn();
    const geminiApiKey = settings?.geminiApiKey || '';

    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1280,800'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const searchQuery = encodeURIComponent(`${keyword} ${location}`);
    const mapsUrl = `https://www.google.com/maps/search/${searchQuery}`;
    onLog(`Google Haritalar açılıyor: ${mapsUrl}`);

    await page.goto(mapsUrl, { waitUntil: 'networkidle2' });

    // Handle Google Consent screen if it appears
    try {
      const consentBtn = await page.waitForSelector('button[aria-label="Tümünü kabul et"], button[aria-label="Accept all"], form[action*="consent.google.com"] button', { timeout: 4000 });
      if (consentBtn) {
        onLog('Google Çerez onay ekranı algılandı, onaylanıyor...');
        await consentBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      }
    } catch (e) {
      // Consent screen did not show up
    }

    // Wait for the results pane
    onLog('Arama sonuçları bekleniyor...');
    const feedSelector = '[role="feed"]';
    
    try {
      await page.waitForSelector(feedSelector, { timeout: 15000 });
    } catch (err) {
      // Sometimes it loads directly to a single business page instead of a list
      onLog('Liste ekranı bulunamadı, doğrudan tek bir işletme yüklenmiş olabilir.');
      const titleEl = await page.$('h1');
      if (titleEl) {
        const title = await page.evaluate(el => el.textContent, titleEl);
        onLog(`Tek işletme algılandı: ${title}`);
        
        // Extract directly
        const lead = await extractSingleBusinessDetails(page, onLog);
        if (lead) {
          lead.campaignId = campaignId;
          onLog(`İşletme bilgileri alındı: ${lead.name}`);
          
          if (lead.website) {
            const extra = await scrapeWebsite(lead.website, geminiApiKey, onLog);
            lead.email = extra.email;
            if (extra.owner) lead.owner = extra.owner;
            if (extra.summary) lead.summary = extra.summary;
            if (extra.phones && extra.phones.length > 0 && !lead.phone) {
              lead.phone = extra.phones[0];
            }
          }
          await onLeadFound(lead);
        }
        await browser.close();
        return;
      }
      throw new Error('Arama sonuçları yüklenemedi. Arama terimini ve konumu kontrol edin.');
    }

    // Scroll results feed to load more companies
    onLog('Sonuçlar taranıyor (Sayfa aşağı kaydırılıyor)...');
    
    let lastHeight = await page.evaluate(() => {
      const feed = document.querySelector('[role="feed"]');
      return feed ? feed.scrollHeight : 0;
    });

    let scrollCount = 0;
    const maxScrolls = 20; // Limits searches to ~60-80 results to be fast & safe
    
    while (scrollCount < maxScrolls) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollBy(0, 10000);
      });
      await delay(2000);
      
      const newHeight = await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        return feed ? feed.scrollHeight : 0;
      });

      // Check if end of list reached
      const isEnd = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes('Listenin sonuna ulaştınız') || 
               bodyText.includes("You've reached the end of the list");
      });

      if (newHeight === lastHeight || isEnd) {
        onLog('Listenin sonuna ulaşıldı veya yeni kayıt yüklenemiyor.');
        break;
      }
      lastHeight = newHeight;
      scrollCount++;
      onLog(`Tarama ilerliyor... (${scrollCount * 10}% tamamlandı)`);
    }

    // Get list of business detail URLs
    const places = await page.evaluate(() => {
      // 1. Try using the card container first (Standard Google Maps view)
      const cards = Array.from(document.querySelectorAll('.Nv2PK'));
      if (cards.length > 0) {
        return cards.map(card => {
          const linkEl = card.querySelector('a.hfpxzc');
          const nameEl = card.querySelector('.qBF1Pd');
          return {
            url: linkEl ? linkEl.href : '',
            name: nameEl ? nameEl.textContent.trim() : ''
          };
        }).filter(p => p.url !== '' && p.name !== '');
      }

      // 2. Fallback: Search for any link containing place URLs (e.g. if cards change)
      const links = Array.from(document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]'));
      return links.map(link => {
        let name = link.getAttribute('aria-label') || '';
        if (!name) {
          const parent = link.closest('div');
          const nameEl = parent ? parent.querySelector('.qBF1Pd') : null;
          if (nameEl) name = nameEl.textContent.trim();
        }
        return {
          url: link.href,
          name: name
        };
      }).filter(p => p.url !== '' && p.name !== '');
    });

    // Deduplicate found places by name and URL to prevent duplicate scraping in the same run
    const uniquePlaces = [];
    const seenUrls = new Set();
    const seenNames = new Set();

    for (const place of places) {
      if (!place.url || !place.name) continue;
      const normName = place.name.trim().toLowerCase();
      const normUrl = place.url.split('?')[0];

      if (!seenUrls.has(normUrl) && !seenNames.has(normName)) {
        seenUrls.add(normUrl);
        seenNames.add(normName);
        uniquePlaces.push(place);
      }
    }

    onLog(`Toplam ${uniquePlaces.length} benzersiz işletme bulundu. Detaylar kazınıyor...`);

    // Process each place
    for (let i = 0; i < uniquePlaces.length; i++) {
      const place = uniquePlaces[i];
      onLog(`[${i + 1}/${uniquePlaces.length}] İşletme inceleniyor: ${place.name}`);

      try {
        await page.goto(place.url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        const lead = await extractSingleBusinessDetails(page, onLog);
        if (lead) {
          lead.campaignId = campaignId;
          
          // If website exists, perform deep crawl
          if (lead.website) {
            try {
              const extra = await scrapeWebsite(lead.website, geminiApiKey, onLog);
              lead.email = extra.email || '';
              if (extra.owner) lead.owner = extra.owner;
              if (extra.summary) lead.summary = extra.summary;
              
              // If phone is missing in Maps but found on website, set it
              if (!lead.phone && extra.phones.length > 0) {
                lead.phone = extra.phones[0];
              }
            } catch (crawlErr) {
              onLog(`Şirket web sitesi tarama hatası: ${crawlErr.message}`);
            }
          } else {
            lead.summary = `${lead.name}, ${location} konumunda faaliyet gösteren bir KOBİ.`;
          }

          // Trigger callback
          await onLeadFound(lead);
        }
      } catch (err) {
        onLog(`İşletme detayları alınamadı: ${place.name} (Hata: ${err.message})`);
      }

      // Respectful delay between requests
      await delay(1500);
    }

    onLog('Tüm kazıma işlemleri başarıyla tamamlandı!');

  } catch (error) {
    onLog(`Kazıyıcı Hatası: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Helper: Extract business details from currently loaded place page
async function extractSingleBusinessDetails(page, onLog) {
  try {
    return await page.evaluate(() => {
      // 1. Name
      const nameEl = document.querySelector('h1');
      const name = nameEl ? nameEl.textContent.trim() : 'Bilinmeyen İşletme';

      // 2. Rating & Reviews
      let rating = 0;
      let reviewsCount = 0;
      const ratingEl = document.querySelector('.F7nice span');
      if (ratingEl) {
        const ratingText = ratingEl.textContent.replace(',', '.');
        rating = parseFloat(ratingText) || 0;
      }
      
      const reviewsEl = document.querySelector('.F7nice span:nth-child(2)');
      if (reviewsEl) {
        const revText = reviewsEl.textContent.replace(/[\(\)\.]/g, '');
        reviewsCount = parseInt(revText) || 0;
      }

      // 3. Address
      const addressEl = document.querySelector('button[data-item-id="address"]');
      const address = addressEl ? addressEl.textContent.trim() : '';

      // 4. Phone
      // Look for data-item-id starting with phone:tel:
      const phoneEl = document.querySelector('button[data-item-id^="phone:tel:"]');
      let phone = '';
      if (phoneEl) {
        phone = phoneEl.getAttribute('data-item-id').replace('phone:tel:', '').trim();
      }

      // 5. Website
      const websiteEl = document.querySelector('a[data-item-id="authority"]');
      const website = websiteEl ? websiteEl.getAttribute('href') : '';

      return {
        name,
        rating,
        reviewsCount,
        address,
        phone,
        website
      };
    });
  } catch (e) {
    onLog(`Detay ayıklama hatası: ${e.message}`);
    return null;
  }
}
