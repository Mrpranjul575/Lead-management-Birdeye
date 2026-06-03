# Claude Code Handoff — Birdeye SDR CRM v1.0.0

**For:** Future development sessions in Claude Code
**Release:** v1.0.0 — Deployment Ready
**Confidence:** 97 / 100
**Standalone:** `Standalone/birdeye-sdr-v1.0.0.html`

This document is the authoritative technical reference for continuing development. Read it in full before making any changes to this codebase.

---

## The Four Rules

These rules are non-negotiable. Every change to this codebase must preserve them.

```
1. Only addLead() → pushLead() may create Google Sheet rows.
   All action handlers (updateLead, updateAENotes, logContent, logCadence)
   are update-only. If a sheet lookup fails, return failure. Never append.

2. AI cannot create confirmed Account Knowledge facts automatically.
   All AI-extracted facts enter with reviewStatus: 'pending'.
   SDR confirmation is required before any fact enters prompt context.

3. Activities are immutable append-only audit history.
   Never edit or delete an existing activity entry.
   Only addActivity() writes to lead.activities[].

4. AI suggests. SDR decides. System records.
   No autonomous AI actions. No automatic status changes.
   No automatic fact confirmation. No automatic cadence modifications.
```

---

## Architecture Overview

The application is a single-page React app (Vite build). All state lives in React (`AppContext`) and persists to `localStorage` under key `birdeye_sdr_leads_v4`. There is no backend. The only external integrations are:

- **Google Sheets** — via deployed Apps Script Web App URL (configured in Settings)
- **Gemini API** — via browser-side API key (configured in Settings)
- **Claude.ai** — copy-paste mode only, no API integration

---

## Data Classification

Every piece of AI-generated data belongs to exactly one category. The category determines storage, trust rules, and review requirements.

### Category A — Knowledge

**Definition:** Persistent facts about the prospect's business world.

**Storage:** `lead.accountKnowledge`

**Write path:** `updateAccountKnowledge()` only

**Trust model:**
- AI-extracted items arrive with `reviewStatus: 'pending'`
- SDR confirms via `confirmAccountKnowledgeFact()` or dismisses via `dismissAccountKnowledgeFact()`
- Only `confirmed` items with no active conflict enter prompt context (`isPromptEligible()`)
- `isConfirmed()` is for display; `isPromptEligible()` is for prompts — do NOT conflate them

**Fields:**
```
competitors[]        decisionMakers[]    currentTools[]
businessGoals[]      recurringObjections[]
budget               purchaseTimeline
```

**`reviewStatus` values:**
```
'pending'    — AI-extracted, not yet reviewed. Excluded from prompts.
'confirmed'  — Accepted by SDR. Included in prompts (if no conflict).
'dismissed'  — Rejected by SDR. Excluded forever.
'superseded' — Was confirmed, now replaced by a newer fact.
absent       — Treated as 'confirmed' (backward compatibility).
```

### Category B — Intelligence

**Definition:** Analytical scoring signals and advisory interpretations.

**Storage:** `lead.intelligence`

**Write path:** `updateIntelligence()` only — rejects writes to `INTELLIGENCE_REJECTED_FIELDS`

**Trust model:** No review gate. Advisory only. SDR can read, edit, or override any field.

**Fields:**
```
summary              painPoints[]        buyingSignals[]
objections[]         nextBestAction      leadTemperature
aiRecommendation     meetingProbability
geminiEnrichedAt     scoreLastCalculatedAt   scoreHistory[]
```

**Key constraint:** `geminiEnrichedAt` is set ONLY in `enrichLead.js`. It must never be set by any manual SDR edit path. This preserves the distinction between AI-sourced signals and SDR-authored data.

### Category C — Audit History

**Definition:** Immutable record of everything that happened.

**Storage:** `lead.activities[]`

**Write path:** `addActivity()` only — prepends, never edits

**Retention:** No cap currently (post-deployment backlog item M-1 recommends 200-entry cap with archive)

**`scoreHistory[]`** follows the same immutability rule but lives in `lead.intelligence` because score changes are analytical records (Category B), not audit events (Category C).

---

## Layer-by-Layer Reference

### Knowledge Layer

**Files:**
- `src/data/schema.js` — `createAccountKnowledge()`, `mergeAccountKnowledge()`, `isConfirmed()`, `isPromptEligible()`, `hasConflict()`, `INTELLIGENCE_REJECTED_FIELDS`
- `src/utils/accountKnowledgeMutations.js` — `applyAKReview()`, `confirmAllPending()`, `applyConflictResolution()`, `applySupersede()`, `applyReverify()`
- `src/context/AppContext.jsx` — `updateAccountKnowledge()`, `confirmAccountKnowledgeFact()`, `dismissAccountKnowledgeFact()`, `bulkConfirmAccountKnowledge()`
- `src/components/AccountKnowledgeTab.jsx` — Review UI: `PendingCard`, `ExtractionQuote`, `ConflictCard`, `AKItem`

**Critical path for AI-extracted competitors (copilot-notes):**
```
Copilot.jsx handleSave() (notes mode)
→ extractNotesJSON(content)
→ competitorItems.map({ name, context, source:'copilot-notes', reviewStatus:'pending' })
→ updateAccountKnowledge(leadId, { competitors: competitorItems })    [Category A write]
→ addActivity(leadId, 'Knowledge Update', 'Competitor Detected: ...') [Category C write]
    ↓
AccountKnowledgeTab PendingCard renders with ExtractionQuote (shows context)
    ↓
SDR clicks Confirm → confirmAccountKnowledgeFact()
  → applyAKReview(..., 'confirmed')
  → addActivity(..., 'Knowledge Update', 'Competitor Approved: ...')
    ↓
isPromptEligible() returns true
→ buildLeadContext() includes competitor in AI prompt
```

**Source labels (SOURCE_META in AccountKnowledgeTab.jsx):**
```
'copilot-notes' → 🤖 AI Notes     #7C5CE8
'transcript'    → 🎙 Transcript   #3B82F6
'call_note'     → 📝 Call Note    #10B981
'sdr_manual'    → ✏ Manual       #7C5CE8
'migrated'      → 📁 Migrated    #8B949E
```

---

### Intelligence Layer

**Files:**
- `src/services/enrichLead.js` — `enrichLead(lead, settings)` — Gemini API call, returns intelligence patch
- `src/context/AppContext.jsx` — `enrichSingleLead()`, `batchEnrichLeads()`
- `src/utils/intelligenceEngine.js` — `deriveSignals()`, `deriveActivityIntelligence()`, `buildScoreBreakdown()`, `deriveRankReasons()`

**Fields written by `enrichLead()`:**
```
summary, painPoints[], buyingSignals[], objections[],
nextBestAction, leadTemperature, lastUpdated, geminiEnrichedAt
```

**`geminiEnrichedAt` rule:** Set to `new Date().toISOString()` in `enrichLead.js` return object. This is the ONLY place it should ever be set. If you add a new enrichment path, you must set `geminiEnrichedAt` there too.

**Pure derivation functions (call at render time, never persist results):**
- `deriveSignals(lead)` → `{ opportunitySize, urgency, engagementLevel, riskLevel, buyingIntentScore }`
- `deriveActivityIntelligence(lead)` → `{ daysSinceLastContact, hasReplied, consecutiveFailures, totalOutreach }`
- `buildScoreBreakdown(lead)` → `{ aiScore, contributors[], buyingIntentScore, buyingContributors[], timestamp }`
- `deriveRankReasons(lead)` → `string[]` (2–4 rank driver labels for Work Queue)

**If you change `computeAiScore()` or `deriveBuyingIntentScore()` in `schema.js`, you MUST update `buildScoreBreakdown()` in `intelligenceEngine.js` to mirror the change exactly.**

---

### Activities Layer

**Files:**
- `src/data/schema.js` — `createActivity()`, `ACTIVITY_TYPES`, `ACTIVITY_OUTCOMES`
- `src/context/AppContext.jsx` — `addActivity()`, `addActivityEntry()`, `addTouchEntry()`

**`ACTIVITY_TYPES`:**
```
Call, Email, SMS, LinkedIn, Voicemail, Meeting, Note,
AI Generation, Transcript, Cadence Update, Status Change,
Follow Up, Import, Knowledge Update
```

**`addActivity()` signature:**
```js
addActivity(leadId, type, summary, details = {})
// details: { content, subject, outcome, duration, sentiment,
//            notes, nextStep, fileName, source, enrichedFields,
//            action, field, identityKey, extractionContext,
//            previousStage, newStage }
```

**Current activity coverage (16 call sites):**

| Event | Fired by | Type |
|-------|----------|------|
| Call logged | `CallNotesModal` | `Call` |
| Email/SMS/VM/LinkedIn generated | `addTouchEntry()` via Copilot | channel type |
| Follow-up scheduled | `FollowUpModal` | `Follow Up` |
| Recording processed | `RecordingUpload` | `Transcript` |
| AI enrichment | `enrichSingleLead()` | `AI Generation` |
| Competitor detected | `Copilot.jsx` (notes mode) | `Knowledge Update` |
| Competitor approved | `confirmAccountKnowledgeFact()` | `Knowledge Update` |
| Competitor rejected | `dismissAccountKnowledgeFact()` | `Knowledge Update` |
| Stage changed | `updateLead({ stage })` | `Status Change` |
| Cadence started | `LeadPage` start button | `Cadence Update` |
| Cadence step completed | `markStepComplete()` | `Cadence Update` |
| Cadence day advanced | `advanceCadenceDay()` | `Cadence Update` |
| Cadence completed | `markStepComplete()` completion check | `Cadence Update` |
| ReEngage triggered | `ReEngage.jsx` | `Email` |
| Note added | `addActivityEntry()` | `Note` |
| Cadence applied | `Cadences.jsx` | `Cadence Update` |

**Timeline normalization (`timelineUtils.js`):**
Every activity must have a case in `normalizeEvent()`. If you add a new `ACTIVITY_TYPE`, add a matching branch. Unknown types fall through to the system event fallback — they will appear in the timeline but with generic styling.

---

### Scoring Layer

**Files:**
- `src/data/schema.js` — `computeAiScore()`, `applyScore()`, `CURRENT_SCORE_VERSION`
- `src/utils/intelligenceEngine.js` — `deriveBuyingIntentScore()`, `buildScoreBreakdown()`
- `src/context/AppContext.jsx` — score history in `updateIntelligence()` and `updateLead()`
- `src/views/LeadPage.jsx` — `ScoreExplainerTab`, `ScorePanel`, `ContributorRow`, `ScoreHistoryPanel`

**Two independent scores:**

| Score | Answers | Max | Key inputs |
|-------|---------|-----|------------|
| `aiScore` (Opportunity) | "How valuable is this externally?" | 100 | `aiVisibility` (25), `compGap` (20), `reviews` (15), `rating` (10), `buyingSignals` (10), activities (4), stage (7), objections (−10) |
| `buyingIntentScore` | "How ready is this contact to buy?" | 100 | stage base (30), `buyingSignals` (60), objections (−36) |

**Score history rules:**
- Newest-first (prepend). `scoreHistory[0]` is the most recent snapshot.
- Capped at 50 entries — `[snapshot, ...existing].slice(0, 50)`
- Deduped: snapshot only created when `aiScore` actually changes
- Trigger label: derived from the patch keys by `_scoreTriggerLabel()`

**`CURRENT_SCORE_VERSION` in `schema.js`:** Increment this when the scoring formula changes. The app will re-score all leads on next load.

---

### Cadence Layer

**Files:**
- `src/utils/cadenceUtils.js` — `getPendingSteps()`, `isDayComplete()`, `isCadenceComplete()`, `nextCadenceDay()`, `getCadenceProgress()`
- `src/constants/cadencePlan.js` — `SEQ_PLAN` default cadence
- `src/context/AppContext.jsx` — `markStepComplete()`, `advanceCadenceDay()`
- `src/views/Cadences.jsx` — Cadence Library (save, update, clone, delete)

**Lead cadence fields:**
```
lead.cadenceName    — name of the assigned cadence
lead.cadenceDay     — current day (0 = not started)
lead.cadenceTotal   — total days in the assigned cadence
lead.cadenceSteps   — custom step definitions (overrides SEQ_PLAN when present)
lead.seqLog         — { [stepKey]: boolean } completion tracking
```

**Cadence execution flow:**
```
1. Assign cadence (Cadences view or Work Queue)
   → updateLead({ cadenceName, cadenceTotal, cadenceSteps, cadenceDay: 0 })
   → addActivity('Cadence Update', 'Cadence applied: ...')

2. Start cadence (LeadPage CadenceTab start button)
   → updateLead({ cadenceDay: 1 })
   → addActivity('Cadence Update', 'Cadence started: Day 1 — ...')

3. Complete step (markStepComplete)
   → updates seqLog[stepKey] = true
   → addActivity('Cadence Update', step summary)
   → if (isCadenceComplete) addActivity('Cadence Update', 'Cadence complete: ...')

4. Advance day (advanceCadenceDay)
   → updateLead({ cadenceDay: nextDay })
   → addActivity('Cadence Update', 'Advanced to Day N')
```

---

### Sheets Layer

**Files:**
- `src/services/sheetsAdapter.js` — `SheetsAdapter` class
- `src/utils/reconcileUtils.js` — `reconcileSheetLeads()`
- `src/context/AppContext.jsx` — `syncFromSheets()`, `addLead()` with `isSheetOrigin` guard

**Methods:**
```
pushLead(lead)              — POST (no action). Creates a new row. ONLY called from addLead().
updateStatus(email, status) — POST action:'updateStatus'. Update only.
pushAENotes(lead)           — POST action:'updateAENotes'. Update only.
updateLeadFields(lead, fields) — POST action:'updateLead'. Update only.
readLeads(settings)         — GET action:'readLeads'. Returns { ok, data: lead[] }.
logContent(lead, content)   — stub, not active.
logCadence(cadence)         — stub, not active.
```

**Row creation authority (locked rule):**
```
ONLY: addLead() → pushLead()
May create rows.

ALL other methods are update-only.
If lookup fails → return failure.
Never append.
```

**Sync identity order:**
```
1. externalId (UUID, assigned at lead creation by migrateLead())
2. email
3. business name (fallback only)
```

**`isSheetOrigin` guard:**
Leads created by `syncFromSheets()` or BulkCSV sheet import carry `tags: ['Sheets']`. `addLead()` checks this flag and skips `pushLead()` to prevent the sync → addLead → pushLead feedback loop.

---

### Trust Model Summary

```
                    ┌─────────────────────────────────────────┐
                    │            AI Data Sources               │
                    └──────────────┬──────────────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              │                    │                      │
    ┌─────────▼──────┐   ┌─────────▼──────┐   ┌─────────▼──────┐
    │  Category A    │   │  Category B    │   │  Category C    │
    │  Knowledge     │   │  Intelligence  │   │  Audit History │
    │                │   │                │   │                │
    │ Persistent     │   │ Analytical     │   │ Immutable      │
    │ account facts  │   │ signals        │   │ event trail    │
    │                │   │                │   │                │
    │ REVIEW GATE    │   │ NO GATE        │   │ APPEND ONLY    │
    │ required       │   │ advisory       │   │ never edit     │
    │                │   │                │   │                │
    │ accountKnowledge│  │ intelligence   │   │ activities[]   │
    └────────────────┘   └────────────────┘   └────────────────┘
```

**Prompt injection:**
- Category A: only `isPromptEligible()` items (confirmed + no conflict)
- Category B: all intelligence fields (advisory, labelled)
- Category C: touch history summary (deduplicated merge of activities + touchLog)
- `aeNotes` (research): included
- `aeNotesGenerated` (output): **never included** — excluded by design

---

## Key Files Reference

```
src/
├── context/
│   └── AppContext.jsx          — Single state store. All mutation functions.
│
├── data/
│   ├── schema.js               — createActivity, createAccountKnowledge, migrateLead,
│   │                             computeAiScore, applyScore, isConfirmed,
│   │                             isPromptEligible, INTELLIGENCE_REJECTED_FIELDS
│   └── mockData.js             — Default leads for new sessions
│
├── services/
│   ├── aiProvider.js           — callAI(prompt, settings) — Gemini API
│   ├── enrichLead.js           — enrichLead(lead, settings) — Gemini enrichment
│   ├── prompts.js              — buildLeadContext(), buildPrompt(), buildNotesPrompt()
│   └── sheetsAdapter.js        — SheetsAdapter class — all Sheets I/O
│
├── utils/
│   ├── intelligenceEngine.js   — deriveSignals, buildScoreBreakdown, deriveRankReasons
│   ├── timelineUtils.js        — normalizeEvent, groupByDate, TIMELINE_FILTERS
│   ├── accountKnowledgeMutations.js — applyAKReview, confirmAllPending, etc.
│   ├── accountKnowledgeUtils.js — getAgeBand, formatAgeLabel, formatRelativeDate
│   ├── cadenceUtils.js         — getPendingSteps, getCadenceProgress
│   └── reconcileUtils.js       — reconcileSheetLeads
│
├── components/
│   ├── AccountKnowledgeTab.jsx — Trust model UI (PendingCard, ExtractionQuote, ConflictCard)
│   ├── CommandCenter.jsx       — Phase 12: NextActionBanner, SDRWorkspaceTab,
│   │                             AIBriefingTab, PromptContextTab
│   ├── Copilot.jsx             — AI content generation wizard
│   ├── ActionCenter.jsx        — Quick action buttons
│   ├── NextBestStep.jsx        — deriveNextBestSuggestions()
│   └── RecordingUpload.jsx     — Gemini transcription → AK extraction
│
├── views/
│   ├── LeadPage.jsx            — Lead detail page. All lead tabs.
│   ├── WorkQueue.jsx           — Prioritised lead queue with rank reasons
│   ├── Pipeline.jsx            — Kanban stage view with drag-and-drop
│   ├── Dashboard.jsx           — Summary metrics
│   ├── Cadences.jsx            — Cadence Library management
│   ├── ReEngage.jsx            — Re-engagement workflow
│   ├── NewLead.jsx             — Lead creation form
│   └── BulkCSV.jsx             — CSV import
│
└── constants/
    ├── stages.js               — STAGES_ALL, STAGE_STYLE
    └── cadencePlan.js          — SEQ_PLAN default cadence

.kiro/steering/
├── ai-data-classification.md      — Category A / B / C classification framework
└── immutable-activity-policy.md   — Activity append-only rules
```

---

## Known Constraints

These are documented limitations of the current architecture. Understand them before building new features.

| Constraint | Location | Impact |
|-----------|----------|--------|
| `lead.lastTouch` is a display string, not a timestamp | `schema.js`, `deriveUrgency()` | Recency-based urgency unavailable without `lastTouchAt: ISO string` |
| `activities[]` has no size cap | `AppContext.addActivity()` | Memory growth risk at >200 entries per lead |
| Score recalculates on every render | `applyScore()` in `setLeads` | No memoisation — acceptable at current scale |
| `buildScoreBreakdown()` must mirror `computeAiScore()` manually | `intelligenceEngine.js` | Formula changes require two-file update |
| localStorage is the only persistence | `AppContext.jsx` | ~5–10 MB browser limit; risk at 150+ leads × 200 activities |
| No server-side deduplication | `sheetsAdapter.js` | Dedup relies on client-side `externalId` matching |

---

## Current Release Status

```
Version:            v1.0.0
Commit:             9c7d075
Branch:             main
Deployment:         READY
Confidence:         97 / 100
Standalone:         Standalone/birdeye-sdr-v1.0.0.html (668.7 KB)

All four architecture rules intact.
RC-2 blocker (Status Change activity) fixed.
18-point regression validation passed.
```

---

## Rules for Future Development

Before writing any code, confirm your change preserves all of the following:

**Data integrity:**
- `addLead() → pushLead()` is the only sheet row creation path
- `updateAccountKnowledge()` is the only AK write path
- `addActivity()` is the only activities write path
- `updateIntelligence()` rejects `INTELLIGENCE_REJECTED_FIELDS`

**Trust model:**
- AI-extracted facts always arrive as `reviewStatus: 'pending'`
- `isPromptEligible()` (not `isConfirmed()`) gates prompt injection
- `isConfirmed()` is for display only
- `geminiEnrichedAt` set only in `enrichLead.js`

**Scoring:**
- If `computeAiScore()` changes, update `buildScoreBreakdown()` to match
- Increment `CURRENT_SCORE_VERSION` on any scoring formula change
- Score history dedup guard must remain in both `updateIntelligence` and `updateLead`

**Timeline:**
- Every new `ACTIVITY_TYPE` must have a `normalizeEvent()` case in `timelineUtils.js`
- Never edit or delete an existing activity entry

**AI provenance:**
- New AI output paths must label generated content clearly
- New AK extraction paths must set `reviewStatus: 'pending'` and write `source`
- New intelligence enrichment paths must set `geminiEnrichedAt`

---

## Backlog Reference

See `docs/POST_DEPLOYMENT_BACKLOG.md` for the full prioritised list.

**Medium priority (address first):**
1. M-1: `activities[]` size cap (200 entries + archive)
2. M-2: Remove direct `pushLead()` in `NewLead.jsx`
3. M-3: `externalId`-first status sync in `updateStatus()`

**Low priority:**
4. L-1: Gate `scoreLastCalculatedAt` to scoring-sensitive fields
5. L-2: Fire activities from `bulkConfirmAccountKnowledge`
6. L-3/L-5: Consolidate `_fieldLabel()` into `accountKnowledgeUtils.js`
7. L-4: Add `scoreLastCalculatedAt: null` to `createIntelligence()`
