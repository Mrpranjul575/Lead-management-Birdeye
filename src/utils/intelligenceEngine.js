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
