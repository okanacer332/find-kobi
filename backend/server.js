import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { 
  initDb, 
  getCampaigns, 
  getCampaignById, 
  createCampaign, 
  updateCampaign, 
  deleteCampaign, 
  getLeads, 
  saveLead, 
  getSettings, 
  saveSettings 
} from './database.js';
import { runScraper } from './scraper.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Bypass-Tunnel-Reminder']
  }
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Bypass-Tunnel-Reminder']
}));
app.use(express.json());

// Initialize Database on Startup
await initDb();

// Active scraping jobs registry
const activeJobs = new Map();

// API Endpoints

// 1. Get Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Save Settings
app.post('/api/settings', async (req, res) => {
  try {
    const newSettings = await saveSettings(req.body);
    res.json(newSettings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get Campaigns
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await getCampaigns();
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Create and Start Campaign (Scraping)
app.post('/api/campaigns', async (req, res) => {
  try {
    const { keyword, location } = req.body;
    if (!keyword || !location) {
      return res.status(400).json({ error: 'Keyword ve Location girilmesi zorunludur.' });
    }

    // Create campaign in DB
    const campaign = await createCampaign({
      keyword,
      location,
      status: 'running',
      progress: 0,
      totalLeads: 0
    });

    res.json(campaign);

    // Run Scraper asynchronously in background
    const jobPromise = (async () => {
      const logs = [];
      const logAndEmit = (message) => {
        const logEntry = {
          campaignId: campaign.id,
          message,
          timestamp: new Date().toISOString()
        };
        logs.push(logEntry);
        // Stream log to connected socket rooms
        io.to(campaign.id).emit('log', logEntry);
      };

      try {
        logAndEmit(`[Kampanya Başladı] Arama Terimi: "${keyword}", Konum: "${location}"`);
        
        await runScraper(
          campaign.id,
          keyword,
          location,
          // onLog callback
          (msg) => logAndEmit(msg),
          // onLeadFound callback
          async (lead) => {
            const saved = await saveLead(lead);
            io.to(campaign.id).emit('lead_found', saved);
            
            // Recalculate campaign progress roughly (e.g. increase incrementally up to 95%)
            const currentCampaign = await getCampaignById(campaign.id);
            if (currentCampaign) {
              const currentLeadsCount = currentCampaign.totalLeads;
              const newProgress = Math.min(95, Math.round((currentLeadsCount / (currentLeadsCount + 5)) * 100));
              await updateCampaign(campaign.id, { progress: newProgress });
              io.to(campaign.id).emit('status_change', { 
                campaignId: campaign.id, 
                status: 'running', 
                progress: newProgress,
                totalLeads: currentLeadsCount 
              });
            }
          },
          // getSettings
          getSettings
        );

        // Success
        const finalCampaign = await getCampaignById(campaign.id);
        await updateCampaign(campaign.id, { status: 'completed', progress: 100 });
        io.to(campaign.id).emit('status_change', { 
          campaignId: campaign.id, 
          status: 'completed', 
          progress: 100,
          totalLeads: finalCampaign?.totalLeads || 0
        });
        logAndEmit('[Kampanya Tamamlandı] Tüm işlemler başarıyla bitti.');

      } catch (err) {
        logAndEmit(`[Kampanya Hatası] İşlem durduruldu. Hata: ${err.message}`);
        await updateCampaign(campaign.id, { status: 'failed' });
        io.to(campaign.id).emit('status_change', { campaignId: campaign.id, status: 'failed', progress: 0 });
      } finally {
        activeJobs.delete(campaign.id);
      }
    })();

    activeJobs.set(campaign.id, jobPromise);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Get Leads for a Campaign
app.get('/api/campaigns/:id/leads', async (req, res) => {
  try {
    const campaignId = req.params.id === 'all' ? null : req.params.id;
    const leads = await getLeads(campaignId);
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Delete Campaign
app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    await deleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Export CSV
app.get('/api/campaigns/:id/export/csv', async (req, res) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    const leads = await getLeads(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Kampanya bulunamadı.' });
    }

    const filename = `kobi_leads_${campaign.keyword.replace(/\s+/g, '_')}_${campaign.location.replace(/\s+/g, '_')}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Write UTF-8 Byte Order Mark (BOM) so Excel displays Turkish characters correctly
    res.write('\uFEFF');

    // Header row
    const headers = ['Şirket Adı', 'Değerlendirme Puanı', 'Yorum Sayısı', 'Adres', 'Telefon', 'Web Sitesi', 'E-posta', 'Şirket Sahibi', 'Kısa Özet'];
    res.write(headers.join(',') + '\n');

    // Data rows
    leads.forEach(l => {
      const row = [
        l.name || '',
        l.rating || 0,
        l.reviewsCount || 0,
        l.address || '',
        l.phone || '',
        l.website || '',
        l.email || '',
        l.owner || '',
        l.summary || ''
      ].map(field => {
        // Sanitize field data, wrap in double quotes, escape existing double quotes
        const val = String(field).replace(/"/g, '""');
        return `"${val}"`;
      });
      res.write(row.join(',') + '\n');
    });

    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.io Real-time connection management
io.on('connection', (socket) => {
  console.log(`Socket Client Connected: ${socket.id}`);

  // Socket room joining for specific campaign logs
  socket.on('join_campaign', (campaignId) => {
    socket.join(campaignId);
    console.log(`Socket ${socket.id} joined campaign room: ${campaignId}`);
  });

  socket.on('leave_campaign', (campaignId) => {
    socket.leave(campaignId);
    console.log(`Socket ${socket.id} left campaign room: ${campaignId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket Client Disconnected: ${socket.id}`);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
