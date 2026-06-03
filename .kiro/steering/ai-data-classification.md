# AI Data Classification

**Status:** Architectural reference — locked principle.
**Established:** Phase 10C review (post-Phase 10B-3).
**Applies to:** All future features that read, write, or display AI-generated data.

---

## The Two Categories

Every piece of AI-generated data in this system belongs to exactly one category.
The category determines storage location, trust rules, UI treatment, and review requirements.

---

### Category A — Knowledge

**Definition:** Persistent account facts. Things that are true about the prospect's business world, independent of any single conversation.

**Examples:**
- `accountKnowledge.competitors[]`
- `accountKnowledge.decisionMakers[]`
- `accountKnowledge.currentTools[]`
- `accountKnowledge.businessGoals[]`
- `accountKnowledge.recurringObjections[]`
- `accountKnowledge.budget`
- `accountKnowledge.purchaseTimeline`

**Rules:**
- **Review required.** AI cannot create confirmed Knowledge. All AI-extracted items enter as `reviewStatus: 'pending'` and are excluded from prompt context until an SDR confirms them.
- **Trust model enforced.** `isConfirmed()`, `isPromptEligible()`, `hasConflict()` gate all reads.
- **Conflict resolution workflow.** When new extraction disagrees with a confirmed fact, `conflictWith` is set on the confirmed entry. The SDR resolves explicitly.
- **Authoritative once confirmed.** Confirmed facts enter prompt context and are treated as ground truth for outreach personalisation.
- **Storage:** `lead.accountKnowledge` — never `lead.intelligence`.
- **Write path:** `updateAccountKnowledge()` only. `updateIntelligence()` rejects writes to `INTELLIGENCE_REJECTED_FIELDS`.
- **Sheets sync:** Name/identity fields only (e.g. `competitor1`, `competitor2`). Full AK objects are never exported.

**Source values:** `transcript` · `call_note` · `sdr_manual` · `copilot-notes` · `migrated`

---

### Category B — Intelligence

**Definition:** Analytical scoring signals and advisory interpretations. Things that describe the current state of the relationship or opportunity — not persistent facts about the account.

**Examples:**
- `intelligence.buyingSignals[]`
- `intelligence.objections[]`
- `intelligence.painPoints[]`
- `intelligence.leadTemperature`
- `intelligence.summary`
- `intelligence.nextBestAction`
- `intelligence.aiRecommendation`
- `intelligence.meetingProbability`

**Rules:**
- **No review required.** AI writes directly. No pending queue. No confirmation step.
- **Advisory only.** These are interpretations, not facts. SDRs can read, edit, or override any field directly in the AI Intelligence tab.
- **Provenance visible.** `intelligence.geminiEnrichedAt` records when Gemini last wrote scoring-signal fields. Surfaced in the AI Intelligence tab as `✨ AI Intelligence · Last enriched Xh ago`. This provides transparency without friction.
- **Affects prioritisation and scoring.** `buyingSignals` and `objections` drive `buyingIntentScore`. `objections` also influences `riskLevel`. These are computed at render time by `intelligenceEngine.js`.
- **Storage:** `lead.intelligence` — never `lead.accountKnowledge`.
- **Write path:** `updateIntelligence()`. Rejects writes to `INTELLIGENCE_REJECTED_FIELDS` (fields that have migrated to AK).

---

## Classification Decision Rule

When adding a new AI-generated field, ask two questions:

**1. Is it a persistent fact about the account?**
> Would it remain true regardless of how the SDR relationship progresses?
> Does it describe the prospect's business world (competitors, tools, people, budget)?
→ **Category A — Knowledge.** Requires review gate.

**2. Is it an analytical interpretation of the current opportunity?**
> Does it describe how hot the lead is, what the SDR should do next, or signals observed in a conversation?
> Would it change if Gemini re-ran the analysis tomorrow?
→ **Category B — Intelligence.** No review gate. Add provenance metadata.

If a field could fit both, default to **Category A**. The cost of an incorrect fact entering prompt context is higher than the friction of one extra review click.

---

## Provenance Standards

### Category A — Knowledge
Every item carries:
```js
{
  source:       'copilot-notes' | 'transcript' | 'call_note' | 'sdr_manual' | 'migrated',
  sourceDate:   ISO string,
  reviewStatus: 'pending' | 'confirmed' | 'dismissed' | 'superseded',
  reviewedAt:   ISO string | null,
  context:      string,   // AI-generated extraction context sentence (not verbatim user quote)
}
```
`context` is displayed in the `Extraction Context` block of `PendingCard` to help SDRs validate before confirming. It is explainability metadata — not injected into prompts, not exported.

### Category B — Intelligence
The intelligence object carries:
```js
{
  geminiEnrichedAt: ISO string | null,  // set ONLY by enrichSingleLead() → enrichLead()
  lastUpdated:      ISO string,         // reset on any write, including manual SDR edits
  insightVersion:   number,             // incremented by Copilot situational analysis
}
```
`geminiEnrichedAt` is **never** set by manual SDR edits through `updateIntelligence()`. This preserves the distinction between AI-sourced signals and SDR-authored data.

---

## Source Label Reference

| `source` value   | Icon | Label       | Color     | Category |
|------------------|------|-------------|-----------|----------|
| `copilot-notes`  | 🤖   | AI Notes    | `#7C5CE8` | A        |
| `transcript`     | 🎙   | Transcript  | `#3B82F6` | A        |
| `call_note`      | 📝   | Call Note   | `#10B981` | A        |
| `sdr_manual`     | ✏   | Manual      | `#7C5CE8` | A        |
| `migrated`       | 📁   | Migrated    | `#8B949E` | A        |
| `gemini`         | ✨   | AI Intelligence | `#60A5FA` | B    |

---

## What This Is Not

- This is **not** a general data schema document. See `src/data/schema.js`.
- This is **not** a UI component reference. See `AccountKnowledgeTab.jsx`, `LeadPage.jsx`.
- This is **not** a Sheets sync contract. See `src/services/sheetsAdapter.js`.

This document governs **trust rules and classification decisions** only.

---

## History

| Phase   | Change |
|---------|--------|
| 7B      | `INTELLIGENCE_REJECTED_FIELDS` established. `updateIntelligence()` rejects AK-owned fields. |
| 7C      | `reviewStatus` per AK sub-object. `pending` / `confirmed` / `dismissed` trust model live. |
| 7D      | `conflictWith` conflict resolution. `superseded` status. History section. |
| 10B-3   | `copilot-notes` source created. Call Notes → Intelligence + AK ingestion. `lastExtractedFrom`. |
| 10C-1   | `copilot-notes` added to `SOURCE_META`. Fixes incorrect "Migrated" label. |
| 10C-2   | `context` field on competitor items. `ExtractionQuote` in `PendingCard`. Label: "Extraction Context". |
| 10C     | `geminiEnrichedAt` added to Intelligence. AI Intelligence provenance badge in AI Intelligence tab. Category A / B distinction formally documented here. |
