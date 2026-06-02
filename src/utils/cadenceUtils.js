/**
 * CADENCE EXECUTION UTILITIES
 * Pure functions — no React, no side effects.
 * Uses cadenceDay + seqLog + SEQ_PLAN only (no cadenceStartDate).
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
 * Returns all SEQ_PLAN steps assigned to the lead's current cadenceDay
 * that have not yet been marked complete in seqLog.
 */
export function getPendingSteps(lead) {
  const day = lead.cadenceDay || 0;
  if (day === 0) return [];
  return SEQ_PLAN.filter(s => s.day === day && !isDone(lead.seqLog?.[s.key]));
}

/**
 * Returns all SEQ_PLAN steps assigned to the lead's current cadenceDay
 * regardless of completion status.
 */
export function getDaySteps(lead) {
  const day = lead.cadenceDay || 0;
  if (day === 0) return [];
  return SEQ_PLAN.filter(s => s.day === day);
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
  const total = lead.cadenceTotal || 7;
  return (lead.cadenceDay || 0) >= total && isDayComplete(lead);
}

/**
 * Returns the next actual cadence day defined in SEQ_PLAN that is greater
 * than currentDay. Handles non-consecutive day numbers (e.g. days 1,2,4,6,8).
 * Falls back to currentDay + 1 if no defined day exists (shouldn't happen in
 * normal use).
 */
export function nextCadenceDay(currentDay) {
  const next = SEQ_PLAN
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
  const next = nextCadenceDay(day);
  return `Advance to Day ${next}`;
}
