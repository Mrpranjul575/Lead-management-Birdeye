/**
 * GOOGLE SHEETS SERVICE LAYER
 * All data operations against a connected Google Sheet.
 * Uses Google Sheets API v4 via fetch — no SDK needed.
 *
 * Sheet structure expected:
 *   Leads | Activities | AE Notes | AI Memory | Cadences | Settings | Reports
 *
 * To connect: paste your Google Sheets ID + service account key in Settings.
 */

const SHEETS = {
  LEADS:      'Leads',
  ACTIVITIES: 'Activities',
  AE_NOTES:   'AE Notes',
  AI_MEMORY:  'AI Memory',
  CADENCES:   'Cadences',
  SETTINGS:   'Settings',
  REPORTS:    'Reports',
};

// ── Headers per sheet ─────────────────────────────────────────────────────────
const HEADERS = {
  Leads: [
    'id','business','contact','email','phone','website','city','industry',
    'intent','aiScore','reviews','rating','aiVisibility','compGap',
    'stage','nextAction','lastTouch','cadenceDay','cadenceTotal',
    'competitor','keyword','gmbUrl','salesloftUrl','mqlDate',
    'tags','createdAt','updatedAt',
  ],
  Activities: ['activityId','leadId','leadBusiness','timestamp','type','summary','outcome','details','source'],
  'AE Notes': ['leadId','business','notes','updatedAt'],
  'AI Memory': ['id','leadId','business','text','tag','date'],
  Cadences: ['id','name','description','steps'],
};

// ── Low-level fetch wrapper ────────────────────────────────────────────────────
async function sheetsRequest(method, path, body, apiKey) {
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err?.error?.message || `Sheets API ${res.status}`);
  }
  return res.json();
}

// ── Append a row ──────────────────────────────────────────────────────────────
async function appendRow(spreadsheetId, sheet, values, apiKey) {
  return sheetsRequest('POST',
    `/${spreadsheetId}/values/${encodeURIComponent(sheet)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { values: [values] },
    apiKey
  );
}

// ── Read all rows ─────────────────────────────────────────────────────────────
async function readSheet(spreadsheetId, sheet, apiKey) {
  const data = await sheetsRequest('GET',
    `/${spreadsheetId}/values/${encodeURIComponent(sheet)}`,
    null,
    apiKey
  );
  const rows = data.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i] || '']))
  );
}

// ── Ensure sheet has headers ──────────────────────────────────────────────────
async function ensureHeaders(spreadsheetId, sheet, apiKey) {
  const headers = HEADERS[sheet];
  if (!headers) return;
  try {
    const data = await sheetsRequest('GET',
      `/${spreadsheetId}/values/${encodeURIComponent(sheet)}!A1:A1`,
      null, apiKey
    );
    if (!data.values?.length) {
      await sheetsRequest('PUT',
        `/${spreadsheetId}/values/${encodeURIComponent(sheet)}!A1?valueInputOption=USER_ENTERED`,
        { values: [headers] },
        apiKey
      );
    }
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────
export const SheetsAdapter = {

  /**
   * Push a single lead to the Leads sheet
   */
  async pushLead(lead, settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'No Sheets ID or token configured' };
    try {
      await ensureHeaders(sheetsId, 'Leads', sheetsToken);
      const row = HEADERS.Leads.map(h => {
        if (h === 'tags') return JSON.stringify(lead.tags || []);
        if (h === 'updatedAt') return new Date().toISOString();
        if (h === 'createdAt') return lead.createdAt || new Date().toISOString();
        return String(lead[h] ?? '');
      });
      await appendRow(sheetsId, 'Leads', row, sheetsToken);
      return { ok:true };
    } catch (e) { return { ok:false, error:e.message }; }
  },

  /**
   * Push an activity entry
   */
  async pushActivity(leadId, leadBusiness, activity, settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'No Sheets configured' };
    try {
      await ensureHeaders(sheetsId, 'Activities', sheetsToken);
      const row = [
        activity.activityId, leadId, leadBusiness,
        activity.timestamp, activity.type, activity.summary,
        activity.outcome || '', JSON.stringify(activity.details || {}), activity.source || 'manual',
      ];
      await appendRow(sheetsId, 'Activities', row, sheetsToken);
      return { ok:true };
    } catch (e) { return { ok:false, error:e.message }; }
  },

  /**
   * Push AE notes
   */
  async pushAENotes(lead, settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'No Sheets configured' };
    try {
      await ensureHeaders(sheetsId, 'AE Notes', sheetsToken);
      await appendRow(sheetsId, 'AE Notes',
        [lead.id, lead.business, lead.aeNotes || '', new Date().toISOString()],
        sheetsToken
      );
      return { ok:true };
    } catch (e) { return { ok:false, error:e.message }; }
  },

  /**
   * Push a memory entry
   */
  async pushMemory(leadId, leadBusiness, entry, settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'No Sheets configured' };
    try {
      await ensureHeaders(sheetsId, 'AI Memory', sheetsToken);
      await appendRow(sheetsId, 'AI Memory',
        [entry.id, leadId, leadBusiness, entry.text, entry.tag || '', entry.date || ''],
        sheetsToken
      );
      return { ok:true };
    } catch (e) { return { ok:false, error:e.message }; }
  },

  /**
   * Read all leads from sheet
   */
  async readLeads(settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'No Sheets configured', data:[] };
    try {
      const rows = await readSheet(sheetsId, 'Leads', sheetsToken);
      return { ok:true, data: rows.map(r => ({ ...r, tags: JSON.parse(r.tags||'[]') })) };
    } catch (e) { return { ok:false, error:e.message, data:[] }; }
  },

  /**
   * Test connection
   */
  async testConnection(settings) {
    const { sheetsId, sheetsToken } = settings;
    if (!sheetsId || !sheetsToken) return { ok:false, error:'Missing Sheets ID or token' };
    try {
      await sheetsRequest('GET', `/${sheetsId}?fields=spreadsheetId,properties.title`, null, sheetsToken);
      return { ok:true };
    } catch (e) { return { ok:false, error:e.message }; }
  },
};

export default SheetsAdapter;
