/**
 * accountKnowledgeUtils — Phase 7D-D
 *
 * Shared freshness utilities for account knowledge display.
 * Used by AccountKnowledgeTab and PrepareCallDrawer.
 *
 * Age model (display-only — never stored, never affects isConfirmed or prompts):
 *   recent  < 30 days  → green
 *   aging   30–90 days → amber
 *   old     > 90 days  → red
 *   absent  → treated as 'old'
 *
 * Date precedence for age calculation: reviewedAt → sourceDate → absent.
 */

/**
 * getAgeBand(item) — returns 'recent' | 'aging' | 'old'
 *
 * @param {object|null} item — any accountKnowledge sub-object
 * @returns {'recent'|'aging'|'old'}
 */
export function getAgeBand(item) {
  const dateStr = item?.reviewedAt || item?.sourceDate;
  if (!dateStr) return 'old';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'old';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 30)  return 'recent';
  if (days <= 90) return 'aging';
  return 'old';
}

/**
 * AGE_BAND_CONFIG — visual configuration per age band.
 * color     : dot / text color
 * showLabel : whether to show a freshness label (Modification 4 — explicit language)
 * showAction: whether to show the Re-Verify button (Modification 2 — old only)
 */
export const AGE_BAND_CONFIG = {
  recent: {
    color:      '#10B981',
    showLabel:  false,
    showAction: false,
    label:      null,
  },
  aging: {
    color:      '#F59E0B',
    showLabel:  true,
    showAction: false,          // Modification 2: aging shows indicator only, no Re-Verify
    label:      null,           // label is computed dynamically from formatAgeLabel()
  },
  old: {
    color:      '#F87171',
    showLabel:  true,
    showAction: true,           // Modification 2: Re-Verify shown only for old facts
    label:      null,
  },
};

/**
 * formatAgeLabel(item) — returns explicit freshness language for aging and old items.
 * Uses "Last verified X" phrasing (Modification 4).
 *
 * Returns null for recent items (no label needed).
 *
 * @param {object|null} item
 * @returns {string|null}
 */
export function formatAgeLabel(item) {
  const dateStr = item?.reviewedAt || item?.sourceDate;
  if (!dateStr) return 'Last verified: unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Last verified: unknown';

  const days   = Math.floor((Date.now() - d.getTime()) / 86400000);
  const band   = getAgeBand(item);
  if (band === 'recent') return null;

  if (days === 0)   return 'Last verified today';
  if (days < 7)     return `Last verified ${days}d ago`;
  if (days < 30)    return `Last verified ${days}d ago`;
  if (days < 60)    return `Last verified ~1mo ago`;
  if (days < 90)    return `Last verified ~2mo ago`;
  if (days < 180)   return `Last verified ~${Math.round(days / 30)}mo ago`;
  if (days < 365)   return `Last verified ~${Math.round(days / 30)}mo ago`;
  const years = (days / 365).toFixed(1);
  return `Last verified ${years}y ago`;
}
