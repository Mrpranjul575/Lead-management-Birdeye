/**
 * BIRDEYE SDR WORKSPACE — LEAD SCHEMA v4
 * Every field documented. Used as reference, not enforced at runtime.
 */

/**
 * Activity types — used across the unified activity engine
 */
export const ACTIVITY_TYPES = {
  CALL:             'Call',
  EMAIL:            'Email',
  SMS:              'SMS',
  LINKEDIN:         'LinkedIn',
  VOICEMAIL:        'Voicemail',
  MEETING:          'Meeting',
  NOTE:             'Note',
  AI_GENERATION:    'AI Generation',
  TRANSCRIPT:       'Transcript',
  CADENCE_UPDATE:   'Cadence Update',
  STATUS_CHANGE:    'Status Change',
  FOLLOW_UP:        'Follow Up',
  IMPORT:           'Import',
  // Phase 10D — Knowledge Events
  // Fired when an SDR confirms, dismisses, or when AI detects an AK fact.
  // Distinct from AI_GENERATION (intelligence signals) — these are trust-model events.
  KNOWLEDGE_UPDATE: 'Knowledge Update',
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
 * generateExternalId — single authoritative implementation for external IDs.
 *
 * Used by:
 *   - migrateLead() — assigns externalId to leads that lack one
 *   - addLead() via migrateLead() — new leads receive an externalId at creation
 *   - future: imports, migrations, BulkCSV
 *
 * Uses crypto.randomUUID() when available (modern browsers + Node 19+).
 * Falls back to a timestamp + random base-36 slug for older environments.
 *
 * Never throws. Always returns a non-empty string.
 */
export function generateExternalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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
 *   'pending'    — extracted by AI (source: transcript). Excluded from prompt context.
 *                  Awaiting SDR review.
 *   'confirmed'  — accepted by SDR, authored by SDR, or migrated. Included in prompts.
 *   'dismissed'  — rejected by SDR. Excluded from prompts. Skipped in identity dedup.
 *                  Re-extractable in future transcripts.
 *   'superseded' — Phase 7D. Was true, now replaced by a newer confirmed fact.
 *                  Excluded from prompts and active display. Retained for history.
 *                  Skipped in identity dedup (same as dismissed).
 *   absent       — treated as 'confirmed' (backward compat for pre-7C items).
 *   Use isConfirmed(item) — do NOT inline this check.
 *
 * Phase 7D — conflictWith per sub-object (optional field, absent by default):
 *   When a new transcript extraction disagrees with a confirmed fact, the conflict
 *   is stored as conflictWith on the confirmed entry rather than as a separate item.
 *   The confirmed entry retains its reviewStatus: 'confirmed' and remains in prompts.
 *   conflictWith: {
 *     [extracted values — same shape as the parent sub-object's factual fields]
 *     source: string,
 *     sourceDate: ISO string,
 *     extractedFrom: activityId | null,
 *   } | null | undefined
 *   Cleared by resolveConflict() (Phase 7D-B) when the SDR resolves the conflict.
 *   Use hasConflict(item) to check — do NOT inline.
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
 * isConfirmed — UI-layer trust check for accountKnowledge sub-objects.
 *
 * Answers: "Has an SDR accepted this fact?"
 * Used by: AccountKnowledgeTab display, PrepareCallDrawer, OverviewTab, ReEngage.
 *
 * A confirmed item with conflictWith set is still confirmed — the SDR accepted
 * the fact, and a newer contested extraction exists. The conflict is shown in UI
 * but the fact remains visible as confirmed context.
 *
 * NOTE: This is NOT the prompt-injection filter. Use isPromptEligible() in
 * buildLeadContext(). The two functions answer different questions:
 *   isConfirmed()      → "Is this a trusted fact for display?"
 *   isPromptEligible() → "Should this fact enter AI prompt context right now?"
 *
 * Rules:
 *   reviewStatus === 'confirmed'  → true
 *   reviewStatus absent/undefined → true  (backward compat: pre-7C items)
 *   reviewStatus === 'pending'    → false (AI-extracted, awaiting SDR review)
 *   reviewStatus === 'dismissed'  → false (SDR-rejected)
 *   reviewStatus === 'superseded' → false (Phase 7D: replaced by newer confirmed fact)
 *   item is null/undefined        → false
 *
 * Do NOT inline this check in callers.
 */
export function isConfirmed(item) {
  if (!item) return false;
  return item.reviewStatus !== 'pending'
      && item.reviewStatus !== 'dismissed'
      && item.reviewStatus !== 'superseded';
}

/**
 * hasConflict — returns true if an accountKnowledge sub-object has a pending
 * conflict stored in conflictWith.
 *
 * A conflict means: the item is confirmed, but a new transcript extraction
 * disagreed with its values. conflictWith holds the extraction's values for
 * SDR review. resolveConflict() (Phase 7D-B) clears conflictWith on resolution.
 *
 * Do NOT inline this check in callers.
 */
export function hasConflict(item) {
  if (!item) return false;
  return item.conflictWith != null;
}

/**
 * isPromptEligible — prompt-injection filter for accountKnowledge sub-objects.
 *
 * Answers: "Should this fact enter AI prompt context right now?"
 * Used by: buildLeadContext() ONLY. Do NOT use in UI display code.
 *
 * A fact is prompt-eligible when it is confirmed AND has no active conflict.
 * When conflictWith is set, the fact is contested — the AI should not receive
 * a fact that the SDR has not yet resolved as definitely correct.
 *
 * This preserves the Phase 7C trust boundary:
 *   pending     → excluded (not yet reviewed)
 *   dismissed   → excluded (rejected)
 *   superseded  → excluded (replaced)
 *   conflict    → excluded (contested, awaiting resolution)
 *   confirmed + no conflict → included (fully trusted)
 *
 * = isConfirmed(item) && !hasConflict(item)
 *
 * Do NOT inline this check in callers. Do NOT use in UI — use isConfirmed() there.
 */
export function isPromptEligible(item) {
  return isConfirmed(item) && !hasConflict(item);
}

/**
 * hasMeaningfulDifference — returns true when a pending extraction carries
 * substantively different values from the existing confirmed entry.
 *
 * Used by mergeAccountKnowledge() to decide whether to set conflictWith.
 * Coarse differences (whitespace, capitalization, 'unknown' vs absent) do NOT
 * constitute a conflict. Only substantive value changes trigger conflict storage.
 *
 * Pure function. Not exported — internal to mergeAccountKnowledge().
 */
function hasMeaningfulDifference(field, existing, incoming) {
  const norm = v => (v || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  const different = (a, b) => norm(a) !== norm(b) && norm(b) !== '' && norm(b) !== 'unknown';

  switch (field) {
    case 'competitors':
      return different(existing.strength, incoming.strength)
          || different(existing.context,  incoming.context);
    case 'decisionMakers':
      return different(existing.role,      incoming.role)
          || different(existing.authority, incoming.authority);
    case 'currentTools':
      return different(existing.category, incoming.category);
    case 'businessGoals':
      return false; // goals are immutable once confirmed; no sub-values to conflict
    case 'recurringObjections':
      return false; // occurrences tracked separately; resolution state not conflictable
    case 'budget':
      return different(existing.status, incoming.status)
          || different(existing.amount, incoming.amount);
    case 'purchaseTimeline':
      return different(existing.urgency,    incoming.urgency)
          || different(existing.targetDate, incoming.targetDate);
    default:
      return false;
  }
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
 * Phase 7C-2A — behavioral protections:
 *   1. CONFIRMED PROTECTION (arrays): a confirmed existing entry is never downgraded
 *      or overwritten by a pending patch item.
 *   2. DISMISSED SKIP: dismissed entries excluded from identity-key matching.
 *   3. CONFIRMED PROTECTION (scalars): confirmed budget/purchaseTimeline not
 *      overwritten by pending patches.
 *   4. OBJECTION PROTECTION: occurrence count not incremented by pending patches.
 *
 * Phase 7D-A — conflict detection:
 *   5. SUPERSEDED SKIP: superseded entries excluded from identity-key matching,
 *      same as dismissed. Allows re-extraction of a superseded entity.
 *   6. CONFLICT DETECTION (arrays): when a pending patch matches a confirmed entry
 *      AND the values differ meaningfully (per hasMeaningfulDifference()), the
 *      conflict is stored as conflictWith on the confirmed entry. The confirmed
 *      entry is NOT mutated. conflictWith holds the extraction's values + provenance.
 *   7. CONFLICT DETECTION (scalars): same logic for budget and purchaseTimeline.
 *
 * Idempotent: calling twice with the same patch produces the same result as once.
 * Pure: does not mutate either argument. Returns a new object.
 */
export function mergeAccountKnowledge(existing, patch) {
  const now = new Date().toISOString();

  // ── helpers ──────────────────────────────────────────────────────────────
  // Entries invisible to identity-key dedup: dismissed and superseded.
  const isInvisible = e => e.reviewStatus === 'dismissed' || e.reviewStatus === 'superseded';

  // ── competitors — dedupe by name (case-insensitive) ──
  const mergedCompetitors = [...(existing.competitors || [])];
  for (const c of (patch.competitors || [])) {
    const key = c.name?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedCompetitors.findIndex(
      e => e.name?.toLowerCase().trim() === key && !isInvisible(e)
    );
    if (idx === -1) {
      mergedCompetitors.push(c);
    } else {
      const existingConfirmed = isConfirmed(mergedCompetitors[idx]);
      const patchIsPending    = !c.reviewStatus || c.reviewStatus === 'pending';
      if (existingConfirmed && patchIsPending) {
        // Phase 7D-A: instead of silently ignoring, detect conflict
        if (hasMeaningfulDifference('competitors', mergedCompetitors[idx], c)) {
          mergedCompetitors[idx] = {
            ...mergedCompetitors[idx],
            conflictWith: {
              strength:      c.strength,
              context:       c.context,
              source:        c.source,
              sourceDate:    c.sourceDate,
              extractedFrom: patch.lastExtractedFrom || null,
            },
          };
        }
        // No meaningful difference → no-op (same as before)
        continue;
      }
      mergedCompetitors[idx] = {
        ...mergedCompetitors[idx],
        strength: c.strength && c.strength !== 'unknown' ? c.strength : mergedCompetitors[idx].strength,
        context:  c.context  || mergedCompetitors[idx].context,
        reviewStatus: existingConfirmed ? mergedCompetitors[idx].reviewStatus : (c.reviewStatus || mergedCompetitors[idx].reviewStatus),
      };
    }
  }

  // ── decisionMakers — dedupe by name (case-insensitive) ──
  const mergedDMs = [...(existing.decisionMakers || [])];
  for (const dm of (patch.decisionMakers || [])) {
    const key = dm.name?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedDMs.findIndex(
      e => e.name?.toLowerCase().trim() === key && !isInvisible(e)
    );
    if (idx === -1) {
      mergedDMs.push(dm);
    } else {
      const existingConfirmed = isConfirmed(mergedDMs[idx]);
      const patchIsPending    = !dm.reviewStatus || dm.reviewStatus === 'pending';
      if (existingConfirmed && patchIsPending) {
        if (hasMeaningfulDifference('decisionMakers', mergedDMs[idx], dm)) {
          mergedDMs[idx] = {
            ...mergedDMs[idx],
            conflictWith: {
              role:          dm.role,
              authority:     dm.authority,
              notes:         dm.notes,
              source:        dm.source,
              sourceDate:    dm.sourceDate,
              extractedFrom: patch.lastExtractedFrom || null,
            },
          };
        }
        continue;
      }
      mergedDMs[idx] = {
        ...mergedDMs[idx],
        role:        dm.role      || mergedDMs[idx].role,
        authority:   dm.authority && dm.authority !== 'unknown' ? dm.authority : mergedDMs[idx].authority,
        notes:       dm.notes     || mergedDMs[idx].notes,
        reviewStatus: existingConfirmed ? mergedDMs[idx].reviewStatus : (dm.reviewStatus || mergedDMs[idx].reviewStatus),
      };
    }
  }

  // ── currentTools — dedupe by name (case-insensitive) ──
  const mergedTools = [...(existing.currentTools || [])];
  for (const t of (patch.currentTools || [])) {
    const key = t.name?.toLowerCase().trim();
    if (!key) continue;
    const existingEntry = mergedTools.find(
      e => e.name?.toLowerCase().trim() === key && !isInvisible(e)
    );
    if (!existingEntry) {
      mergedTools.push(t);
    } else {
      const existingConfirmed = isConfirmed(existingEntry);
      const patchIsPending    = !t.reviewStatus || t.reviewStatus === 'pending';
      if (existingConfirmed && patchIsPending && hasMeaningfulDifference('currentTools', existingEntry, t)) {
        const toolIdx = mergedTools.indexOf(existingEntry);
        mergedTools[toolIdx] = {
          ...mergedTools[toolIdx],
          conflictWith: {
            category:      t.category,
            source:        t.source,
            sourceDate:    t.sourceDate,
            extractedFrom: patch.lastExtractedFrom || null,
          },
        };
      }
    }
  }

  // ── businessGoals — dedupe by goal string (case-insensitive) ──
  const mergedGoals = [...(existing.businessGoals || [])];
  for (const g of (patch.businessGoals || [])) {
    const key = g.goal?.toLowerCase().trim();
    if (!key) continue;
    const alreadyExists = mergedGoals.find(
      e => e.goal?.toLowerCase().trim() === key && !isInvisible(e)
    );
    if (!alreadyExists) {
      mergedGoals.push(g);
    }
    // Goals have no sub-values to conflict — no conflictWith logic needed
  }

  // ── recurringObjections — dedupe by objection string ──
  const mergedObjections = [...(existing.recurringObjections || [])];
  for (const o of (patch.recurringObjections || [])) {
    const key = o.objection?.toLowerCase().trim();
    if (!key) continue;
    const idx = mergedObjections.findIndex(
      e => e.objection?.toLowerCase().trim() === key && !isInvisible(e)
    );
    if (idx === -1) {
      mergedObjections.push({ ...o, occurrences: o.occurrences || 1, firstSeen: o.firstSeen || now, lastSeen: now });
    } else {
      const existingConfirmed = isConfirmed(mergedObjections[idx]);
      const patchIsPending    = !o.reviewStatus || o.reviewStatus === 'pending';
      if (existingConfirmed && patchIsPending) {
        // Confirmed objection: no occurrence increment, no conflictWith (no sub-values to conflict)
        continue;
      }
      mergedObjections[idx] = {
        ...mergedObjections[idx],
        occurrences: (mergedObjections[idx].occurrences || 1) + 1,
        lastSeen:    now,
        resolved:    o.resolved !== undefined ? o.resolved : mergedObjections[idx].resolved,
        response:    o.response || mergedObjections[idx].response,
      };
    }
  }

  // ── budget — scalar replace-on-write with confirmed protection + conflict detection ──
  let resolvedBudget = existing.budget;
  if (patch.budget !== undefined) {
    const existingConfirmed = existing.budget && isConfirmed(existing.budget);
    const patchIsPending    = !patch.budget?.reviewStatus || patch.budget?.reviewStatus === 'pending';
    if (existingConfirmed && patchIsPending) {
      if (hasMeaningfulDifference('budget', existing.budget, patch.budget)) {
        resolvedBudget = {
          ...existing.budget,
          conflictWith: {
            status:        patch.budget.status,
            amount:        patch.budget.amount,
            notes:         patch.budget.notes,
            source:        patch.budget.source,
            sourceDate:    patch.budget.sourceDate,
            extractedFrom: patch.lastExtractedFrom || null,
          },
        };
      }
      // No meaningful difference → keep existing unchanged
    } else {
      resolvedBudget = patch.budget;
    }
  }

  // ── purchaseTimeline — scalar replace-on-write with confirmed protection + conflict detection ──
  let resolvedTimeline = existing.purchaseTimeline;
  if (patch.purchaseTimeline !== undefined) {
    const existingConfirmed = existing.purchaseTimeline && isConfirmed(existing.purchaseTimeline);
    const patchIsPending    = !patch.purchaseTimeline?.reviewStatus || patch.purchaseTimeline?.reviewStatus === 'pending';
    if (existingConfirmed && patchIsPending) {
      if (hasMeaningfulDifference('purchaseTimeline', existing.purchaseTimeline, patch.purchaseTimeline)) {
        resolvedTimeline = {
          ...existing.purchaseTimeline,
          conflictWith: {
            urgency:       patch.purchaseTimeline.urgency,
            targetDate:    patch.purchaseTimeline.targetDate,
            notes:         patch.purchaseTimeline.notes,
            source:        patch.purchaseTimeline.source,
            sourceDate:    patch.purchaseTimeline.sourceDate,
            extractedFrom: patch.lastExtractedFrom || null,
          },
        };
      }
      // No meaningful difference → keep existing unchanged
    } else {
      resolvedTimeline = patch.purchaseTimeline;
    }
  }

  return {
    competitors:         mergedCompetitors,
    decisionMakers:      mergedDMs,
    budget:              resolvedBudget,
    purchaseTimeline:    resolvedTimeline,
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

    return { ...lead, accountKnowledge: bootstrapped, externalId: lead.externalId || generateExternalId() };
  }

  if (lead._v4) return { ...lead, externalId: lead.externalId || generateExternalId() }; // already fully migrated

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
    externalId: lead.externalId || generateExternalId(),

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

    // Phase 8B-2: separate raw research notes from generated AE Notes output.
    // aeNotes          = SDR raw research (GMB, competitors, keywords, scan reports)
    // aeNotesGenerated = structured output from Generate AE Notes workflow
    // Defaulting here ensures new migrations carry the field forward.
    // Existing _v4 leads receive the field on next save (no forced re-migration needed).
    aeNotesGenerated: lead.aeNotesGenerated || '',
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
