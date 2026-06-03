/**
 * GOOGLE SHEETS WEB APP ADAPTER
 * Sends data to the deployed Google Apps Script Web App.
 * No API key required — the Web App URL is the only endpoint.
 *
 * Sheet tabs:
 *   Fresh Leads   — new inbound leads  (mode: 'fresh')
 *   Re-engagement — cold leads         (mode: 'reeng')
 *
 * The Web App accepts POST requests with a JSON body.
 * GET requests are used for connection test and email lookup.
 */

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxVOAnt_qoRJ61bvxjDUQlZSiuqgIsqZ4UMbnzNJzAxyEsN2Z54_XBCldL5hDYYZUbq/exec';

export const SheetsAdapter = {

  /**
   * Push a new lead to Fresh Leads or Re-engagement tab.
   * mode is derived from lead.stage: Re-engage → 'reeng', everything else → 'fresh'.
   */
  async pushLead(lead) {
    const competitors = lead.intelligence?.competitors || [];
    const body = {
      rawLead:      lead.aeNotes        || '',
      rawSeo:       lead.seoReport      || '',
      rawAi:        lead.aiReport       || '',
      name:         lead.contact        || '',
      email:        lead.email          || '',
      phone:        lead.phone          || '',
      businessName: lead.business       || '',
      address:      lead.city           || '',
      rating:       lead.rating         || '',
      reviews:      lead.reviews        || '',
      keyword:      lead.keyword        || '',
      leadUrl:      lead.salesloftUrl   || '',
      gmbUrl:       lead.gmbUrl         || '',
      competitor1:  competitors[0]      || lead.competitor || '',
      competitor2:  competitors[1]      || '',
      email1:       lead.generatedEmails?.email1 || '',
      sms1:         lead.generatedEmails?.sms1   || '',
      email2:       lead.generatedEmails?.email2 || '',
      sms2:         lead.generatedEmails?.sms2   || '',
      email3:       lead.generatedEmails?.email3 || '',
      dateAdded:    lead.mqlDate || new Date().toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    }),
      status:       lead.stage  || 'NEW',
      system:       'SDR Workspace',
      aeNotes:      lead.aeNotes || '',
      mode:         lead.stage === 'Re-engage' ? 'reeng' : 'fresh',
    };
    try {
      const res  = await fetch(SHEETS_URL, {
        method: 'POST',
        body:   JSON.stringify(body),
      });
      const json = await res.json();
      return { ok: json.success, error: json.error };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Update lead status in sheet (called when lead.stage changes).
   */
  async updateStatus(email, status) {
    try {
      const res  = await fetch(SHEETS_URL, {
        method: 'POST',
        body:   JSON.stringify({
          action:    'updateStatus',
          email,
          status,
          updatedAt: new Date().toLocaleDateString('en-US', {
                       year: 'numeric', month: 'short', day: 'numeric',
                     }),
        }),
      });
      const json = await res.json();
      return { ok: json.success };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Push AE notes update — re-pushes the full lead row.
   */
  async pushAENotes(lead) {
    return this.pushLead({ ...lead });
  },

  /**
   * Push lead with generated email/SMS content attached.
   */
  async pushGeneratedContent(lead, content) {
    return this.pushLead({
      ...lead,
      generatedEmails: content,
    });
  },

  /**
   * Search sheet by email address (GET request).
   */
  async findByEmail(email) {
    try {
      const res  = await fetch(`${SHEETS_URL}?email=${encodeURIComponent(email)}`);
      const json = await res.json();
      return json;
    } catch (e) {
      return { found: false, error: e.message };
    }
  },

  /**
   * Test connection — simple GET to verify the Web App is reachable.
   */
  async test() {
    try {
      const res  = await fetch(SHEETS_URL);
      const json = await res.json();
      return { ok: true, message: json.status || 'Connected' };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Read all leads from the connected Google Sheet via the deployed Web App URL.
   * No sheetsId or token required — the Web App URL is the sole endpoint.
   * Returns { ok: true, data: lead[] } on success.
   * Returns { ok: false, error: string, data: [] } on failure.
   */
  async readLeads(settings) {
    try {
      const res  = await fetch(`${SHEETS_URL}?action=readLeads`);
      const json = await res.json();
      if (json.error) return { ok: false, error: json.error, data: [] };
      const rows = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
      return { ok: true, data: rows };
    } catch (e) {
      return { ok: false, error: e.message, data: [] };
    }
  },
};

export default SheetsAdapter;
