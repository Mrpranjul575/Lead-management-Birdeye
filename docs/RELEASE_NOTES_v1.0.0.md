# Release Notes — v1.0.0

**Project:** Birdeye SDR CRM
**Release Date:** June 2026
**Repository:** `Mrpranjul575/Lead-management-Birdeye`
**Release Commit:** `9c7d075`
**Deployment Status:** READY
**Confidence Score:** 97 / 100

---

## Project Summary

Birdeye SDR CRM is a custom lead management platform built for Birdeye SDRs. It provides a complete outreach workflow including lead tracking, AI-assisted content generation, account knowledge management, cadence execution, and explainable scoring — all running as a single self-contained HTML file with no backend dependency beyond Google Sheets and an optional AI API key.

The system is designed around three non-negotiable principles:

- **AI suggests. SDR decides. System records.**
- **Knowledge requires human review before entering AI context.**
- **Every meaningful action creates an immutable audit trail.**

---

## Release Artifact

| Item | Value |
|------|-------|
| Standalone file | `Standalone/birdeye-sdr-v1.0.0.html` |
| File size | 668.7 KB |
| JS bundle (gzip) | 172.4 KB |
| Build tool | Vite v5.4.21 |
| Modules | 1,543 transformed |
| Build errors | 0 |
| Build warnings | 0 |

Fully self-contained. All CSS and JS inlined. No external runtime dependencies. No CDN references. Deploy by opening directly in any modern browser.

---

## Completed Phases

### Phase 7 — Trust Model & Account Knowledge

Introduced the foundational distinction between **Account Knowledge** (persistent account facts) and **Intelligence** (analytical signals). Established the review-gated trust model that prevents AI from autonomously creating confirmed facts.

- `reviewStatus` per Account Knowledge sub-object: `pending` / `confirmed` / `dismissed` / `superseded`
- `isConfirmed()` — UI trust check
- `isPromptEligible()` — prompt-injection filter (confirmed + no active conflict)
- Conflict detection and resolution workflow (`conflictWith` field)
- Knowledge history for superseded facts
- `INTELLIGENCE_REJECTED_FIELDS` — blocks `updateIntelligence()` from writing AK-owned fields

### Phase 8 — Sheets Architecture & Data Integrity

Redesigned the Google Sheets integration around a strict row creation authority rule.

- `externalId` as primary identity (UUID assigned at lead creation)
- Identity matching order: `externalId → email → business name`
- **Only `addLead() → pushLead()` may create sheet rows** — all action handlers are update-only
- `isSheetOrigin` guard prevents sync feedback loops
- `reconcileSheetLeads()` — matches and updates without appending duplicates
- `readLeads()` handles both `json.data[]` and raw array response contracts

### Phase 9 — Cadence Engine

Full cadence execution system with library, visibility, and lifecycle management.

- **9A-1:** Custom cadence execution, stable step keys, day progression
- **9A-2:** Cadence Library — save, update, clone, delete, usage counts
- **9A-3:** Cadence visibility across Lead Page, Work Queue, Action Center, Next Best Step
- **9B:** ReEngage integration with activity persistence and timeline support
- **9C-1:** Cadence milestone activities — Cadence Started, Cadence Completed
- **9C-2:** Follow-Up automation with reply-check and duplicate guard

### Phase 10A — AE Notes Workspace

Redesigned the AE Notes experience from a single column to a structured two-panel workspace.

- Research panel (GMB URL, Keywords, Salesloft URL)
- Generated Notes panel (AI output, separate from research)
- `lead.aeNotes` = raw research input (feeds prompt context)
- `lead.aeNotesGenerated` = structured output (never feeds prompt context)
- Copy All, Regenerate, Save + Push to Sheets

### Phase 10B — AI Workflow Integration

- **10B-1:** Prompt standardisation — cadenceStep override, LinkedIn/Situational/Cadence/ReEngage prompt wiring
- **10B-2:** Cadence step context — `openCopilot(mode, lead, step)` passes full step context to generator
- **10B-3:** Call Notes → Intelligence ingestion — `extractNotesJSON()`, intelligence update, Account Knowledge competitor creation with `reviewStatus: 'pending'`

### Phase 10C — AI Provenance

Fixed incorrect source attribution and surfaced extraction evidence in the review workflow.

- **10C-1:** `copilot-notes` added to `SOURCE_META` → `🤖 AI Notes` (was incorrectly showing `📁 Migrated`)
- **10C-2:** `ExtractionQuote` component in `PendingCard` — shows AI extraction context sentence before SDR confirms or dismisses a fact
- Notes prompt upgraded to return `{ name, context }` competitor objects
- `geminiEnrichedAt` added to intelligence — set only by `enrichSingleLead()`, never by SDR edits
- `✨ AI Intelligence · Last enriched Xh ago` provenance badge in AI Intelligence tab

### Phase 10D — Unified Lead Timeline

Transformed the Timeline tab from a basic activity viewer into a single source of truth for all lead activity.

- `src/utils/timelineUtils.js` — pure event-normalization layer: `normalizeEvent()`, `groupByDate()`, `TIMELINE_FILTERS`
- `KNOWLEDGE_UPDATE` added to `ACTIVITY_TYPES`
- Knowledge lifecycle now fully visible: Competitor Detected → Extraction Context → Approved / Rejected
- New activity generation: Competitor Approved, Competitor Rejected, AI Intelligence Enriched
- Stage Change activity added (fixed in RC-2 — see below)
- Filter bar with live per-filter event counts
- Immutable Activity Policy formalised and documented in `.kiro/steering/immutable-activity-policy.md`

### Phase 11 — Explainable Lead Scoring

Answers "Why is this lead scored 84?" directly in the UI.

- `buildScoreBreakdown(lead)` — pure function mirroring `computeAiScore()` and `deriveBuyingIntentScore()` exactly
- Score Explainer tab (new, position 2 in Lead Page)
- Two independent score panels: **Opportunity Score** (external market signal) and **Buying Intent Score** (readiness to convert)
- Each factor shown with: points badge, progress bar, human-readable reason string
- Score History panel — chronological snapshots with delta arrows (▲/▼) and trigger labels
- `scoreLastCalculatedAt` — set on every scoring pass for provenance display
- `intelligence.scoreHistory[]` — append-only, capped at 50, deduped by score-change guard

### Phase 12 — SDR Command Center

Reduces clicks-to-answer for the four core SDR questions: who, why, what, what next.

- `NextActionBanner` — persistent bar between lead header and tab bar, visible on all tabs
- `SDRWorkspaceTab` — default tab, two-column layout covering scores, action, cadence, intelligence, AK, recent timeline
- `AIBriefingTab` — pre-call brief with pain points, signals, competitors, recommended angle
- `PromptContextTab` — shows exactly what the AI receives: ✓ included / ✗ excluded per field with exclusion reasons
- Work Queue 2.0 — `deriveRankReasons()` chips inline under each business name (no tooltip required)
- Default lead page tab changed from `overview` to `workspace`

### RC-2 — Deployment Hardening

Final pre-release audit and blocker fix.

**Blocker fixed:** `updateLead()` two-pass `setLeads()` bug caused Status Change activities to never fire. Root cause: pass 2 read `lead.stage` after pass 1 had already applied the new stage, so `previousStage === patch.stage` was always true. Fixed by collapsing to a single `setLeads()` functional update where `previousStage` is captured from `l.stage` (pre-mutation) before the patch is applied.

**18-point regression validation passed.** All architecture invariants confirmed intact.

---

## Known Limitations

These limitations are documented and do not block deployment. All are candidates for the post-deployment backlog.

| Limitation | Impact | Priority |
|------------|--------|---------|
| `activities[]` has no size cap | Memory growth on high-volume leads (>200 activities) | Medium |
| `NewLead.jsx` direct `pushLead()` before `addLead()` assigns `externalId` | Sheet row may lack `externalId`, degrading dedup reliability for manually-pushed leads | Medium |
| `scoreLastCalculatedAt` written on every `updateLead()` call | Score provenance may show "recalculated just now" after a non-scoring edit (e.g. AE Notes) | Low |
| `bulkConfirmAccountKnowledge` produces no activities | "Confirm All" not visible in Timeline | Low |
| `updateStatus()` uses email as Sheets identity, not `externalId` | Silent no-op when lead has no email | Low |
| `_fieldLabel()` helper duplicated in `AppContext.jsx` and `timelineUtils.js` | Maintenance drift risk if AK field types expand | Low |
| `scoreLastCalculatedAt: null` absent from `createIntelligence()` default | Schema incompleteness — no functional impact (all consumers use `?.`) | Low |
| No `lastTouchAt: ISO string` field on lead schema | Urgency and engagement derivation uses activity array head rather than a dedicated timestamp | Low / Future |

---

## Deployment Notes

1. **Open `Standalone/birdeye-sdr-v1.0.0.html` directly in any modern browser.** No server, no install, no dependencies.
2. **Data persists in `localStorage`** under key `birdeye_sdr_leads_v4`. Data survives browser restarts and tab closes.
3. **Gemini API key** — configure in Settings → AI & Copilot. Required for direct generation. Without it, the system falls back to Claude copy-paste mode.
4. **Google Sheets URL** — configure in Settings → Google Sheets. Required for Sheets sync. The app works fully offline without it.
5. **Git tag `v1.0.0`** is on local `main`. Push with: `git push origin v1.0.0`
6. **Future development** moves to Claude Code. See `docs/CLAUDE_CODE_HANDOFF.md`.
