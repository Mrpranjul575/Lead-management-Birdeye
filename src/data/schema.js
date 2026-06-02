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
 * INTELLIGENCE_REJECTED_FIELDS — Phase 7B
 *
 * Single authoritative list of intelligence fields that have migrated to
 * accountKnowledge. Centralised here so ownership decisions are grep-able
 * from one location. Referenced by:
 *   - updateIntelligence() rejection guard  (AppContext.jsx)
 *   - migrateLead() bootstrap               (schema.js)
 *   - mergeAccountKnowledge()               (schema.js)
 *
 * Do NOT duplicate this list in any other file.
 */
export const INTELLIGENCE_REJECTED_FIELDS = new Set([
  'competitors',
  'decisionMakers',
  'budget',
  'timeline',
]);

/**
 * createAccountKnowledge — factory for the account knowledge object.
 *
 * Owns all durable account facts extracted from conversations.
 * Distinct from intelligence (scoring signals) and memory (SDR personal notes).
 *
 * Sub-object shapes:
 *   competitors[]      : { name, strength, context, source, sourceDate }
 *   decisionMakers[]   : { name, role, authority, notes, source, sourceDate }
 *   budget             : { status, amount, approvedBy, notes, source, sourceDate } | null
 *   purchaseTimeline   : { targetDate, urgency, notes, source, sourceDate } | null
 *   currentTools[]     : { name, category, source, sourceDate }
 *   businessGoals[]    : { goal, source, sourceDate }
 *   recurringObjections[]: { objection, occurrences, firstSeen, lastSeen, resolved, response }
 *
 * source values: 'call_note' | 'transcript' | 'sdr_manual' | 'migrated'
 * authority values: 'primary' | 'influencer' | 'gatekeeper' | 'unknown'
 * strength values:  'stronger' | 'weaker' | 'unknown'
 * budget.status:    'confirmed' | 'exploring' | 'no_budget' | 'unknown'
 * purchaseTimeline.urgency: 'immediate' | 'this_quarter' | 'next_quarter' | 'exploring' | 'unknown'
 *
 * Phase 7C-1 — reviewStatus per sub-object:
 *   'pending'   — extracted by AI (source: transcript). Excluded from prompt context.
 *                 Awaiting SDR review.
 *   'confirmed' — accepted by SDR, authored by SDR, or migrated. Included in prompts.
 *   'dismissed' — rejected by SDR. Excluded from prompts.
 *   absent      — treated as 'confirmed' (backward compat for pre-7C items).
 *   Use isConfirmed(item) — do NOT inline this check.
 *
 * Metadata fields (never injected into prompt context):
 *   lastExtractedFrom : activityId of the conversation that last contributed
 *   lastUpdated       : ISO timestamp
 *   extractionCount   : number of conversations that have contributed
 */
export function createAccountKnowledge(overrides = {}) {
  return {
    competitors:          [],
    decisionMakers:       [],
    budget:               null,
    purchaseTimeline:     null,
    currentTools:         [],
    businessGoals:        [],
    recurringObjections:  [],
    lastExtractedFrom:    null,
    lastUpdated:          null,
    extractionCount:      0,
    ...overrides,
  };
}

/**
 * isConfirmed — single authoritative check for whether an accountKnowledge
 * sub-object should be treated as trusted (visible in prompts, shown as
 * confirmed in UI).
 *
 * Rules:
 *   reviewStatus === 'confirmed'  → true
 *   reviewStatus absent/undefined → true  (backward compat: pre-7C items)
 *   reviewStatus === 'pending'    → false (AI-extracted, awaiting SDR review)
 *   reviewStatus === 'dismissed'  → false (SDR-rejected)
 *   item is null/undefined        → false
 *
 * Use this helper everywhere. Do NOT inline the condition in callers.
 * Referenced by: buildLeadContext() (prompts.js), AccountKnowledgeTab (Phase 7C-2).
 */
export function isConfirmed(item) {
  if (!item) return false;
  return item.reviewStatus !== 'pending' && item.reviewStatus !== 'dismissed';
}

/**
 * mergeAccountKnowledge — pure merge function for accountKnowledge patches.
 *
 * Rules:
 *   Arrays   : deduplicate by identity key (name/goal/objection), never replace.
 *              recurringObjections increments occurrences on match.
 *   budget   : replace entirely when patch.budget is non-null (single state per account).
 *   purchaseTimeline : replace entirely when patch.purchaseTimeline is non-null.
 *   metadata : lastUpdated always set to now; extractionCount always incremented.
 *
 * Idempotent: calling twice with the same patch produces the same result as once.
 * Pure: does not mutate either argument. Returns a new object.
 */
export function mergeAccountKnowledge(existing, patch) {
  const now = new Date().toISOString();

  // ── competitors — dedupe by name (case-insensitive) ──
  const mergedCompetitors = [...(existing.competitors || [])];
  for (const c of (patch.competitors || [])) {
    const key = c.name?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedCompetitors.findIndex(e => e.name?.toLowerCase().trim() === key);
    if (idx === -1) {
      mergedCompetitors.push(c);
    } else {
      // Update context/strength if the new entry provides richer info
      mergedCompetitors[idx] = {
        ...mergedCompetitors[idx],
        strength: c.strength && c.strength !== 'unknown' ? c.strength : mergedCompetitors[idx].strength,
        context:  c.context  || mergedCompetitors[idx].context,
      };
    }
  }

  // ── decisionMakers — dedupe by name (case-insensitive) ──
  const mergedDMs = [...(existing.decisionMakers || [])];
  for (const dm of (patch.decisionMakers || [])) {
    const key = dm.name?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedDMs.findIndex(e => e.name?.toLowerCase().trim() === key);
    if (idx === -1) {
      mergedDMs.push(dm);
    } else {
      mergedDMs[idx] = {
        ...mergedDMs[idx],
        role:      dm.role      || mergedDMs[idx].role,
        authority: dm.authority && dm.authority !== 'unknown' ? dm.authority : mergedDMs[idx].authority,
        notes:     dm.notes     || mergedDMs[idx].notes,
      };
    }
  }

  // ── currentTools — dedupe by name (case-insensitive) ──
  const mergedTools = [...(existing.currentTools || [])];
  for (const t of (patch.currentTools || [])) {
    const key = t.name?.toLowerCase().trim();
    if (!key) continue;
    if (!mergedTools.find(e => e.name?.toLowerCase().trim() === key)) {
      mergedTools.push(t);
    }
  }

  // ── businessGoals — dedupe by goal string (case-insensitive) ──
  const mergedGoals = [...(existing.businessGoals || [])];
  for (const g of (patch.businessGoals || [])) {
    const key = g.goal?.toLowerCase().trim();
    if (!key) continue;
    if (!mergedGoals.find(e => e.goal?.toLowerCase().trim() === key)) {
      mergedGoals.push(g);
    }
  }

  // ── recurringObjections — dedupe by objection string; increment occurrences on match ──
  const mergedObjections = [...(existing.recurringObjections || [])];
  for (const o of (patch.recurringObjections || [])) {
    const key = o.objection?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedObjections.findIndex(e => e.objection?.toLowerCase().trim() === key);
    if (idx === -1) {
      mergedObjections.push({ ...o, occurrences: o.occurrences || 1, firstSeen: o.firstSeen || now, lastSeen: now });
    } else {
      mergedObjections[idx] = {
        ...mergedObjections[idx],
        occurrences: (mergedObjections[idx].occurrences || 1) + 1,
        lastSeen:    now,
        resolved:    o.resolved !== undefined ? o.resolved : mergedObjections[idx].resolved,
        response:    o.response || mergedObjections[idx].response,
      };
    }
  }

  return {
    competitors:         mergedCompetitors,
    decisionMakers:      mergedDMs,
    budget:              patch.budget            !== undefined ? patch.budget            : existing.budget,
    purchaseTimeline:    patch.purchaseTimeline   !== undefined ? patch.purchaseTimeline   : existing.purchaseTimeline,
    currentTools:        mergedTools,
    businessGoals:       mergedGoals,
    recurringObjections: mergedObjections,
    lastExtractedFrom:   patch.lastExtractedFrom !== undefined ? patch.lastExtractedFrom : existing.lastExtractedFrom,
    lastUpdated:         now,
    extractionCount:     (existing.extractionCount || 0) + 1,
  };
}

/**
 * createIntelligence — factory for the intelligence object.
 *
 * OWNERSHIP — Phase 7B (Option C Hybrid Model):
 *   INTELLIGENCE owns (scoring + signal layer):
 *     buyingSignals, objections, painPoints, leadTemperature,
 *     meetingProbability, aiRecommendation
 *
 *   ACCOUNT KNOWLEDGE owns (account fact layer — see createAccountKnowledge):
 *     competitors, decisionMakers, budget, purchaseTimeline,
 *     currentTools, businessGoals, recurringObjections
 *
 * @deprecated fields below are retained as read-only fallbacks for leads
 * that pre-date Phase 7B migration. Do NOT write to them. Use
 * updateAccountKnowledge() instead. See INTELLIGENCE_REJECTED_FIELDS.
 */
export function createIntelligence(overrides = {}) {
  return {
    summary:                    '',
    painPoints:                 [],
    objections:                 [],
    buyingSignals:              [],
    preferredCommunicationStyle:'',
    leadTemperature:            'Cold',
    meetingProbability:         0,
    nextBestAction:             '',
    lastConversation:           '',
    lastUpdated:                null,

    // ── AI Recommendation Storage — Phase 3 ────────────────────────────────
    // aiRecommendation : full situational analysis text reviewed by the SDR.
    //                    Set by Copilot 'situational' save only.
    //                    NOT populated from email/SMS/VM/LinkedIn drafts.
    //                    NOT injected into buildLeadContext (avoids feedback loop).
    // insightVersion   : increments on every AI recommendation write only.
    //                    Does NOT increment on transcript/call-note updates.
    // lastAiUpdate     : ISO timestamp of last AI recommendation write.
    aiRecommendation: null,
    insightVersion:   0,
    lastAiUpdate:     null,

    // ── Deprecated — Phase 7B ──────────────────────────────────────────────
    // These fields have migrated to accountKnowledge.
    // Retained here as empty defaults for backward-compat reads on old leads.
    // updateIntelligence() rejects writes to these fields.
    // See INTELLIGENCE_REJECTED_FIELDS for the authoritative list.
    competitors:    [],   // @deprecated → accountKnowledge.competitors
    decisionMakers: [],   // @deprecated → accountKnowledge.decisionMakers
    budget:         '',   // @deprecated → accountKnowledge.budget
    timeline:       '',   // @deprecated → accountKnowledge.purchaseTimeline

    ...overrides,
  };
}

/**
 * migrateLead — upgrades a flat v3 lead to the v4 schema, then to Phase 7B.
 * Non-destructive: preserves all existing fields.
 *
 * Migration gates:
 *   _v4 absent        → run full v3→v4 migration + Phase 7B bootstrap
 *   _v4 present,
 *   accountKnowledge
 *   absent            → run Phase 7B bootstrap only (v4 lead pre-dating Phase 7B)
 *   both present      → no-op, already fully migrated
 */
export function migrateLead(lead) {
  // ── Phase 7B bootstrap — runs on all _v4 leads that pre-date Phase 7B ──
  // Promotes existing intelligence fields to accountKnowledge without losing data.
  if (lead._v4 && !lead.accountKnowledge) {
    const existingIntel  = lead.intelligence || {};
    const migrationDate  = existingIntel.lastUpdated || new Date().toISOString();

    const bootstrapped = createAccountKnowledge({
      // competitors[] — promote string array to structured objects
      competitors: (existingIntel.competitors || [])
        .filter(Boolean)
        .map(name => ({
          name,
          strength:   'unknown',
          context:    '',
          source:     'migrated',
          sourceDate: migrationDate,
        })),

      // decisionMakers[] — promote string array to structured objects
      decisionMakers: (existingIntel.decisionMakers || [])
        .filter(Boolean)
        .map(name => ({
          name,
          role:       '',
          authority:  'unknown',
          notes:      '',
          source:     'migrated',
          sourceDate: migrationDate,
        })),

      // budget — preserve legacy free-text string as notes; do not attempt parsing
      // Revision 2: bootstrap as notes-only to avoid losing historical visibility.
      budget: existingIntel.budget
        ? {
            status:     'unknown',
            amount:     '',
            approvedBy: '',
            notes:      existingIntel.budget,
            source:     'migrated',
            sourceDate: migrationDate,
          }
        : null,

      // purchaseTimeline — preserve legacy free-text string as notes; do not parse
      // Revision 2: same rationale as budget — preserve without inventing structure.
      purchaseTimeline: existingIntel.timeline
        ? {
            targetDate: '',
            urgency:    'unknown',
            notes:      existingIntel.timeline,
            source:     'migrated',
            sourceDate: migrationDate,
          }
        : null,
    });

    return { ...lead, accountKnowledge: bootstrapped };
  }

  if (lead._v4) return lead; // already fully migrated

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

    // Phase 7B: bootstrap accountKnowledge from v3 data at the same time as _v4 migration
    accountKnowledge: createAccountKnowledge({
      competitors: competitors.map(name => ({
        name, strength: 'unknown', context: '',
        source: 'migrated', sourceDate: new Date().toISOString(),
      })),
      decisionMakers: (lead.contact ? [lead.contact] : []).map(name => ({
        name, role: '', authority: 'unknown', notes: '',
        source: 'migrated', sourceDate: new Date().toISOString(),
      })),
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
