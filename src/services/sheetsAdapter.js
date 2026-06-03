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
      externalId:   lead.externalId     || '',
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
   * Push AE notes update — targeted column update, not a full row append.
   *
   * Phase 8D-2B: sends action: 'updateAENotes' to the Apps Script.
   * The Apps Script finds the row by externalId (primary) or email (fallback)
   * and updates the aeNotes column only — never appends a new row.
   *
   * Failure behavior: returns { ok: false } silently — the app continues
   * normally. AE Notes are saved in localStorage regardless of sheet outcome.
   *
   * Backward compatibility: until the Apps Script handler for 'updateAENotes'
   * is deployed, the endpoint will return { success: false } or ignore the
   * action — caught by .catch(() => {}) at every call site. No duplicate rows
   * are created (unlike the previous pushLead() behavior).
   *
   * Call site (AENotesTab) is unchanged:
   *   SheetsAdapter.pushAENotes({ ...lead, aeNotes: cleaned }).catch(() => {})
   * The inline aeNotes: cleaned override is read by lead.aeNotes below.
   */
  async pushAENotes(lead) {
    try {
      const res  = await fetch(SHEETS_URL, {
        method: 'POST',
        body:   JSON.stringify({
          action:     'updateAENotes',
          externalId: lead.externalId || '',
          email:      lead.email      || '',
          aeNotes:    lead.aeNotes    || '',
          savedAt:    new Date().toISOString(),
        }),
      });
      const json = await res.json();
      return { ok: !!json.success };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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

  /**
   * updateLeadFields — Phase 8D-2B: targeted row-update by externalId or email.
   *
   * Sends action: 'updateLead' to the Apps Script, which finds the existing row
   * by externalId (primary) or email (fallback) and updates only the specified
   * profile fields in-place — never appends a new row.
   *
   * Failure behavior: returns { ok: false } — caller uses .catch(() => {}).
   * No call sites are wired yet (Phase 8D-2C after Apps Script validation).
   *
   * @param {object} lead   — lead object with externalId and/or email
   * @param {object} fields — profile fields to update (business, phone, city, etc.)
   * @returns {{ ok: boolean, error?: string }}
   */
  async updateLeadFields(lead, fields) {
    try {
      const res  = await fetch(SHEETS_URL, {
        method: 'POST',
        body:   JSON.stringify({
          action:     'updateLead',
          externalId: lead.externalId || '',
          email:      lead.email      || '',
          fields:     fields          || {},
        }),
      });
      const json = await res.json();
      return { ok: !!json.success, error: json.error };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * logContent — Phase 8D-2B stub.
   *
   * Reserved for future opt-in content logging to a dedicated Generated Content
   * tab in the sheet. Disabled by default — generated emails, SMS, voicemails,
   * and LinkedIn messages are not automatically exported.
   *
   * A future Settings toggle (settings.logGeneratedContent) may activate this.
   * No call sites exist. No network calls made.
   *
   * When activated, sends action: 'logContent' to a separate Apps Script handler
   * that appends to the Generated Content tab only — never touches lead rows.
   *
   * @param {object} lead    — lead context (externalId, email, businessName)
   * @param {object} content — { type, subject, body, generatedAt, source }
   * @returns {{ ok: boolean, reason?: string }}
   */
  async logContent(lead, content) {
    // Phase 8D-2C: replace with POST action: 'logContent' when Apps Script tab exists
    // and settings.logGeneratedContent === true at the call site.
    return { ok: false, reason: 'Disabled by default — opt-in not yet configured' };
  },

  /**
   * logCadence — Phase 8D-2B stub.
   *
   * Reserved for future cadence export to a dedicated Cadences tab in the sheet.
   * Upserts by cadenceId — update if exists, append if new.
   * No call sites exist. No network calls made.
   *
   * When activated, sends action: 'logCadence' to a separate Apps Script handler
   * that writes to the Cadences tab only — never touches lead rows.
   *
   * @param {object} cadence — { id, name, steps, createdAt, updatedAt }
   * @returns {{ ok: boolean, reason?: string }}
   */
  async logCadence(cadence) {
    // Phase 8D-2C: replace with POST action: 'logCadence' when Apps Script tab exists.
    return { ok: false, reason: 'Apps Script Cadences tab not yet implemented' };
  },
};

export default SheetsAdapter;
