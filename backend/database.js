import { fsync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Initialize database
export async function initDb() {
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

// Save database cache to disk
async function saveDb() {
  if (!dbCache) dbCache = { ...defaultData };
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf-8');
}

// Campaigns methods
export async function getCampaigns() {
  if (!dbCache) await initDb();
  return dbCache.campaigns;
}

export async function getCampaignById(id) {
  if (!dbCache) await initDb();
  return dbCache.campaigns.find(c => c.id === id);
}

export async function createCampaign(campaign) {
  if (!dbCache) await initDb();
  const newCampaign = {
    id: campaign.id || `camp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    keyword: campaign.keyword,
    location: campaign.location,
    status: campaign.status || 'idle',
    progress: campaign.progress || 0,
    totalLeads: campaign.totalLeads || 0,
    createdAt: new Date().toISOString()
  };
  dbCache.campaigns.push(newCampaign);
  await saveDb();
  return newCampaign;
}

export async function updateCampaign(id, updates) {
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
  if (!dbCache) await initDb();
  dbCache.campaigns = dbCache.campaigns.filter(c => c.id !== id);
  dbCache.leads = dbCache.leads.filter(l => l.campaignId !== id);
  await saveDb();
  return true;
}

// Leads methods
export async function getLeads(campaignId = null) {
  if (!dbCache) await initDb();
  if (campaignId) {
    return dbCache.leads.filter(l => l.campaignId === campaignId);
  }
  return dbCache.leads;
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

export async function saveLead(lead) {
  if (!dbCache) await initDb();
  
  const leadId = lead.id || `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Normalize fields for duplicate checking
  const normName = normalizeName(lead.name);
  const normPhone = normalizePhone(lead.phone);
  const normWeb = normalizeWebsite(lead.website);

  // Check if lead already exists in this campaign
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
  if (!dbCache) await initDb();
  return dbCache.settings;
}

export async function saveSettings(settings) {
  if (!dbCache) await initDb();
  dbCache.settings = { ...dbCache.settings, ...settings };
  await saveDb();
  return dbCache.settings;
}
