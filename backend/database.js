import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.json');

const defaultData = {
  campaigns: [],
  leads: [],
  settings: {
    geminiApiKey: ''
  }
};

let dbCache = null;

// MongoDB Mongoose Schemas
const campaignSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  keyword: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, default: 'idle' },
  progress: { type: Number, default: 0 },
  totalLeads: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const leadSchema = new mongoose.Schema({
  id: { type: String, required: true },
  campaignId: { type: String, required: true },
  name: { type: String, required: true },
  rating: { type: Number, default: 0 },
  reviewsCount: { type: Number, default: 0 },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  email: { type: String, default: '' },
  owner: { type: String, default: '' },
  summary: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  geminiApiKey: { type: String, default: '' }
});

const CampaignModel = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);
const LeadModel = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
const SettingsModel = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

// Connection helpers
const isMongo = () => !!process.env.MONGO_URI;
let isConnected = false;

async function connectMongo() {
  if (!isConnected && isMongo()) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      isConnected = true;
      console.log('MongoDB Atlas connected successfully!');
    } catch (err) {
      console.error('MongoDB connection error:', err.message);
      throw err;
    }
  }
}

// Initialize database
export async function initDb() {
  if (isMongo()) {
    await connectMongo();
  } else {
    try {
      await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
      await fs.access(DB_PATH);
      const content = await fs.readFile(DB_PATH, 'utf-8');
      dbCache = JSON.parse(content);
    } catch (error) {
      dbCache = { ...defaultData };
      await saveDb();
    }
  }
}

// Save database cache to disk (only for JSON file fallback)
async function saveDb() {
  if (isMongo()) return;
  if (!dbCache) dbCache = { ...defaultData };
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf-8');
}

// Normalization helpers for deduplication
function normalizePhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Remove Turkish country code 90 if it has 12 digits total
  if (digits.startsWith('90') && digits.length === 12) {
    return digits.substring(2);
  }
  // Remove leading 0 if it has 11 digits total
  if (digits.startsWith('0') && digits.length === 11) {
    return digits.substring(1);
  }
  return digits;
}

function normalizeWebsite(url) {
  if (!url) return '';
  return url.trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
}

function normalizeName(name) {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü]/g, '');
}

// Campaigns methods
export async function getCampaigns() {
  if (isMongo()) {
    await connectMongo();
    return await CampaignModel.find({}).sort({ createdAt: -1 }).lean();
  }
  if (!dbCache) await initDb();
  return dbCache.campaigns;
}

export async function getCampaignById(id) {
  if (isMongo()) {
    await connectMongo();
    return await CampaignModel.findOne({ id }).lean();
  }
  if (!dbCache) await initDb();
  return dbCache.campaigns.find(c => c.id === id);
}

export async function createCampaign(campaign) {
  const newCampaign = {
    id: campaign.id || `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    keyword: campaign.keyword,
    location: campaign.location,
    status: campaign.status || 'idle',
    progress: campaign.progress || 0,
    totalLeads: campaign.totalLeads || 0,
    createdAt: new Date().toISOString()
  };

  if (isMongo()) {
    await connectMongo();
    const doc = new CampaignModel(newCampaign);
    await doc.save();
    return doc.toObject();
  }

  if (!dbCache) await initDb();
  dbCache.campaigns.push(newCampaign);
  await saveDb();
  return newCampaign;
}

export async function updateCampaign(id, updates) {
  if (isMongo()) {
    await connectMongo();
    return await CampaignModel.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }

  if (!dbCache) await initDb();
  const index = dbCache.campaigns.findIndex(c => c.id === id);
  if (index !== -1) {
    dbCache.campaigns[index] = { ...dbCache.campaigns[index], ...updates };
    await saveDb();
    return dbCache.campaigns[index];
  }
  return null;
}

export async function deleteCampaign(id) {
  if (isMongo()) {
    await connectMongo();
    await CampaignModel.deleteOne({ id });
    await LeadModel.deleteMany({ campaignId: id });
    return true;
  }

  if (!dbCache) await initDb();
  dbCache.campaigns = dbCache.campaigns.filter(c => c.id !== id);
  dbCache.leads = dbCache.leads.filter(l => l.campaignId !== id);
  await saveDb();
  return true;
}

// Leads methods
export async function getLeads(campaignId = null) {
  if (isMongo()) {
    await connectMongo();
    const query = (campaignId && campaignId !== 'all') ? { campaignId } : {};
    return await LeadModel.find(query).sort({ createdAt: -1 }).lean();
  }

  if (!dbCache) await initDb();
  if (campaignId && campaignId !== 'all') {
    return dbCache.leads.filter(l => l.campaignId === campaignId);
  }
  return dbCache.leads;
}

export async function saveLead(lead) {
  const leadId = lead.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Normalize fields for duplicate checking
  const normName = normalizeName(lead.name);
  const normPhone = normalizePhone(lead.phone);
  const normWeb = normalizeWebsite(lead.website);

  if (isMongo()) {
    await connectMongo();
    
    // Find all leads in this campaign to check duplicates
    const campaignLeads = await LeadModel.find({ campaignId: lead.campaignId }).lean();
    
    const existing = campaignLeads.find(l => {
      if (normName && normalizeName(l.name) === normName) return true;
      if (normPhone && normalizePhone(l.phone) === normPhone) return true;
      if (normWeb && normalizeWebsite(l.website) === normWeb) return true;
      return false;
    });

    const finalLead = {
      id: existing ? existing.id : leadId,
      campaignId: lead.campaignId,
      name: lead.name,
      rating: lead.rating || 0,
      reviewsCount: lead.reviewsCount || 0,
      address: lead.address || '',
      phone: lead.phone || '',
      website: lead.website || '',
      email: lead.email || '',
      owner: lead.owner || '',
      summary: lead.summary || '',
      createdAt: existing ? existing.createdAt : new Date(),
      updatedAt: new Date()
    };

    if (existing) {
      await LeadModel.updateOne({ id: existing.id, campaignId: lead.campaignId }, { $set: finalLead });
    } else {
      const doc = new LeadModel(finalLead);
      await doc.save();
    }

    // Update totalLeads count in campaign
    const campaignLeadsCount = await LeadModel.countDocuments({ campaignId: lead.campaignId });
    await CampaignModel.updateOne({ id: lead.campaignId }, { $set: { totalLeads: campaignLeadsCount } });

    return finalLead;
  }

  // JSON file fallback
  if (!dbCache) await initDb();
  
  const existingIndex = dbCache.leads.findIndex(l => {
    if (l.campaignId !== lead.campaignId) return false;
    
    // Check match on normalized name
    if (normName && normalizeName(l.name) === normName) return true;
    
    // Check match on normalized phone
    if (normPhone && normalizePhone(l.phone) === normPhone) return true;
    
    // Check match on normalized website
    if (normWeb && normalizeWebsite(l.website) === normWeb) return true;
    
    return false;
  });

  const finalLead = {
    id: existingIndex !== -1 ? dbCache.leads[existingIndex].id : leadId,
    campaignId: lead.campaignId,
    name: lead.name,
    rating: lead.rating || 0,
    reviewsCount: lead.reviewsCount || 0,
    address: lead.address || '',
    phone: lead.phone || '',
    website: lead.website || '',
    email: lead.email || '',
    owner: lead.owner || '',
    summary: lead.summary || '',
    createdAt: existingIndex !== -1 ? dbCache.leads[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (existingIndex !== -1) {
    dbCache.leads[existingIndex] = finalLead;
  } else {
    dbCache.leads.push(finalLead);
  }

  // Update totalLeads count in campaign
  const campaign = dbCache.campaigns.find(c => c.id === lead.campaignId);
  if (campaign) {
    const campaignLeadsCount = dbCache.leads.filter(l => l.campaignId === lead.campaignId).length;
    campaign.totalLeads = campaignLeadsCount;
  }

  await saveDb();
  return finalLead;
}

// Settings methods
export async function getSettings() {
  if (isMongo()) {
    await connectMongo();
    const settings = await SettingsModel.findOne({}).lean();
    return settings || { geminiApiKey: '' };
  }

  if (!dbCache) await initDb();
  return dbCache.settings;
}

export async function saveSettings(settings) {
  if (isMongo()) {
    await connectMongo();
    const updated = await SettingsModel.findOneAndUpdate({}, { $set: settings }, { new: true, upsert: true }).lean();
    return updated;
  }

  if (!dbCache) await initDb();
  dbCache.settings = { ...dbCache.settings, ...settings };
  await saveDb();
  return dbCache.settings;
}
