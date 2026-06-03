/**
 * INTELLIGENCE ENGINE
 * Pure deterministic signal derivation from lead data.
 *
 * Constraints:
 *   - No React
 *   - No AppContext
 *   - No localStorage
 *   - No AI calls
 *   - No side effects
 *   - Same input always produces same output
 *
 * Do NOT persist derived signals on the lead object.
 * Consumers call deriveSignals(lead) directly at render time.
 * This ensures signals are always current without migrations.
 */

import { getPendingSteps } from './cadenceUtils';

// ─── opportunitySize ──────────────────────────────────────────────────────────
//
// Primary inputs : aiVisibility, compGap
// Secondary input: reviews (max 1 of 7 pts — size indicator, not quality)
//
// Thresholds (calibrated against mock lead set):
//   Large  >= 6 pts
//   Medium >= 4 pts
//   Small  <  4 pts

function deriveOpportunitySize(lead) {
  let pts = 0;

  // aiVisibility — lower % = larger gap = bigger opportunity (0–3 pts)
  const vis = lead.aiVisibility ?? 100;
  if      (vis < 10) pts += 3;
  else if (vis < 20) pts += 2;
  else if (vis < 30) pts += 1;
  // vis >= 30 → 0 pts (already visible)

  // compGap — urgency of the competitive situation (0–3 pts)
  if      (lead.compGap === 'High')   pts += 3;
  else if (lead.compGap === 'Medium') pts += 2;
  else if (lead.compGap === 'Low')    pts += 1;
  // unknown/absent → 0 pts

  // reviews — secondary size modifier only (0–1 pt)
  // Indicates an established business worth a larger deal, but cannot
  // dominate the signal — a high-review lead with full visibility is
  // still a Small opportunity.
  if ((lead.reviews || 0) > 80) pts += 1;

  if (pts >= 6) return 'Large';
  if (pts >= 4) return 'Medium';
  return 'Small';
}

// ─── urgency ─────────────────────────────────────────────────────────────────
//
// Inputs: lead.stage, pending cadence steps
//
// NOTE: lead.lastTouch is a human-readable string ("2h ago", "8d ago", "Never")
// and is NOT parseable as a timestamp. Recency-based urgency is therefore
// unavailable without a dedicated lastTouchAt: ISO timestamp field. When that
// field is introduced, this function should incorporate it — e.g. a lead in
// 'Contacted' stage with lastTouchAt > 3 days ago should upgrade to 'High'.
// For now, urgency is derived from stage + cadence execution state only.

function deriveUrgency(lead) {
  // Stage-based critical urgency (highest priority)
  if (lead.stage === 'Hot')         return 'Critical';
  if (lead.stage === 'Demo Booked') return 'Critical';

  // Active cadence steps due today
  const pending = getPendingSteps(lead);
  if (pending.length > 0) return 'High';

  // Pipeline stages that require near-term action
  if (lead.stage === 'Follow Up')  return 'High';
  if (lead.stage === 'Contacted')  return 'High';

  // Stages requiring attention but not immediately
  if (lead.stage === 'Nurturing')  return 'Medium';
  if (lead.stage === 'Re-engage')  return 'Medium';

  // New, Lost, Converted — no immediate action needed
  return 'Low';
}

// ─── engagementLevel ─────────────────────────────────────────────────────────
//
// Input: total logged activities + touchLog entries
//
// IMPORTANT LIMITATION — COUNT-ONLY MODEL:
// This signal is based on activity COUNT, not recency.
// A lead with 6 activities logged 6 months ago will show 'Active'.
// This is a known limitation: activities[].timestamp exists but
// adding time-window filtering here would introduce implicit date
// dependency and make the function non-deterministic across sessions.
//
// True recency-aware engagement requires lead.lastTouchAt (ISO timestamp),
// which does not currently exist on the lead schema. When introduced,
// update this function to weight recent activities more heavily.
// Example future logic: activities logged in the last 14 days only.

function deriveEngagementLevel(lead) {
  const total = (lead.activities || []).length + (lead.touchLog || []).length;
  if (total >= 6) return 'Active';
  if (total >= 3) return 'Warm';
  if (total >= 1) return 'Cold';
  return 'Silent';
}

// ─── riskLevel ───────────────────────────────────────────────────────────────
//
// Inputs: intel.objections, lead.stage, activity count
//
// Models the two most common failure modes:
//   1. Explicit resistance — documented objections
//   2. Silent disengagement — stuck in Nurturing/Re-engage with no engagement

function deriveRiskLevel(lead) {
  const intel      = lead.intelligence || {};
  const objections = (intel.objections || []).length;
  const activities = (lead.activities  || []).length + (lead.touchLog || []).length;

  // Explicit high risk: multiple documented objections
  if (objections >= 2) return 'High';

  // Structural high risk: stages where leads routinely go dark
  if (lead.stage === 'Re-engage' || lead.stage === 'Lost') return 'High';

  // Moderate risk: one documented objection
  if (objections === 1) return 'Medium';

  // Moderate risk: Nurturing with zero engagement logged
  if (lead.stage === 'Nurturing' && activities === 0) return 'Medium';

  return 'Low';
}

// ─── buyingIntentScore ────────────────────────────────────────────────────────
//
// Inputs: intel.buyingSignals, intel.objections, lead.stage
//
// IMPORTANT — This is fully independent from computeAiScore (opportunity-based).
//
//   aiScore           answers: "How valuable is this opportunity externally?"
//   buyingIntentScore answers: "How ready is this person to buy?"
//
// These are orthogonal dimensions. A lead can have a Large opportunity (high aiScore)
// with Low intent (many objections, just Contacted). Or a Small opportunity
// (low aiScore) with High intent (Demo Booked, buying signals confirmed).
//
// Therefore: DO NOT consume lead.aiScore, lead.aiVisibility, lead.compGap,
// lead.reviews, or lead.rating here.

function deriveBuyingIntentScore(lead) {
  const intel = lead.intelligence || {};

  // Base score from pipeline stage progression
  const stageBase = {
    'Demo Booked': 30,
    'Hot':         25,
    'Contacted':   15,
    'Follow Up':   12,
    'Nurturing':    8,
    'New':          5,
    'Re-engage':    3,
    'Lost':         0,
    'Converted':    0,
  };
  let score = stageBase[lead.stage] ?? 0;

  // Buying signals: each confirmed signal adds 15pts, capped at 60
  score += Math.min((intel.buyingSignals?.length || 0) * 15, 60);

  // Objections: each documented objection subtracts 12pts, capped at -36
  score -= Math.min((intel.objections?.length || 0) * 12, 36);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── buildScoreBreakdown ──────────────────────────────────────────────────────
//
// Phase 11 — Explainable Lead Scoring
//
// Pure function. Same constraints as the rest of this module.
//
// CONTRACT
// ────────
// buildScoreBreakdown(lead) → ScoreBreakdown
//
// ScoreBreakdown:
//   aiScore           : number  — the final opportunity score (0–100)
//   contributors      : Contributor[]  — every input to aiScore, sorted by |value| desc
//   buyingIntentScore : number  — the final buying intent score (0–100)
//   buyingContributors: Contributor[]  — every input to buyingIntentScore
//   timestamp         : ISO string  — when this breakdown was derived
//
// Contributor:
//   id       : string  — stable key, safe for React key prop
//   label    : string  — human-readable name
//   value    : number  — actual points contributed (negative for penalties)
//   max      : number  — maximum possible contribution for this factor
//   pct      : number  — value / Math.abs(max) * 100, clamped 0–100 (for bar width)
//   isPositive: boolean — true when value > 0
//   isNeutral : boolean — true when value === 0
//   reason   : string  — one-line human explanation of the current value
//   category : 'opportunity' | 'engagement' | 'intelligence' | 'pipeline' | 'penalty'
//
// Design rules:
//   - Mirror the exact arithmetic in computeAiScore / deriveBuyingIntentScore.
//     If those functions change, this function MUST be updated in lockstep.
//   - Return contributors even when value === 0 (explains what is NOT contributing).
//   - Never throws — graceful on missing fields.
//   - Exported so LeadPage and timelineUtils can import without circular deps.

/**
 * buildScoreBreakdown(lead) → ScoreBreakdown
 *
 * @param {object} lead
 * @returns {{ aiScore, contributors, buyingIntentScore, buyingContributors, timestamp }}
 */
export function buildScoreBreakdown(lead) {
  if (!lead) return _emptyBreakdown();

  const intel    = lead.intelligence || {};
  const now      = new Date().toISOString();

  // ── Opportunity Score (aiScore) contributors ───────────────────────────
  // Mirrors computeAiScore() exactly — update both if formula changes.

  const vis = lead.aiVisibility ?? 0;
  const visValue = vis < 10 ? 25 : vis < 20 ? 18 : vis < 30 ? 10 : 3;
  const visReason = vis < 10  ? `${vis}% visibility — severe gap, maximum opportunity`
                  : vis < 20  ? `${vis}% visibility — large gap, strong opportunity`
                  : vis < 30  ? `${vis}% visibility — moderate gap`
                  :             `${vis}% visibility — lead has reasonable presence`;

  const cgValue = lead.compGap === 'High'   ? 20
                : lead.compGap === 'Medium' ? 11
                : lead.compGap === 'Low'    ? 3  : 0;
  const cgReason = lead.compGap === 'High'   ? 'High competitor gap — urgent need'
                 : lead.compGap === 'Medium' ? 'Medium competitor gap'
                 : lead.compGap === 'Low'    ? 'Low competitor gap'
                 : 'Competitor gap unknown';

  const reviews = lead.reviews || 0;
  const revValue = reviews > 100 ? 15 : reviews > 50 ? 10 : reviews > 20 ? 6 : 1;
  const revReason = `${reviews} reviews — ${
    reviews > 100 ? 'established account, large deal potential'
    : reviews > 50  ? 'active account'
    : reviews > 20  ? 'growing account'
    : 'early-stage account'}`;

  const rating = lead.rating || 0;
  const ratValue = rating >= 4.5 ? 10 : rating >= 4.2 ? 7 : rating >= 4.0 ? 4 : rating >= 3.5 ? 1 : 0;
  const ratReason = rating >= 4.5 ? `${rating}★ — excellent reputation`
                  : rating >= 4.2 ? `${rating}★ — strong reputation`
                  : rating >= 4.0 ? `${rating}★ — good reputation`
                  : rating >= 3.5 ? `${rating}★ — average reputation`
                  : rating > 0    ? `${rating}★ — below threshold`
                  : 'No rating data';

  const bsCount  = intel.buyingSignals?.length || 0;
  const bsAiValue = Math.min(bsCount * 4, 10);
  const bsAiReason = bsCount > 0
    ? `${bsCount} buying signal${bsCount !== 1 ? 's' : ''} detected (${bsCount}×4, capped at 10)`
    : 'No buying signals logged';

  const actCount = (lead.activities || []).length + (lead.touchLog || []).length;
  const actValue = actCount > 5 ? 4 : actCount > 2 ? 2 : actCount > 0 ? 1 : 0;
  const actReason = actCount > 5  ? `${actCount} activities — high engagement`
                  : actCount > 2  ? `${actCount} activities — moderate engagement`
                  : actCount > 0  ? `${actCount} activit${actCount === 1 ? 'y' : 'ies'} — early engagement`
                  : 'No activities logged yet';

  const stageScoreMap = {
    'Hot':7,'Demo Booked':6,'Contacted':4,'Follow Up':3,
    'Nurturing':2,'New':1,'Re-engage':1,'Lost':0,'Converted':0,
  };
  const stgValue  = stageScoreMap[lead.stage] ?? 1;
  const stgReason = `Stage: ${lead.stage || 'Unknown'}`;

  const objCount   = intel.objections?.length || 0;
  const penValue   = -Math.min(objCount * 3, 10);
  const penReason  = objCount > 0
    ? `${objCount} objection${objCount !== 1 ? 's' : ''} logged (${objCount}×−3, capped at −10)`
    : 'No objections — no penalty';

  const contributors = [
    { id:'visibility', label:'AI Visibility Gap', value:visValue,  max:25, category:'opportunity', reason:visReason  },
    { id:'compgap',    label:'Competitor Gap',    value:cgValue,   max:20, category:'opportunity', reason:cgReason   },
    { id:'reviews',    label:'Review Volume',     value:revValue,  max:15, category:'opportunity', reason:revReason  },
    { id:'rating',     label:'Rating Quality',    value:ratValue,  max:10, category:'opportunity', reason:ratReason  },
    { id:'signals_ai', label:'Buying Signals',    value:bsAiValue, max:10, category:'intelligence',reason:bsAiReason },
    { id:'activity',   label:'Activity Level',    value:actValue,  max:4,  category:'engagement',  reason:actReason  },
    { id:'stage',      label:'Pipeline Stage',    value:stgValue,  max:7,  category:'pipeline',    reason:stgReason  },
    { id:'objections', label:'Objections',        value:penValue,  max:10, category:'penalty',     reason:penReason  },
  ].map(c => ({
    ...c,
    pct:       Math.round(Math.abs(c.value) / Math.abs(c.max) * 100),
    isPositive: c.value > 0,
    isNeutral:  c.value === 0,
  }));

  // Sort: positives desc by value, then negatives
  const sorted = [
    ...contributors.filter(c => c.value > 0).sort((a, b) => b.value - a.value),
    ...contributors.filter(c => c.value === 0),
    ...contributors.filter(c => c.value < 0).sort((a, b) => a.value - b.value),
  ];

  const aiScore = Math.max(0, Math.min(100, Math.round(
    visValue + cgValue + revValue + ratValue + bsAiValue + actValue + stgValue + penValue
  )));

  // ── Buying Intent Score contributors ───────────────────────────────────
  // Mirrors deriveBuyingIntentScore() exactly.

  const stageBaseMap = {
    'Demo Booked':30,'Hot':25,'Contacted':15,'Follow Up':12,
    'Nurturing':8,'New':5,'Re-engage':3,'Lost':0,'Converted':0,
  };
  const stgBaseValue  = stageBaseMap[lead.stage] ?? 0;
  const stgBaseReason = `Stage: ${lead.stage || 'Unknown'} (pipeline readiness base)`;

  const bsIntentValue  = Math.min(bsCount * 15, 60);
  const bsIntentReason = bsCount > 0
    ? `${bsCount} buying signal${bsCount !== 1 ? 's' : ''} (${bsCount}×15, capped at 60)`
    : 'No buying signals — no intent boost';

  const objIntentValue  = -Math.min(objCount * 12, 36);
  const objIntentReason = objCount > 0
    ? `${objCount} objection${objCount !== 1 ? 's' : ''} (${objCount}×−12, capped at −36)`
    : 'No objections — no intent penalty';

  const buyingContributors = [
    { id:'stage_base',    label:'Pipeline Stage',  value:stgBaseValue,   max:30, category:'pipeline',    reason:stgBaseReason  },
    { id:'buying_signals',label:'Buying Signals',  value:bsIntentValue,  max:60, category:'intelligence', reason:bsIntentReason },
    { id:'obj_penalty',   label:'Objections',      value:objIntentValue, max:36, category:'penalty',      reason:objIntentReason},
  ].map(c => ({
    ...c,
    pct:       Math.round(Math.abs(c.value) / Math.abs(c.max) * 100),
    isPositive: c.value > 0,
    isNeutral:  c.value === 0,
  }));

  const buyingIntentScore = Math.max(0, Math.min(100, Math.round(
    stgBaseValue + bsIntentValue + objIntentValue
  )));

  return { aiScore, contributors: sorted, buyingIntentScore, buyingContributors, timestamp: now };
}

function _emptyBreakdown() {
  return {
    aiScore: 0, contributors: [],
    buyingIntentScore: 0, buyingContributors: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── deriveRankReasons ────────────────────────────────────────────────────────
//
// Phase 12 — Work Queue 2.0
//
// Returns a short array of human-readable reason labels explaining why this
// lead holds its current rank in the Work Queue.
//
// CONTRACT
// ────────
// deriveRankReasons(lead) → string[]
//
// Rules:
//   - Returns 2–4 labels max (enough context, not a wall of text)
//   - Score label always first (anchor of the ranking)
//   - Urgency, cadence, contact recency, signals follow in priority order
//   - Labels are short (≤ 25 chars) — designed for inline chip display
//   - Pure function: no React, no side effects, never throws
//
// Consumed by:
//   - WorkQueue.jsx  row sub-label (Phase 12)
//
// @param {object} lead
// @returns {string[]}

export function deriveRankReasons(lead) {
  if (!lead) return [];
  const intel    = lead.intelligence || {};
  const score    = lead.aiScore || 0;
  const reasons  = [];

  // 1. Score anchor — always present
  reasons.push(`Score ${score}`);

  // 2. Stage / urgency signal
  if (lead.stage === 'Hot' || lead.stage === 'Demo Booked') {
    reasons.push(lead.stage === 'Demo Booked' ? 'Demo booked' : '🔥 Hot lead');
  } else if (lead.stage === 'Follow Up') {
    reasons.push('Follow-up due');
  } else if (lead.stage === 'Re-engage') {
    reasons.push('Re-engage needed');
  }

  // 3. Buying signals
  const bsCount = intel.buyingSignals?.length || 0;
  if (bsCount > 0) {
    reasons.push(`${bsCount} buying signal${bsCount > 1 ? 's' : ''}`);
  }

  // 4. Contact recency — derived from activities[] (real ISO timestamps)
  const latestTs = (lead.activities || [])[0]?.timestamp;
  if (latestTs) {
    const days = Math.floor((Date.now() - new Date(latestTs).getTime()) / 86400000);
    if (days === 0) {
      reasons.push('Contacted today');
    } else if (days >= 7) {
      reasons.push(`${days}d no contact`);
    } else if (days >= 3) {
      reasons.push(`${days}d since touch`);
    }
  } else {
    reasons.push('Never contacted');
  }

  // 5. Active cadence (cap total at 4)
  if (reasons.length < 4) {
    const pending = getPendingSteps(lead);
    if (pending.length > 0) reasons.push('Active cadence');
  }

  return reasons.slice(0, 4);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * deriveSignals(lead) → DerivedSignals
 *
 * Returns a plain object with five deterministic intelligence signals.
 * Call at render time — do NOT persist on the lead object.
 *
 * Graceful degradation:
 *   - lead.intelligence absent   → intel defaults to {}
 *   - lead.activities absent     → treated as []
 *   - lead.cadenceDay === 0      → no pending steps, urgency from stage only
 *   - imported/migrated leads    → all intelligence signals default to empty
 *   - unknown stage              → stageBase defaults to 0
 *
 * @param {object} lead - A lead object from the leads array
 * @returns {{ opportunitySize, urgency, engagementLevel, riskLevel, buyingIntentScore }}
 */
export function deriveSignals(lead) {
  if (!lead) {
    return {
      opportunitySize:   'Small',
      urgency:           'Low',
      engagementLevel:   'Silent',
      riskLevel:         'Low',
      buyingIntentScore: 0,
    };
  }

  return {
    opportunitySize:   deriveOpportunitySize(lead),
    urgency:           deriveUrgency(lead),
    engagementLevel:   deriveEngagementLevel(lead),
    riskLevel:         deriveRiskLevel(lead),
    buyingIntentScore: deriveBuyingIntentScore(lead),
  };
}


// ─── Activity Intelligence ────────────────────────────────────────────────────
//
// SEPARATE EXPORT — not merged into deriveSignals.
//
//   deriveSignals answers:           "How should this lead be prioritised?"
//   deriveActivityIntelligence answers: "What has happened in this relationship?"
//
// These are distinct questions with distinct consumers. Keeping them separate
// prevents activity history from contaminating opportunity/urgency signals.
//
// RECENCY NOTE: Uses activities[0].timestamp (ISO string, prepended newest-first
// by addActivity). This resolves the documented limitation in deriveEngagementLevel,
// which is count-only. Activity intelligence IS recency-aware because it reads
// real timestamps from activities[], not the unparseable lead.lastTouch string.
//
// DETERMINISM NOTE: daysSinceLastContact uses Date.now() and is therefore
// not deterministic across sessions — it changes each time it is called.
// This is intentional: activity intelligence represents current relationship
// state, not a stable scoring signal. Do NOT merge it into deriveSignals.

/**
 * deriveActivityIntelligence(lead) → ActivityIntelligence
 *
 * Returns relationship context derived from activity history.
 * Call at render time — display-only, do NOT use for ranking or urgency.
 *
 * Graceful degradation:
 *   - No activities → daysSinceLastContact: null, all counters: 0
 *   - activities present → computed from real ISO timestamps
 *
 * @param {object} lead
 * @returns {{ daysSinceLastContact, hasReplied, consecutiveFailures, totalOutreach }}
 */
export function deriveActivityIntelligence(lead) {
  const activities = lead.activities || [];

  const POSITIVE_OUTCOMES = new Set(['Replied', 'Connected', 'Positive', 'Very Positive']);
  const FAILED_OUTCOMES   = new Set(['No Answer', 'Bounced', 'Negative']);
  const OUTREACH_TYPES    = new Set(['Email', 'SMS', 'Voicemail', 'LinkedIn', 'Call']);

  // daysSinceLastContact — from most recent activity ISO timestamp (activities[0])
  // null when no activities exist (lead has never been contacted)
  const latestTs = activities[0]?.timestamp;
  const daysSinceLastContact = latestTs
    ? Math.floor((Date.now() - new Date(latestTs).getTime()) / 86400000)
    : null;

  // hasReplied — true if any activity in full history has a positive outcome
  const hasReplied = activities.some(a => POSITIVE_OUTCOMES.has(a.outcome));

  // consecutiveFailures — count of failed outcomes at the HEAD of the history
  // (activities[] is newest-first). A streak of failures at the top means
  // the lead has gone dark recently.
  let consecutiveFailures = 0;
  for (const a of activities) {
    if (FAILED_OUTCOMES.has(a.outcome)) consecutiveFailures++;
    else break;
  }

  // totalOutreach — count of SDR-initiated communication activities (all time)
  const totalOutreach = activities.filter(a => OUTREACH_TYPES.has(a.type)).length;

  return {
    daysSinceLastContact,  // number | null  — null = never contacted
    hasReplied,            // boolean         — true = at least one positive response
    consecutiveFailures,   // number          — 0 = no recent failures
    totalOutreach,         // number          — total outreach activities logged
  };
}
