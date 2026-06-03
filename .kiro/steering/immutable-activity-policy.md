# Immutable Activity Policy

**Status:** Architectural rule — locked.
**Established:** Phase 10D review / Phase 11 pre-work.
**Applies to:** All code that reads or writes `lead.activities[]`.

---

## Rule

Activities are append-only.

Once an activity entry is written to `lead.activities[]`, it is never edited,
updated, or deleted. New information is expressed by appending a new activity,
not by mutating an existing one.

---

## Rationale

The Timeline tab (Phase 10D) is the platform audit log. It answers:

> "What happened to this lead, when, and why?"

An audit log that can be silently edited is not an audit log.
It is mutable state with timestamps.

Phase 10D review explicitly designated activities as **immutable audit history**,
on par with the trust model's treatment of Account Knowledge facts.

---

## What This Means in Practice

### Allowed — append a new event

```js
addActivity(leadId, 'Status Change', 'Stage changed: Hot → Demo Booked', {
  previousStage: 'Hot',
  newStage: 'Demo Booked',
});
```

### Allowed — correct the record by appending a correction event

```js
addActivity(leadId, 'Note', 'Correction: previous call outcome was Positive, not No Answer', {
  source: 'sdr_manual',
});
```

### NOT allowed — editing an existing activity

```js
// ❌ Never do this
setLeads(ls => ls.map(l => l.id === leadId ? {
  ...l,
  activities: l.activities.map(a =>
    a.activityId === targetId ? { ...a, outcome: 'Positive' } : a
  ),
} : l));
```

### NOT allowed — deleting an activity

```js
// ❌ Never do this
activities.filter(a => a.activityId !== targetId)
```

---

## Enforcement

`addActivity()` in `AppContext.jsx` is the **only** permitted write path to
`lead.activities[]`. It prepends new entries — it never reads, modifies, or
removes existing ones.

No component may call `setLeads()` in a way that mutates the `activities`
array of an existing entry. If you need to do this, stop and reconsider —
the correct solution is always to append a new activity.

---

## Boundary: What Is Not an Activity

Not everything belongs in `lead.activities[]`.

| Data | Correct location |
|------|-----------------|
| Account Knowledge facts (competitors, DMs, tools) | `lead.accountKnowledge` |
| Intelligence signals (buyingSignals, objections) | `lead.intelligence` |
| SDR personal notes and tags | `lead.memory[]` |
| Follow-up tasks | `lead.followUps[]` |
| Score history snapshots | `lead.intelligence.scoreHistory[]` |
| AE Notes research | `lead.aeNotes` |
| Generated output | `lead.aeNotesGenerated` |

Activities record **that something happened**.
They do not store the thing itself.

---

## Score History (Phase 11)

Score changes are a special case. `lead.intelligence.scoreHistory[]` is a
separate, append-only array of score snapshots. It is distinct from
`lead.activities[]` but follows the same immutability rule:

- Snapshots are prepended — never edited.
- A snapshot records: `{ score, breakdown, timestamp, trigger }`.
- Consumers display history; they never mutate it.

---

## Relationship to AI Data Classification

See `.kiro/steering/ai-data-classification.md`.

Activities are **Category C — Audit History**:

| Category | Description | Mutable? |
|----------|-------------|----------|
| A — Knowledge | Persistent account facts | Append-only (review-gated) |
| B — Intelligence | Analytical signals | Overwritable (advisory) |
| C — History | Audit trail of events | **Immutable — append only** |

This three-category model is now the complete AI data classification framework.
