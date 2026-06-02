import { SheetsAdapter } from '../services/sheetsAdapter';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { MOCK_LEADS, MOCK_CADENCES, SEQ_PLAN } from '../data/mockData';
import { migrateLead, createActivity, createIntelligence, createAccountKnowledge, mergeAccountKnowledge, isConfirmed, computeAiScore, applyScore, CURRENT_SCORE_VERSION, INTELLIGENCE_REJECTED_FIELDS } from '../data/schema';
import { getPendingSteps, isDayComplete, isCadenceComplete, nextCadenceDay } from '../utils/cadenceUtils';

const AppCtx = createContext(null);
const STORAGE_KEY = 'birdeye_sdr_leads_v4';
const CAD_KEY     = 'birdeye_sdr_cadences';
const SETTINGS_KEY= 'birdeye_sdr_settings';

function loadLeads() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const raw = s ? JSON.parse(s) : MOCK_LEADS;
    let needsWrite = false;

    const migrated = raw.map(lead => {
      const m = migrateLead(lead);
      if (m.scoreVersion !== CURRENT_SCORE_VERSION) {
        const scored = applyScore(m);
        needsWrite = true;
        return scored;
      }
      return m;
    });

    // Persist immediately so the next load skips migration entirely
    if (needsWrite) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
    }

    return migrated;
  } catch { return MOCK_LEADS.map(lead => applyScore(migrateLead(lead))); }
}
function loadCadences() {
  try { const s=localStorage.getItem(CAD_KEY); return s?JSON.parse(s):MOCK_CADENCES; } catch { return MOCK_CADENCES; }
}
function loadSettings() {
  try { const s=localStorage.getItem(SETTINGS_KEY); return s?JSON.parse(s):{ aiProvider:'claude', geminiKey:'', claudeKey:'' }; } catch { return { aiProvider:'claude' }; }
}

export function AppProvider({ children }) {
  const [theme,       setTheme]       = useState('dark');
  const [view,        setView]        = useState('workqueue');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [leads,       setLeads]       = useState(loadLeads);
  const [cadences,    setCadences]    = useState(loadCadences);
  const [activeLead,  setActiveLead]  = useState(null);
  const [selected,    setSelected]    = useState(new Set());
  const [copilot,     setCopilot]     = useState({ open:false, mode:null, lead:null });
  const [search,      setSearch]      = useState('');
  const [settings,    setSettings]    = useState(loadSettings);
  const [clipSearch,  setClipSearch]  = useState(false); // clipboard search modal

  // ── Persistence ──
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(leads)); } catch {} }, [leads]);
  useEffect(() => { try { localStorage.setItem(CAD_KEY, JSON.stringify(cadences)); } catch {} }, [cadences]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} }, [settings]);

  // ── Theme ──
  const toggleTheme   = useCallback(() => setTheme(t => t==='dark'?'light':'dark'), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

  // ── Core lead CRUD ──
  const updateLead = useCallback((id, patch) => {
    setLeads(ls => {
      // If stage is changing, fire Sheets status sync before returning new array
      if (patch.stage) {
        const lead = ls.find(l => l.id === id);
        if (lead?.email) {
          SheetsAdapter.updateStatus(lead.email, patch.stage).catch(() => {});
        }
      }
      return ls.map(l => l.id===id ? applyScore({ ...l, ...patch }) : l);
    });
    setActiveLead(al => al?.id===id ? applyScore({ ...al, ...patch }) : al);
  }, []);

  const updateLeadMerged = useCallback((id, ...patches) => {
    const merged = Object.assign({}, ...patches);
    updateLead(id, merged);
  }, [updateLead]);

  const addLead = useCallback((lead) => {
    const newLead = applyScore(migrateLead({
      ...lead,
      id: Date.now(),
      touchLog:   lead.touchLog   || [],
      activity:   lead.activity   || [],
      activities: lead.activities || [],
      memory:     lead.memory     || [],
      followUps:  lead.followUps  || [],
      files:      lead.files      || [],
      seqLog:     lead.seqLog     || {},
    }));
    setLeads(ls => [newLead, ...ls]);
    // Push to Google Sheets Web App
    setTimeout(() => {
      SheetsAdapter.pushLead(newLead).catch(() => {});
    }, 0);
    return newLead;
  }, []);

  // ── Intelligence ──
  // Phase 7B: updateIntelligence rejects writes to fields owned by accountKnowledge.
  // Ownership list is centralised in INTELLIGENCE_REJECTED_FIELDS (schema.js).
  // Rejected keys are stripped with a console.warn; remaining keys are written normally.
  // If the patch consists entirely of rejected fields, the function returns early
  // to avoid a spurious lastUpdated write with no actual change.
  const updateIntelligence = useCallback((leadId, patch) => {
    const rejectedKeys = Object.keys(patch).filter(k => INTELLIGENCE_REJECTED_FIELDS.has(k));
    if (rejectedKeys.length > 0) {
      console.warn(
        `[Phase 7B] updateIntelligence: rejected write to [${rejectedKeys.join(', ')}] ` +
        `— these fields are owned by accountKnowledge. Use updateAccountKnowledge() instead.`
      );
    }
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([k]) => !INTELLIGENCE_REJECTED_FIELDS.has(k))
    );
    if (Object.keys(safePatch).length === 0) return;
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return applyScore({ ...l, intelligence: { ...l.intelligence, ...safePatch, lastUpdated: new Date().toISOString() } });
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return applyScore({ ...al, intelligence: { ...al.intelligence, ...safePatch, lastUpdated: new Date().toISOString() } });
    });
  }, []);

  // ── Account Knowledge ──
  // Phase 7B: single write path for all accountKnowledge-owned fields.
  // Uses mergeAccountKnowledge() (pure function in schema.js) for all array
  // deduplication and field-level merge rules. applyScore() is intentionally
  // NOT called here — scoring functions do not read accountKnowledge.
  const updateAccountKnowledge = useCallback((leadId, patch) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      const merged = mergeAccountKnowledge(
        l.accountKnowledge || createAccountKnowledge(),
        patch
      );
      return { ...l, accountKnowledge: merged };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      const merged = mergeAccountKnowledge(
        al.accountKnowledge || createAccountKnowledge(),
        patch
      );
      return { ...al, accountKnowledge: merged };
    });
  }, []);

  // ── Account Knowledge review actions — Phase 7C-2B ──────────────────────
  //
  // confirmAccountKnowledgeFact(leadId, field, identityKey, updatedValues?)
  //   Sets reviewStatus → 'confirmed', reviewedAt → now on the matched item.
  //   For arrays: finds item by identityKey (name / goal / objection).
  //   For scalars (budget, purchaseTimeline): identityKey is ignored (null).
  //   updatedValues: optional partial object merged into the item before
  //     confirming — supports the "add manually" path in the AK tab where
  //     the SDR supplies full values on confirm.
  //   applyScore() intentionally NOT called — scoring does not read AK.
  //
  // dismissAccountKnowledgeFact(leadId, field, identityKey)
  //   Sets reviewStatus → 'dismissed', reviewedAt → now.
  //   Item is retained in the array for audit trail.
  //   mergeAccountKnowledge() dismissed-skip ensures re-extraction is possible.
  //
  // bulkConfirmAccountKnowledge(leadId)
  //   Confirms every pending item across all fields in one batch update.
  //   Single setState call per store (leads + activeLead) for performance.

  // ── Identity-key lookup helpers (pure, not exported) ──
  // Each field uses a different property as its dedup identity key.
  const AK_IDENTITY_KEY = {
    competitors:         'name',
    decisionMakers:      'name',
    currentTools:        'name',
    businessGoals:       'goal',
    recurringObjections: 'objection',
  };
  const AK_ARRAY_FIELDS   = new Set(Object.keys(AK_IDENTITY_KEY));
  const AK_SCALAR_FIELDS  = new Set(['budget', 'purchaseTimeline']);

  // Applies reviewStatus + reviewedAt update to a single accountKnowledge,
  // returning a new object. Pure — does not mutate.
  function applyAKReview(ak, field, identityKey, reviewStatus, updatedValues = {}) {
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

  // Confirms every pending item across all AK fields in one pass.
  function confirmAllPending(ak) {
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
      budget:          ak.budget?.reviewStatus          === 'pending' ? { ...ak.budget,          reviewStatus: 'confirmed', reviewedAt: now } : ak.budget,
      purchaseTimeline:ak.purchaseTimeline?.reviewStatus === 'pending' ? { ...ak.purchaseTimeline, reviewStatus: 'confirmed', reviewedAt: now } : ak.purchaseTimeline,
    };
  }

  const confirmAccountKnowledgeFact = useCallback((leadId, field, identityKey, updatedValues = {}) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyAKReview(l.accountKnowledge, field, identityKey, 'confirmed', updatedValues) };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: applyAKReview(al.accountKnowledge, field, identityKey, 'confirmed', updatedValues) };
    });
  }, []);

  const dismissAccountKnowledgeFact = useCallback((leadId, field, identityKey) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyAKReview(l.accountKnowledge, field, identityKey, 'dismissed') };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: applyAKReview(al.accountKnowledge, field, identityKey, 'dismissed') };
    });
  }, []);

  const bulkConfirmAccountKnowledge = useCallback((leadId) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: confirmAllPending(l.accountKnowledge) };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: confirmAllPending(al.accountKnowledge) };
    });
  }, []);

  // ── Account Knowledge conflict resolution — Phase 7D-B ───────────────────
  //
  // resolveConflict(leadId, field, identityKey, resolution)
  //   resolution: 'keep' | 'accept'
  //   Both paths clear conflictWith and stamp reviewedAt = now.
  //   'keep': confirmed values are correct. conflictWith discarded.
  //   'accept': conflictWith factual values applied over confirmed entry.
  //             Original source/sourceDate preserved (Modification 1) —
  //             the SDR validated an extraction; they did not originate the fact.
  //   applyScore() NOT called — scoring does not read accountKnowledge.
  //
  //   conflictWith payload shapes per field (for Phase 7D-C rendering):
  //     competitors:      { strength, context, source, sourceDate, extractedFrom }
  //     decisionMakers:   { role, authority, notes, source, sourceDate, extractedFrom }
  //     currentTools:     { category, source, sourceDate, extractedFrom }
  //     budget:           { status, amount, notes, source, sourceDate, extractedFrom }
  //     purchaseTimeline: { urgency, targetDate, notes, source, sourceDate, extractedFrom }
  //   businessGoals and recurringObjections carry no conflictWith (no sub-values).
  //
  //   Future: resolvedAt (ISO timestamp) to be added in a later phase.
  //   Conflict resolution and fact review are distinct lifecycle events.
  //   resolvedAt will record when a conflict was explicitly settled, separate
  //   from reviewedAt which records the last SDR touch on the confirmed value.
  //
  // keepExistingFact(leadId, field, identityKey)
  //   Convenience wrapper for resolveConflict(..., 'keep').
  //   Named for call-site clarity in the conflict UI: the SDR is explicitly
  //   saying "what I have is correct."
  //
  // supersedeFact(leadId, field, oldKey, newItem)
  //   Array fields only. Marks old entry as 'superseded' (retained for history),
  //   appends newItem as 'confirmed'. Use when the old fact was true but is
  //   no longer true (e.g. switched tools, new decision maker).
  //   Distinct from resolveConflict('accept') which updates values in-place:
  //     resolveConflict('accept') → old value was wrong, correct it
  //     supersedeFact()           → old value was right, now replaced
  //   Scalar fields (budget, purchaseTimeline) do not support supersession —
  //   use resolveConflict('accept') for scalars.

  // conflictWith factual field sets per array type — used by applyConflictResolution
  // to extract only factual values from conflictWith, excluding provenance metadata.
  const CONFLICT_FACT_FIELDS = {
    competitors:      ['strength', 'context'],
    decisionMakers:   ['role', 'authority', 'notes'],
    currentTools:     ['category'],
    budget:           ['status', 'amount', 'notes'],
    purchaseTimeline: ['urgency', 'targetDate', 'notes'],
  };

  /**
   * applyConflictResolution — pure helper.
   * Returns new accountKnowledge with conflict on the matched item resolved.
   * 'keep' : clears conflictWith, stamps reviewedAt. No value change.
   * 'accept': applies conflictWith factual values over confirmed entry,
   *           clears conflictWith, stamps reviewedAt.
   *           Original source/sourceDate preserved per Modification 1.
   */
  function applyConflictResolution(ak, field, identityKey, resolution) {
    if (!ak) return ak;
    const now = new Date().toISOString();
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

  /**
   * applySupersede — pure helper. Array fields only.
   * Marks old entry 'superseded' (kept for history), appends newItem as 'confirmed'.
   * Also clears any conflictWith on the old entry (supersession resolves it).
   */
  function applySupersede(ak, field, oldKey, newItem) {
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

  const resolveConflict = useCallback((leadId, field, identityKey, resolution) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyConflictResolution(l.accountKnowledge, field, identityKey, resolution) };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: applyConflictResolution(al.accountKnowledge, field, identityKey, resolution) };
    });
  }, []);

  const keepExistingFact = useCallback((leadId, field, identityKey) => {
    resolveConflict(leadId, field, identityKey, 'keep');
  }, [resolveConflict]);

  const supersedeFact = useCallback((leadId, field, oldKey, newItem) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applySupersede(l.accountKnowledge, field, oldKey, newItem) };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: applySupersede(al.accountKnowledge, field, oldKey, newItem) };
    });
  }, []);

  // ── Account Knowledge freshness — Phase 7D-D ─────────────────────────────
  //
  // reverifyAccountKnowledgeFact(leadId, field, identityKey)
  //   Sets reviewedAt → now on the matched item. No other changes.
  //   Modification 1: source is NOT overwritten. The SDR verified the fact;
  //   they did not originate it. Original provenance is preserved.
  //   applyScore() NOT called — scoring does not read accountKnowledge.

  /**
   * applyReverify — pure helper. Updates reviewedAt only; source unchanged.
   * Works for both array fields (by identityKey) and scalar fields (identityKey null).
   */
  function applyReverify(ak, field, identityKey) {
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

  const reverifyAccountKnowledgeFact = useCallback((leadId, field, identityKey) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyReverify(l.accountKnowledge, field, identityKey) };
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return { ...al, accountKnowledge: applyReverify(al.accountKnowledge, field, identityKey) };
    });
  }, []);

  const addActivity = useCallback((leadId, type, summary, details = {}) => {
    const entry = createActivity(type, summary, details);
    setLeads(ls => ls.map(l => l.id===leadId
      ? { ...l, activities: [entry, ...(l.activities||[])] }
      : l
    ));
    setActiveLead(al => al?.id===leadId
      ? { ...al, activities: [entry, ...(al.activities||[])] }
      : al
    );
    return entry;
  }, []);

  // ── Memory ──
  const addMemoryEntry = useCallback((leadId, entry) => {
    const mem = { ...entry, id: Date.now() };
    setLeads(ls => ls.map(l => l.id===leadId ? { ...l, memory: [mem, ...(l.memory||[])] } : l));
    setActiveLead(al => al?.id===leadId ? { ...al, memory: [mem, ...(al.memory||[])] } : al);
  }, []);
  const removeMemoryEntry = useCallback((leadId, memId) => {
    setLeads(ls => ls.map(l => l.id===leadId ? { ...l, memory:(l.memory||[]).filter(m=>m.id!==memId) } : l));
    setActiveLead(al => al?.id===leadId ? { ...al, memory:(al.memory||[]).filter(m=>m.id!==memId) } : al);
  }, []);

  // ── Legacy helpers (backwards compat) ──
  const addActivityEntry = useCallback((leadId, text) => {
    addActivity(leadId, 'Note', text, { content: text, source:'system' });
  }, [addActivity]);

  const addTouchEntry = useCallback((leadId, touch) => {
    addActivity(leadId, touch.type||'Email', `${touch.type||'Email'} sent`, { content:touch.content, outcome:'Sent' });
    // Also keep legacy touchLog for prompt engine
    const entry = { ...touch, id:Date.now() };
    setLeads(ls => ls.map(l => l.id===leadId ? { ...l, touchLog:[...(l.touchLog||[]),entry] } : l));
    setActiveLead(al => al?.id===leadId ? { ...al, touchLog:[...(al.touchLog||[]),touch] } : al);
  }, [addActivity]);

  // ── Selection ──
  const toggleSelect    = useCallback((id) => setSelected(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; }), []);
  const selectAll       = useCallback((ids) => setSelected(new Set(ids)), []);
  const clearSelect     = useCallback(() => setSelected(new Set()), []);
  const bulkUpdateStage = useCallback((stage) => {
    setLeads(ls => ls.map(l => selected.has(l.id) ? {...l,stage} : l));
    clearSelect();
  }, [selected, clearSelect]);

  // ── Navigation ──
  const openLead = useCallback((lead) => {
    setLeads(ls => {
      const fresh = ls.find(l => l.id===lead.id) || lead;
      setActiveLead(fresh);
      return ls;
    });
  }, []);
  const closeLead = useCallback(() => setActiveLead(null), []);

  // ── Copilot ──
  const openCopilot  = useCallback((mode, lead=null) => {
    setCopilot({ open:true, mode: mode?.toLowerCase()||'email', lead });
  }, []);
  const closeCopilot = useCallback(() => setCopilot({ open:false, mode:null, lead:null }), []);

  // ── Cadence Execution ──
  const markStepComplete = useCallback((leadId, stepKey, cadenceDay) => {
    const step    = SEQ_PLAN.find(s => s.key === stepKey);
    const summary = `${step?.label || stepKey} completed — Day ${cadenceDay}, ${step?.channel || 'Unknown'}`;

    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return applyScore({ ...l, seqLog: { ...l.seqLog, [stepKey]: true }, lastTouch: 'Just now' });
    }));
    setActiveLead(al => {
      if (al?.id !== leadId) return al;
      return applyScore({ ...al, seqLog: { ...al.seqLog, [stepKey]: true }, lastTouch: 'Just now' });
    });

    addActivity(leadId, 'Cadence Update', summary, {
      source:      'cadence',
      stepKey,
      stepLabel:   step?.label    || stepKey,
      stepChannel: step?.channel  || 'Unknown',
      cadenceDay,
    });
  }, [addActivity]);

  const advanceCadenceDay = useCallback((leadId) => {
    setLeads(ls => {
      const lead = ls.find(l => l.id === leadId);
      if (!lead || !isDayComplete(lead) || isCadenceComplete(lead)) return ls;

      const nextDay   = nextCadenceDay(lead.cadenceDay);
      const nextSteps = SEQ_PLAN.filter(s => s.day === nextDay);
      const nextAction = nextSteps.length > 0
        ? `Day ${nextDay}: ${nextSteps[0].label}`
        : `Day ${nextDay}`;

      // Log activity with the read of canonical lead data
      addActivity(leadId, 'Cadence Update', `Advanced to Day ${nextDay}`, {
        source:      'cadence',
        cadenceDay:  nextDay,
        stepLabel:   nextAction,
        stepChannel: nextSteps[0]?.channel || 'Unknown',
      });

      return ls.map(l => l.id !== leadId ? l : { ...l, cadenceDay: nextDay, nextAction });
    });
    setActiveLead(al => {
      if (!al || al.id !== leadId) return al;
      if (!isDayComplete(al) || isCadenceComplete(al)) return al;
      const nextDay   = nextCadenceDay(al.cadenceDay);
      const nextSteps = SEQ_PLAN.filter(s => s.day === nextDay);
      const nextAction = nextSteps.length > 0
        ? `Day ${nextDay}: ${nextSteps[0].label}`
        : `Day ${nextDay}`;
      return { ...al, cadenceDay: nextDay, nextAction };
    });
  }, [addActivity]);

  // ── Cadences ──
  const saveCadence   = useCallback((cad) => {
    if (cad.id) setCadences(cs => cs.map(c => c.id===cad.id?cad:c));
    else setCadences(cs => [...cs, { ...cad, id:Date.now() }]);
    // Push cadence step summary to Google Sheets
    setTimeout(() => {
      const stepSummary = cad.steps?.map(s =>
        `Day ${s.day}: ${s.channel} — ${s.angle || s.name || ''}`
      ).join('\n') || '';
      SheetsAdapter.pushGeneratedContent(
        { business: 'Cadence: ' + cad.name, email: '', stage: 'Active' },
        { email1: stepSummary }
      ).catch(() => {});
    }, 0);
  }, []);
  const deleteCadence = useCallback((id) => setCadences(cs => cs.filter(c=>c.id!==id)), []);

  // ── Settings ──
  const updateSettings = useCallback((patch) => setSettings(s => ({...s,...patch})), []);

  return (
    <AppCtx.Provider value={{
      theme, toggleTheme,
      sidebarOpen, toggleSidebar,
      view, setView,
      leads, addLead, updateLead, updateLeadMerged,
      updateIntelligence, updateAccountKnowledge,
      confirmAccountKnowledgeFact, dismissAccountKnowledgeFact, bulkConfirmAccountKnowledge,
      resolveConflict, keepExistingFact, supersedeFact, reverifyAccountKnowledgeFact,
      addActivity, addActivityEntry, addMemoryEntry, removeMemoryEntry, addTouchEntry,
      cadences, saveCadence, deleteCadence,
      markStepComplete, advanceCadenceDay,
      activeLead, openLead, closeLead,
      selected, toggleSelect, selectAll, clearSelect, bulkUpdateStage,
      copilot, openCopilot, closeCopilot,
      search, setSearch,
      settings, updateSettings,
      clipSearch, setClipSearch,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
