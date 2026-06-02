/**
 * BIRDEYE SDR WORKSPACE — LEAD SCHEMA v4
 * Every field documented. Used as reference, not enforced at runtime.
 */

/**
 * Activity types — used across the unified activity engine
 */
export const ACTIVITY_TYPES = {
  CALL:           'Call',
  EMAIL:          'Email',
  SMS:            'SMS',
  LINKEDIN:       'LinkedIn',
  VOICEMAIL:      'Voicemail',
  MEETING:        'Meeting',
  NOTE:           'Note',
  AI_GENERATION:  'AI Generation',
  TRANSCRIPT:     'Transcript',
  CADENCE_UPDATE: 'Cadence Update',
  STATUS_CHANGE:  'Status Change',
  FOLLOW_UP:      'Follow Up',
  IMPORT:         'Import',
};

export const ACTIVITY_OUTCOMES = {
  POSITIVE:   'Positive',
  NEUTRAL:    'Neutral',
  NEGATIVE:   'Negative',
  NO_ANSWER:  'No Answer',
  SENT:       'Sent',
  CONNECTED:  'Connected',
  REPLIED:    'Replied',
  BOUNCED:    'Bounced',
};

export const LEAD_TEMPERATURES = ['Ice Cold', 'Cold', 'Warm', 'Hot', 'On Fire'];
export const AI_PROVIDERS = ['claude', 'gemini'];

/**
 * createActivity — factory for unified activity entries
 */
export function createActivity(type, summary, details = {}) {
  return {
    activityId: Date.now() + Math.random(),
    timestamp:  new Date().toISOString(),
    type,
    summary,
    details,   // { content, subject, outcome, duration, sentiment, notes, nextStep, fileName }
    outcome:   details.outcome || null,
    source:    details.source  || 'manual',
  };
}

/**
 * createIntelligence — factory for the intelligence object
 */
export function createIntelligence(overrides = {}) {
  return {
    summary:                    '',
    painPoints:                 [],
    objections:                 [],
    competitors:                [],
    buyingSignals:              [],
    decisionMakers:             [],
    budget:                     '',
    timeline:                   '',
    preferredCommunicationStyle:'',
    leadTemperature:            'Cold',
    meetingProbability:         0,
    nextBestAction:             '',
    lastConversation:           '',
    lastUpdated:                null,
    ...overrides,
  };
}

/**
 * migrateLead — upgrades a flat v3 lead to the v4 schema
 * Non-destructive: preserves all existing fields
 */
export function migrateLead(lead) {
  if (lead._v4) return lead; // already migrated

  // Build intelligence from existing scattered data
  const competitors = [];
  if (lead.competitor) competitors.push(lead.competitor);
  const notesCompMatch = lead.aeNotes?.match(/competitor[:\s]+([^\n.]+)/gi) || [];
  notesCompMatch.forEach(m => {
    const name = m.replace(/competitor[:\s]+/i, '').trim();
    if (name && !competitors.includes(name)) competitors.push(name);
  });

  const painPoints = [];
  if (lead.intent === 'AI Visibility')   painPoints.push('Low AI search visibility');
  if (lead.intent === 'Review Growth')   painPoints.push('Insufficient review volume');
  if (lead.intent === 'Listings')        painPoints.push('Inconsistent business listings');
  if (lead.compGap === 'High')           painPoints.push('Competitor review gap');

  // Migrate fragmented activity arrays into unified engine format
  const activities = [];

  // Migrate touchLog
  (lead.touchLog || []).forEach(t => {
    activities.push({
      activityId: t.id || Date.now() + Math.random(),
      timestamp:  t.date ? `2025-05-${t.date.split('/')[1] || '01'}T10:00:00.000Z` : new Date().toISOString(),
      type:       t.type || t.channel || 'Email',
      summary:    `${t.type || t.channel} sent`,
      details:    { content: t.content },
      outcome:    'Sent',
      source:     'manual',
    });
  });

  // Migrate activity log
  (lead.activity || []).forEach(a => {
    if (!activities.find(x => x.details?.content === a.text)) {
      activities.push({
        activityId: a.id || Date.now() + Math.random(),
        timestamp:  new Date().toISOString(),
        type:       guessType(a.text),
        summary:    a.text,
        details:    { content: a.text },
        outcome:    null,
        source:     'system',
      });
    }
  });

  return {
    ...lead,
    _v4: true,

    // v4 intelligence object
    intelligence: lead.intelligence || createIntelligence({
      summary:           lead.aeNotes ? `${lead.business} — ${lead.intent} lead in ${lead.city}. ${lead.aeNotes.slice(0, 200)}` : '',
      painPoints,
      competitors,
      buyingSignals:     lead.stage === 'Hot' ? ['High engagement', 'Decision maker confirmed'] : [],
      objections:        [],
      decisionMakers:    lead.contact ? [lead.contact] : [],
      leadTemperature:   lead.stage === 'Hot' ? 'Hot' : lead.stage === 'Converted' ? 'Hot' : lead.aiScore > 80 ? 'Warm' : 'Cold',
      meetingProbability:lead.stage === 'Demo Booked' ? 85 : lead.stage === 'Hot' ? 68 : lead.stage === 'Contacted' ? 40 : 20,
      nextBestAction:    lead.nextAction || '',
      lastConversation:  lead.aeNotes ? 'See AE Notes for context.' : '',
      lastUpdated:       new Date().toISOString(),
    }),

    // unified activities array
    activities: activities.length ? activities : (lead.activities || []),

    // files array
    files: lead.files || [],

    // preserve backwards compat
    touchLog:  lead.touchLog  || [],
    activity:  lead.activity  || [],
    memory:    lead.memory    || [],
    followUps: lead.followUps || [],
  };
}

function guessType(text = '') {
  const t = text.toLowerCase();
  if (t.includes('email'))     return 'Email';
  if (t.includes('sms'))       return 'SMS';
  if (t.includes('call'))      return 'Call';
  if (t.includes('voicemail')) return 'Voicemail';
  if (t.includes('linkedin'))  return 'LinkedIn';
  if (t.includes('meeting'))   return 'Meeting';
  if (t.includes('stage') || t.includes('status')) return 'Status Change';
  return 'Note';
}


// ─── AI Lead Scoring ──────────────────────────────────────────────────────────

/**
 * Increment this when the scoring formula changes to force a one-time re-score
 * of all leads on next app load.
 */
export const CURRENT_SCORE_VERSION = 1;

/**
 * computeAiScore — derives a 0–100 score from existing lead fields.
 * Opportunity signals dominate; stage is intentionally capped at 7 pts max.
 */
export function computeAiScore(lead) {
  const intel = lead.intelligence || {};
  let score = 0;

  // AI Visibility gap (0–25 pts) — largest single opportunity signal
  const vis = lead.aiVisibility ?? 0;
  if      (vis < 10) score += 25;
  else if (vis < 20) score += 18;
  else if (vis < 30) score += 10;
  else               score += 3;

  // Competitor gap urgency (0–20 pts)
  if      (lead.compGap === 'High')   score += 20;
  else if (lead.compGap === 'Medium') score += 11;
  else if (lead.compGap === 'Low')    score += 3;

  // Review volume (0–15 pts)
  const reviews = lead.reviews || 0;
  if      (reviews > 100) score += 15;
  else if (reviews > 50)  score += 10;
  else if (reviews > 20)  score += 6;
  else                    score += 1;

  // Rating quality (0–10 pts)
  const rating = lead.rating || 0;
  if      (rating >= 4.5) score += 10;
  else if (rating >= 4.2) score += 7;
  else if (rating >= 4.0) score += 4;
  else if (rating >= 3.5) score += 1;

  // Buying signals from intelligence (0–10 pts)
  score += Math.min((intel.buyingSignals?.length || 0) * 4, 10);

  // Activity engagement — hard-capped at 4 pts, does not dominate opportunity signals
  const actCount = (lead.activities || []).length + (lead.touchLog || []).length;
  if      (actCount > 5) score += 4;
  else if (actCount > 2) score += 2;
  else if (actCount > 0) score += 1;

  // Stage — intentionally capped at 7 pts max
  const stageScore = {
    'Hot':7, 'Demo Booked':6, 'Contacted':4, 'Follow Up':3,
    'Nurturing':2, 'New':1, 'Re-engage':1, 'Lost':0, 'Converted':0,
  };
  score += stageScore[lead.stage] ?? 1;

  // Objections penalty (up to −10 pts)
  score -= Math.min((intel.objections?.length || 0) * 3, 10);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * applyScore — returns a new lead object with aiScore and scoreVersion set.
 * Use everywhere instead of repeating the two-line assignment.
 */
export function applyScore(lead) {
  return {
    ...lead,
    aiScore:      computeAiScore(lead),
    scoreVersion: CURRENT_SCORE_VERSION,
  };
}
