/**
 * CADENCE EXECUTION UTILITIES
 * Pure functions — no React, no side effects.
 * Uses cadenceDay + seqLog + active cadence plan (no cadenceStartDate).
 *
 * Phase 9A-1: all functions now accept an optional `plan` parameter.
 * When provided, the plan is used instead of SEQ_PLAN (the default).
 * This allows custom cadences assigned to leads to execute correctly
 * without breaking any existing call site — all callers that omit `plan`
 * continue to receive SEQ_PLAN behaviour unchanged.
 *
 * Active plan resolution (used by AppContext and CadenceTab):
 *   lead.cadenceSteps?.length ? lead.cadenceSteps : SEQ_PLAN
 *
 * seqLog compatibility: handles both boolean { E1: true }
 * and future richer shape { E1: { completed: true, completedAt: '...' } }.
 */
import { SEQ_PLAN } from '../constants/cadencePlan';

/** Normalise a seqLog value to a boolean */
function isDone(val) {
  if (typeof val === 'object' && val !== null) return !!val.completed;
  return !!val;
}

/**
 * Returns the active cadence plan for a lead.
 * Uses lead.cadenceSteps when populated (custom cadence assigned),
 * falls back to SEQ_PLAN (default cadence).
 */
export function getActivePlan(lead) {
  return (lead.cadenceSteps && lead.cadenceSteps.length > 0)
    ? lead.cadenceSteps
    : SEQ_PLAN;
}

/**
 * Returns all steps in the active plan assigned to the lead's current cadenceDay
 * that have not yet been marked complete in seqLog.
 */
export function getPendingSteps(lead) {
  const day = lead.cadenceDay || 0;
  if (day === 0) return [];
  const plan = getActivePlan(lead);
  return plan.filter(s => s.day === day && !isDone(lead.seqLog?.[s.key]));
}

/**
 * Returns all steps in the active plan assigned to the lead's current cadenceDay
 * regardless of completion status.
 */
export function getDaySteps(lead) {
  const day = lead.cadenceDay || 0;
  if (day === 0) return [];
  const plan = getActivePlan(lead);
  return plan.filter(s => s.day === day);
}

/**
 * Returns true when every step on the current cadenceDay is marked complete.
 * Returns false when cadenceDay === 0 (not started).
 */
export function isDayComplete(lead) {
  const day = lead.cadenceDay || 0;
  if (day === 0) return false;
  return getPendingSteps(lead).length === 0;
}

/**
 * Returns true if the lead is on or past cadenceTotal and all steps on the
 * final day are complete.
 */
export function isCadenceComplete(lead) {
  const total = lead.cadenceTotal || SEQ_PLAN.length;
  return (lead.cadenceDay || 0) >= total && isDayComplete(lead);
}

/**
 * Returns the next actual cadence day defined in the active plan that is
 * greater than currentDay. Handles non-consecutive day numbers.
 * Falls back to currentDay + 1 if no defined day exists.
 */
export function nextCadenceDay(currentDay, plan) {
  const activePlan = plan || SEQ_PLAN;
  const next = activePlan
    .map(s => s.day)
    .filter(d => d > currentDay)
    .sort((a, b) => a - b)[0];
  return next ?? currentDay + 1;
}

/**
 * Returns a human-readable label for the current cadence state — used to
 * populate lead.nextAction after step completion or day advancement.
 */
export function currentStepLabel(lead) {
  const pending = getPendingSteps(lead);
  if (pending.length > 0) return `Day ${lead.cadenceDay}: ${pending[0].label}`;
  const day = lead.cadenceDay || 0;
  if (day === 0) return 'Start cadence';
  if (isCadenceComplete(lead)) return 'Cadence complete';
  const plan = getActivePlan(lead);
  const next = nextCadenceDay(day, plan);
  return `Advance to Day ${next}`;
}

/**
 * getCadenceProgress — single source of truth for cadence visibility metrics.
 *
 * Returns a snapshot object for display across WorkQueue, LeadPage header,
 * NextBestStep, and ActionCenter. Pure function — no side effects.
 *
 * completedSteps: count of steps where seqLog[step.key] is truthy
 * totalSteps:     count of all steps in the active plan
 * pct:            Math.round(completedSteps / totalSteps * 100), or 0 if no steps
 * nextStep:       label of first pending step on current day, or null
 * isStarted:      cadenceDay > 0
 * isComplete:     isCadenceComplete(lead)
 *
 * @param {object} lead
 * @returns {{
 *   name: string,
 *   day: number,
 *   total: number,
 *   completedSteps: number,
 *   totalSteps: number,
 *   pct: number,
 *   nextStep: string|null,
 *   isStarted: boolean,
 *   isComplete: boolean,
 * }}
 */
export function getCadenceProgress(lead) {
  const plan        = getActivePlan(lead);
  const day         = lead.cadenceDay  || 0;
  const total       = lead.cadenceTotal || plan.length || 0;
  const totalSteps  = plan.length;
  const completedSteps = plan.filter(s => {
    const v = lead.seqLog?.[s.key];
    if (!v) return false;
    if (typeof v === 'object') return !!v.completed;
    return true;
  }).length;
  const pct        = totalSteps > 0 ? Math.round(completedSteps / totalSteps * 100) : 0;
  const pending    = getPendingSteps(lead);
  const nextStep   = pending.length > 0 ? pending[0].label : null;
  return {
    name:           lead.cadenceName || null,
    day,
    total,
    completedSteps,
    totalSteps,
    pct,
    nextStep,
    isStarted:      day > 0,
    isComplete:     isCadenceComplete(lead),
  };
}
