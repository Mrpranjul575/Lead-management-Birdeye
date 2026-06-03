# Post-Deployment Backlog

**Status:** All items approved for post-deployment.
**Release:** v1.0.0
**Classification authority:** RC-2 Deployment Audit

None of these items block the v1.0.0 release. They are ordered by business impact within each priority tier. All future development should be done in Claude Code.

---

## Medium Priority

These items have a low but real risk of impacting data quality or user experience at scale. Address within the first month of production use.

---

### M-1 — `activities[]` Size Cap

**File:** `AppContext.jsx`, `schema.js`
**Status:** POST-DEPLOYMENT

**Problem:**
`lead.activities[]` is append-only with no upper bound. `scoreHistory[]` is correctly capped at 50 entries. Activities are not. A high-volume SDR logging 10+ activities per day on active leads will accumulate 200–300 entries within a month. At ~300 bytes per serialised entry, a single lead at 300 activities consumes ~90 KB of the localStorage budget.

**Impact at scale:**
- localStorage write payload grows proportionally with activity count
- Timeline render time increases (all entries are passed through `normalizeEvent()` on every render)
- At ~150 total leads × 200 activities average → ~2.7 MB approaching the 5–10 MB browser limit

**Recommended fix:**
```js
// In addActivity() — after prepending the new entry:
const MAX_ACTIVITIES = 200;
const activities = [newEntry, ...(existing.activities || [])].slice(0, MAX_ACTIVITIES);
// Archive overflow entries to lead.archivedActivities[] to preserve audit history
```

**Note:** Do not simply drop overflow entries. Archive them to `lead.archivedActivities[]` so the full audit history is never destroyed (per the Immutable Activity Policy).

---

### M-2 — Push-to-Sheet Guard in `NewLead.jsx`

**File:** `src/views/NewLead.jsx`
**Status:** POST-DEPLOYMENT

**Problem:**
The "Push to Sheet" button in the New Lead form calls `SheetsAdapter.pushLead()` directly, before `addLead()` has been called. At the point of the direct push, the lead object has no `externalId` assigned (externalId is generated inside `migrateLead()` which runs inside `addLead()`). The resulting sheet row has an empty `externalId` column.

**Impact:**
Future `syncFromSheets()` calls can only match this lead by `email` or `business name`. If either of those values changes, the lead will be treated as a new import and a duplicate row may be created.

**Recommended fix:**
Remove the standalone "Push to Sheet" button from `NewLead.jsx`. The `handleSave()` function already calls `addLead()` (which calls `pushLead()` internally). The button provides no value that `handleSave()` doesn't already cover, and it creates a data integrity window.

---

### M-3 — `externalId`-First Status Sync

**File:** `src/services/sheetsAdapter.js` — `updateStatus()`
**Status:** POST-DEPLOYMENT

**Problem:**
`updateStatus(email, status)` uses `email` as the sole identifier when syncing stage changes to Google Sheets. If a lead has no email address (possible for leads added manually without an email), the call completes without syncing and returns no error.

**Impact:**
Stage changes on email-less leads are never reflected in the sheet. Silent data divergence.

**Recommended fix:**
Update `updateStatus` signature to accept the full lead object and use `externalId` as the primary identifier, with `email` as fallback — matching the pattern already used by `pushAENotes()`.

```js
async updateStatus(lead, status) {
  const identifier = lead.externalId || lead.email;
  if (!identifier) return;
  // ...
}
```

---

## Low Priority

These items are cosmetic, schema completeness, or minor provenance inaccuracies. Address when convenient.

---

### L-1 — `scoreLastCalculatedAt` Scope Restriction

**File:** `src/context/AppContext.jsx` — `updateLead()`
**Status:** POST-DEPLOYMENT

**Problem:**
`scoreLastCalculatedAt` is written on every `updateLead()` call, regardless of which fields were patched. This means a debounced AE Notes edit (every 400ms while typing) updates `scoreLastCalculatedAt`. The Score Explainer tab may show "Score last recalculated just now" after a notes edit that had no effect on scoring.

**Impact:** Minor provenance inaccuracy. No correctness issue.

**Recommended fix:**
```js
const SCORE_SENSITIVE_FIELDS = new Set([
  'stage', 'aiVisibility', 'compGap', 'reviews', 'rating', 'cadenceDay',
]);
const scoreFieldChanged = Object.keys(patch).some(k => SCORE_SENSITIVE_FIELDS.has(k));
const intelBase = {
  ...(updated.intelligence || {}),
  ...(scoreFieldChanged ? { scoreLastCalculatedAt: now } : {}),
};
```

---

### L-2 — `bulkConfirmAccountKnowledge` Activity Logging

**File:** `src/context/AppContext.jsx`
**Status:** POST-DEPLOYMENT

**Problem:**
The "Confirm All" button calls `bulkConfirmAccountKnowledge()`, which calls `confirmAllPending()` and applies all confirmations in a single mutation. No `Knowledge Update` activities are fired. The Timeline does not reflect bulk confirmations.

**Impact:** Confirm All actions are invisible in the audit trail.

**Recommended fix:**
Before calling `setLeads()`, collect the pending items that will be confirmed and fire one `Knowledge Update` activity per item (or a single summary event: `"Confirmed N pending facts"`).

---

### L-3 — `_fieldLabel()` Helper Deduplication

**Files:** `src/context/AppContext.jsx`, `src/utils/timelineUtils.js`
**Status:** POST-DEPLOYMENT

**Problem:**
The `_fieldLabel()` function mapping AK field names to human labels is defined identically in both files. The comment in `AppContext.jsx` documents this duplication and explains the reason (avoiding a circular import). With proper module organisation this should not be necessary.

**Recommended fix:**
Move `_fieldLabel` to `src/utils/accountKnowledgeUtils.js` (already imported by both consumers), export it, and remove the local copies.

---

### L-4 — `scoreLastCalculatedAt: null` in `createIntelligence()`

**File:** `src/data/schema.js` — `createIntelligence()`
**Status:** POST-DEPLOYMENT

**Problem:**
`scoreLastCalculatedAt`, `geminiEnrichedAt`, and `scoreHistory` are absent from the `createIntelligence()` factory function. They are lazily created on first write. All consumers use optional chaining (`?.`) so there is no crash risk, but the schema is incomplete.

**Recommended fix:**
```js
export function createIntelligence(overrides = {}) {
  return {
    // ... existing fields ...
    scoreHistory:          [],
    scoreLastCalculatedAt: null,
    geminiEnrichedAt:      null,
    ...overrides,
  };
}
```

---

### L-5 — `externalId` dedup for `_fieldLabel` in timeline events

**File:** `src/utils/timelineUtils.js` — `_fieldLabel()`
**Status:** POST-DEPLOYMENT

See L-3 above. The second instance of this duplication lives here. Remove after L-3 is resolved.

---

## Future Enhancements

These are architectural improvements that require schema changes or new data collection. Not appropriate for immediate post-deployment work. Revisit after observing real usage patterns.

---

### F-1 — `lastTouchAt: ISO string` Field

**Current limitation:**
`lead.lastTouch` is a human-readable display string (`"2h ago"`, `"8d ago"`, `"Never"`). It cannot be parsed as a timestamp. `deriveUrgency()`, `deriveEngagementLevel()`, and `deriveRankReasons()` all work around this limitation with documented comments.

**Enhancement:**
Add `lastTouchAt: ISO string` to the lead schema. Populate it alongside `lastTouch` on every `addTouchEntry()` call. Update `deriveUrgency()` and `deriveRankReasons()` to use real recency windows (e.g. "last 14 days" for engagement level).

---

### F-2 — Recency-Aware Urgency Model

**Depends on:** F-1

Once `lastTouchAt` exists, `deriveUrgency()` can incorporate contact recency:
- Lead in `Contacted` stage + `lastTouchAt > 3 days` → upgrade urgency to `High`
- Lead in `Nurturing` stage + `lastTouchAt > 7 days` → upgrade urgency to `High`

---

### F-3 — Improved Work Queue Ranking

**Depends on:** F-1, F-2

With accurate recency data, `sortReason` and `deriveRankReasons()` can surface genuinely time-sensitive leads rather than relying on stage-based heuristics.

---

### F-4 — `activities[]` Archive Viewer

**Depends on:** M-1

Once activities are archived to `lead.archivedActivities[]`, surface them in the Timeline as a collapsible "Older activity" section. Preserves full audit history without cluttering the primary timeline view.

---

*All items marked POST-DEPLOYMENT. None block the v1.0.0 release.*
