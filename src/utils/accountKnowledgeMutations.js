/**
 * accountKnowledgeMutations — Phase 8A-Core
 *
 * Pure helper functions for Account Knowledge state transitions.
 * Extracted from AppContext.jsx (where they lived inside the AppProvider
 * function body, causing unnecessary re-creation on every render).
 *
 * Rules:
 *   - Pure functions only — no React, no hooks, no side effects
 *   - Every function returns a new accountKnowledge object (never mutates)
 *   - AppContext orchestrates when to call these; these functions do not
 *     decide which lead to update or when to trigger persistence
 *   - All identity-key lookups are case-insensitive and trim-normalised
 *
 * Consumers: AppContext.jsx only (via direct import).
 * Do NOT import these into UI components directly — call the context
 * action functions (confirmAccountKnowledgeFact etc.) instead.
 */

// ── Identity-key configuration ────────────────────────────────────────────────
// Each array field uses a different property as its dedup identity key.
export const AK_IDENTITY_KEY = {
  competitors:         'name',
  decisionMakers:      'name',
  currentTools:        'name',
  businessGoals:       'goal',
  recurringObjections: 'objection',
};

export const AK_ARRAY_FIELDS  = new Set(Object.keys(AK_IDENTITY_KEY));
export const AK_SCALAR_FIELDS = new Set(['budget', 'purchaseTimeline']);

// conflictWith factual field sets per type — used by applyConflictResolution
// to extract only factual values from conflictWith, excluding provenance metadata.
export const CONFLICT_FACT_FIELDS = {
  competitors:      ['strength', 'context'],
  decisionMakers:   ['role', 'authority', 'notes'],
  currentTools:     ['category'],
  budget:           ['status', 'amount', 'notes'],
  purchaseTimeline: ['urgency', 'targetDate', 'notes'],
};

// ── applyAKReview ─────────────────────────────────────────────────────────────
/**
 * Sets reviewStatus + reviewedAt on the matched item within an accountKnowledge
 * object. Supports both array fields (matched by identityKey) and scalar fields
 * (budget, purchaseTimeline — identityKey is ignored).
 *
 * @param {object}  ak            - accountKnowledge object (not mutated)
 * @param {string}  field         - AK field name (e.g. 'competitors')
 * @param {string|null} identityKey - value of the identity property (e.g. competitor name)
 * @param {string}  reviewStatus  - 'confirmed' | 'dismissed'
 * @param {object}  updatedValues - optional partial values merged before status change
 * @returns {object} new accountKnowledge object
 */
export function applyAKReview(ak, field, identityKey, reviewStatus, updatedValues = {}) {
  if (!ak) return ak;
  const now = new Date().toISOString();

  if (AK_SCALAR_FIELDS.has(field)) {
    if (!ak[field]) return ak;
    return {
      ...ak,
      [field]: { ...ak[field], ...updatedValues, reviewStatus, reviewedAt: now },
    };
  }

  if (AK_ARRAY_FIELDS.has(field)) {
    const keyProp = AK_IDENTITY_KEY[field];
    const keyVal  = identityKey?.toLowerCase().trim();
    return {
      ...ak,
      [field]: (ak[field] || []).map(item =>
        item[keyProp]?.toLowerCase().trim() === keyVal
          ? { ...item, ...updatedValues, reviewStatus, reviewedAt: now }
          : item
      ),
    };
  }

  return ak; // unknown field — no-op
}

// ── confirmAllPending ─────────────────────────────────────────────────────────
/**
 * Confirms every pending item across all AK fields in one pass.
 * Used by bulkConfirmAccountKnowledge for single-call batch confirmation.
 *
 * @param {object} ak - accountKnowledge object (not mutated)
 * @returns {object} new accountKnowledge with all pending items confirmed
 */
export function confirmAllPending(ak) {
  if (!ak) return ak;
  const now = new Date().toISOString();
  const confirmItem = item =>
    item.reviewStatus === 'pending'
      ? { ...item, reviewStatus: 'confirmed', reviewedAt: now }
      : item;

  return {
    ...ak,
    competitors:         (ak.competitors         || []).map(confirmItem),
    decisionMakers:      (ak.decisionMakers      || []).map(confirmItem),
    currentTools:        (ak.currentTools        || []).map(confirmItem),
    businessGoals:       (ak.businessGoals       || []).map(confirmItem),
    recurringObjections: (ak.recurringObjections || []).map(confirmItem),
    budget:
      ak.budget?.reviewStatus === 'pending'
        ? { ...ak.budget, reviewStatus: 'confirmed', reviewedAt: now }
        : ak.budget,
    purchaseTimeline:
      ak.purchaseTimeline?.reviewStatus === 'pending'
        ? { ...ak.purchaseTimeline, reviewStatus: 'confirmed', reviewedAt: now }
        : ak.purchaseTimeline,
  };
}

// ── applyConflictResolution ───────────────────────────────────────────────────
/**
 * Resolves a pending conflict on a matched AK item.
 *
 * resolution === 'keep'  : clears conflictWith, stamps reviewedAt. No value change.
 * resolution === 'accept': applies conflictWith factual values over confirmed entry,
 *                          clears conflictWith, stamps reviewedAt.
 *                          Original source/sourceDate preserved (provenance rule).
 *
 * @param {object}      ak          - accountKnowledge object (not mutated)
 * @param {string}      field       - AK field name
 * @param {string|null} identityKey - identity value for array fields; null for scalars
 * @param {'keep'|'accept'} resolution
 * @returns {object} new accountKnowledge object
 */
export function applyConflictResolution(ak, field, identityKey, resolution) {
  if (!ak) return ak;
  const now        = new Date().toISOString();
  const factFields = CONFLICT_FACT_FIELDS[field] || [];

  if (AK_SCALAR_FIELDS.has(field)) {
    const existing = ak[field];
    if (!existing || !existing.conflictWith) return ak;
    if (resolution === 'keep') {
      return { ...ak, [field]: { ...existing, conflictWith: null, reviewedAt: now } };
    }
    // 'accept': pick only factual fields from conflictWith, preserve source provenance
    const factsToApply = {};
    for (const f of factFields) {
      if (existing.conflictWith[f] !== undefined) factsToApply[f] = existing.conflictWith[f];
    }
    return { ...ak, [field]: { ...existing, ...factsToApply, conflictWith: null, reviewedAt: now } };
  }

  if (AK_ARRAY_FIELDS.has(field)) {
    const keyProp = AK_IDENTITY_KEY[field];
    const keyVal  = identityKey?.toLowerCase().trim();
    return {
      ...ak,
      [field]: (ak[field] || []).map(item => {
        if (item[keyProp]?.toLowerCase().trim() !== keyVal) return item;
        if (!item.conflictWith) return item;
        if (resolution === 'keep') {
          return { ...item, conflictWith: null, reviewedAt: now };
        }
        // 'accept': pick only factual fields from conflictWith, preserve source provenance
        const factsToApply = {};
        for (const f of factFields) {
          if (item.conflictWith[f] !== undefined) factsToApply[f] = item.conflictWith[f];
        }
        return { ...item, ...factsToApply, conflictWith: null, reviewedAt: now };
      }),
    };
  }

  return ak;
}

// ── applySupersede ────────────────────────────────────────────────────────────
/**
 * Marks an existing array entry as 'superseded' (kept for history) and appends
 * a new confirmed entry. Array fields only — scalars not supported.
 *
 * Use when the old fact was correct but has been replaced (e.g. new decision
 * maker, switched tool). Distinct from applyConflictResolution('accept') which
 * corrects a fact that was wrong.
 *
 * @param {object}      ak      - accountKnowledge object (not mutated)
 * @param {string}      field   - array AK field name
 * @param {string}      oldKey  - identity value of the entry to supersede
 * @param {object}      newItem - new confirmed entry to append
 * @returns {object} new accountKnowledge object
 */
export function applySupersede(ak, field, oldKey, newItem) {
  if (!ak || !AK_ARRAY_FIELDS.has(field)) return ak; // scalars not supported
  const keyProp = AK_IDENTITY_KEY[field];
  const keyVal  = oldKey?.toLowerCase().trim();
  const now     = new Date().toISOString();

  const updatedArray = (ak[field] || []).map(item =>
    item[keyProp]?.toLowerCase().trim() === keyVal
      ? { ...item, reviewStatus: 'superseded', reviewedAt: now, conflictWith: null }
      : item
  );

  const newConfirmed = {
    ...newItem,
    reviewStatus: 'confirmed',
    reviewedAt:   now,
    source:       newItem.source || 'sdr_manual',
  };

  return { ...ak, [field]: [...updatedArray, newConfirmed] };
}

// ── applyReverify ─────────────────────────────────────────────────────────────
/**
 * Updates reviewedAt only on the matched item — source is never overwritten.
 * Used by Re-Verify to mark a fact as still current without changing provenance.
 * Works for both array fields (matched by identityKey) and scalar fields.
 *
 * @param {object}      ak          - accountKnowledge object (not mutated)
 * @param {string}      field       - AK field name
 * @param {string|null} identityKey - identity value for array fields; null for scalars
 * @returns {object} new accountKnowledge object
 */
export function applyReverify(ak, field, identityKey) {
  if (!ak) return ak;
  const now = new Date().toISOString();

  if (AK_SCALAR_FIELDS.has(field)) {
    if (!ak[field]) return ak;
    return { ...ak, [field]: { ...ak[field], reviewedAt: now } };
  }

  if (AK_ARRAY_FIELDS.has(field)) {
    const keyProp = AK_IDENTITY_KEY[field];
    const keyVal  = identityKey?.toLowerCase().trim();
    return {
      ...ak,
      [field]: (ak[field] || []).map(item =>
        item[keyProp]?.toLowerCase().trim() === keyVal
          ? { ...item, reviewedAt: now }
          : item
      ),
    };
  }

  return ak; // unknown field — no-op
}
