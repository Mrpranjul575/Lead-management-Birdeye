import { SheetsAdapter } from '../services/sheetsAdapter';
import { enrichLead } from '../services/enrichLead';
import { reconcileSheetLeads } from '../utils/reconcileUtils';
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { MOCK_LEADS, MOCK_CADENCES } from '../data/mockData';
import { SEQ_PLAN } from '../constants/cadencePlan';
import { migrateLead, createActivity, createAccountKnowledge, mergeAccountKnowledge, applyScore, CURRENT_SCORE_VERSION, INTELLIGENCE_REJECTED_FIELDS } from '../data/schema';
import { getPendingSteps, isDayComplete, isCadenceComplete, nextCadenceDay, getActivePlan } from '../utils/cadenceUtils';
import {
  applyAKReview,
  confirmAllPending,
  applyConflictResolution,
  applySupersede,
  applyReverify,
} from '../utils/accountKnowledgeMutations';

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

// ── _fieldLabel — module-level helper (Phase 10D) ────────────────────────────
// Human-readable AK field name for Knowledge Update activity summaries.
// Mirrors the same function in timelineUtils.js — kept here to avoid a
// cross-module import from AppContext into a utils file.
function _fieldLabel(field) {
  const LABELS = {
    competitors:         'Competitor',
    decisionMakers:      'Decision Maker',
    currentTools:        'Tool',
    businessGoals:       'Business Goal',
    recurringObjections: 'Objection',
    budget:              'Budget',
    purchaseTimeline:    'Timeline',
  };
  return LABELS[field] || 'Fact';
}

// ── _scoreTriggerLabel — Phase 11 ─────────────────────────────────────────────
// Produces a short human-readable string for scoreHistory.trigger from an
// intelligence patch object. Used so score history entries are self-describing.
function _scoreTriggerLabel(patch) {
  const keys = Object.keys(patch).filter(k => k !== 'lastUpdated' && k !== 'geminiEnrichedAt' && k !== 'scoreHistory');
  if (keys.length === 0) return 'Intelligence updated';
  const FIELD_LABELS = {
    buyingSignals:  'Buying Signals updated',
    objections:     'Objections updated',
    painPoints:     'Pain Points updated',
    leadTemperature:'Lead Temperature set',
    summary:        'Summary updated',
    nextBestAction: 'Next Best Action set',
    geminiEnrichedAt: 'Gemini enrichment',
  };
  if (keys.length === 1) return FIELD_LABELS[keys[0]] || `${keys[0]} updated`;
  if (keys.includes('buyingSignals') || keys.includes('objections')) {
    return 'Gemini enrichment — signals updated';
  }
  return 'Intelligence updated';
}

export function AppProvider({ children }) {
  const [theme,        setTheme]        = useState('dark');
  const [view,         setView]         = useState('workqueue');
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [leads,        setLeads]        = useState(loadLeads);
  const [cadences,     setCadences]     = useState(loadCadences);
  const [activeLeadId, setActiveLeadId] = useState(null); // P1-A: single source of truth
  const [selected,     setSelected]     = useState(new Set());
  const [copilot,      setCopilot]      = useState({ open:false, mode:null, lead:null, step:null });
  const [search,       setSearch]       = useState('');
  const [settings,     setSettings]     = useState(loadSettings);
  const [clipSearch,   setClipSearch]   = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [lastSynced,   setLastSynced]   = useState(null);

  // P1-A: activeLead is derived — leads array is the single source of truth.
  // Any mutation to leads[] is immediately reflected here without dual-writes.
  const activeLead = useMemo(
    () => leads.find(l => l.id === activeLeadId) ?? null,
    [leads, activeLeadId]
  );

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
      const lead = ls.find(l => l.id === id);
      // If stage is changing, fire Sheets status sync before returning new array
      if (patch.stage) {
        if (lead?.email) {
          SheetsAdapter.updateStatus(lead.email, patch.stage).catch(() => {});
        }
      }
      return ls.map(l => {
        if (l.id !== id) return l;
        const updated   = applyScore({ ...l, ...patch });
        // Phase 11: record score history snapshot when aiScore moves.
        // Same ordering/retention/dedup rules as updateIntelligence — see that
        // function for the full comment. scoreLastCalculatedAt is always written
        // here (whether score moves or not) so provenance is available on stage
        // changes even when the resulting score is the same number.
        const now      = new Date().toISOString();
        const intelBase = { ...(updated.intelligence || {}), scoreLastCalculatedAt: now };
        if (updated.aiScore !== (l.aiScore ?? 0)) {
          const trigger  = patch.stage ? `Stage → ${patch.stage}` : 'Lead fields updated';
          const snapshot = { aiScore: updated.aiScore, timestamp: now, trigger };
          const history  = [snapshot, ...(intelBase.scoreHistory || [])].slice(0, 50);
          return { ...updated, intelligence: { ...intelBase, scoreHistory: history } };
        }
        return { ...updated, intelligence: intelBase };
      });
    });
    // Phase 10D: log a Status Change activity when stage is updated.
    // Fires after setLeads so the activity is appended to the already-updated lead.
    // previousStage is read from current leads snapshot before the patch is applied.
    if (patch.stage) {
      setLeads(ls => {
        const lead = ls.find(l => l.id === id);
        const previousStage = lead?.stage || null;
        if (previousStage === patch.stage) return ls; // no-op if stage unchanged
        const entry = createActivity('Status Change', `Stage changed: ${previousStage || 'New'} → ${patch.stage}`, {
          previousStage,
          newStage: patch.stage,
          source:   'sdr_manual',
        });
        return ls.map(l => l.id === id
          ? { ...l, activities: [entry, ...(l.activities || [])] }
          : l
        );
      });
    }
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
    // Push to Google Sheets Web App.
    // Phase 8D-1: skip pushLead() for leads that originate FROM the sheet.
    // tags: ['Sheets'] is set by syncFromSheets() and BulkCSV sheet import.
    // Pushing these back would create the syncFromSheets → addLead → pushLead
    // feedback loop that generates duplicate rows on every sync cycle.
    const isSheetOrigin = Array.isArray(newLead.tags) && newLead.tags.includes('Sheets');
    if (!isSheetOrigin) {
      setTimeout(() => {
        SheetsAdapter.pushLead(newLead).catch(() => {});
      }, 0);
    }
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
      const now     = new Date().toISOString();
      const updated = applyScore({ ...l, intelligence: { ...l.intelligence, ...safePatch, lastUpdated: now } });

      // Phase 11 — Score history rules:
      //   ORDERING  : newest-first (prepend). scoreHistory[0] is always the most
      //               recent snapshot. ScoreHistoryPanel reads this order directly.
      //   RETENTION : capped at 50 entries (slice). Oldest entries are dropped
      //               silently — this is analytical history, not a legal audit log.
      //   DEDUP     : guarded by `updated.aiScore !== prevScore`. A patch that
      //               does not move the score produces no snapshot. This guarantees
      //               a single enrichSingleLead() call → single setLeads pass →
      //               at most one snapshot, regardless of how many fields the patch
      //               contains. The two-pass pattern in updateLead (score pass +
      //               activity pass) cannot double-fire because the second pass
      //               only prepends to activities[] and never touches intelligence.
      //   PROVENANCE: scoreLastCalculatedAt is set to `now` on every snapshot,
      //               whether or not the score moved. This allows the Score
      //               Explainer tab to always show "Score last recalculated X ago"
      //               even for leads whose score is stable across enrichments.
      //               It mirrors the geminiEnrichedAt pattern from Phase 10C.
      const prevScore = l.aiScore ?? 0;
      const intelWithProvenance = {
        ...updated.intelligence,
        scoreLastCalculatedAt: now,
      };
      if (updated.aiScore !== prevScore) {
        const trigger  = _scoreTriggerLabel(safePatch);
        const snapshot = { aiScore: updated.aiScore, timestamp: now, trigger };
        const history  = [snapshot, ...(intelWithProvenance.scoreHistory || [])].slice(0, 50);
        return { ...updated, intelligence: { ...intelWithProvenance, scoreHistory: history } };
      }
      return { ...updated, intelligence: intelWithProvenance };
    }));
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
  }, []);

  // ── Account Knowledge review actions — Phase 7C-2B ──────────────────────
  // Pure mutation helpers (applyAKReview, confirmAllPending, applyConflictResolution,
  // applySupersede, applyReverify) now live in utils/accountKnowledgeMutations.js.
  // AppContext is the orchestration layer only — it decides which lead to update
  // and when to persist; it does not implement the mutation logic itself.

  const confirmAccountKnowledgeFact = useCallback((leadId, field, identityKey, updatedValues = {}) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyAKReview(l.accountKnowledge, field, identityKey, 'confirmed', updatedValues) };
    }));
    // Phase 10D: log a Knowledge Update activity for the approval event.
    // identityKey is the display name for array fields (e.g. competitor name).
    addActivity(leadId, 'Knowledge Update', `${_fieldLabel(field)} Approved: ${identityKey || field}`, {
      action:    'approved',
      field,
      identityKey,
      source:    'sdr_manual',
    });
  }, [addActivity]);

  const dismissAccountKnowledgeFact = useCallback((leadId, field, identityKey) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyAKReview(l.accountKnowledge, field, identityKey, 'dismissed') };
    }));
    // Phase 10D: log a Knowledge Update activity for the rejection event.
    addActivity(leadId, 'Knowledge Update', `${_fieldLabel(field)} Rejected: ${identityKey || field}`, {
      action:    'rejected',
      field,
      identityKey,
      source:    'sdr_manual',
    });
  }, [addActivity]);

  const bulkConfirmAccountKnowledge = useCallback((leadId) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: confirmAllPending(l.accountKnowledge) };
    }));
  }, []);

  const resolveConflict = useCallback((leadId, field, identityKey, resolution) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyConflictResolution(l.accountKnowledge, field, identityKey, resolution) };
    }));
  }, []);

  const keepExistingFact = useCallback((leadId, field, identityKey) => {
    resolveConflict(leadId, field, identityKey, 'keep');
  }, [resolveConflict]);

  const supersedeFact = useCallback((leadId, field, oldKey, newItem) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applySupersede(l.accountKnowledge, field, oldKey, newItem) };
    }));
  }, []);

  const reverifyAccountKnowledgeFact = useCallback((leadId, field, identityKey) => {
    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return { ...l, accountKnowledge: applyReverify(l.accountKnowledge, field, identityKey) };
    }));
  }, []);

  const addActivity = useCallback((leadId, type, summary, details = {}) => {
    const entry = createActivity(type, summary, details);
    setLeads(ls => ls.map(l => l.id===leadId
      ? { ...l, activities: [entry, ...(l.activities||[])] }
      : l
    ));
    return entry;
  }, []);

  // ── Memory ──
  const addMemoryEntry = useCallback((leadId, entry) => {
    const mem = { ...entry, id: Date.now() };
    setLeads(ls => ls.map(l => l.id===leadId ? { ...l, memory: [mem, ...(l.memory||[])] } : l));
  }, []);
  const removeMemoryEntry = useCallback((leadId, memId) => {
    setLeads(ls => ls.map(l => l.id===leadId ? { ...l, memory:(l.memory||[]).filter(m=>m.id!==memId) } : l));
  }, []);

  // ── Legacy helpers (backwards compat) ──
  const addActivityEntry = useCallback((leadId, text) => {
    addActivity(leadId, 'Note', text, { content: text, source:'system' });
  }, [addActivity]);

  const addTouchEntry = useCallback((leadId, touch) => {
    // P1-D: dual-write removed. touchLog is no longer grown for new activities.
    // Existing touchLog entries on leads are preserved for backward-compat reads
    // (buildTouchHistory, deriveEngagementLevel, computeAiScore all still read it).
    // All new outreach is recorded exclusively in activities[].
    // Phase 10B-3: return the created entry so callers can access activityId
    // for Account Knowledge provenance (e.g. notes mode intelligence ingestion).
    return addActivity(leadId, touch.type||'Email', `${touch.type||'Email'} sent`, {
      content: touch.content,
      subject: touch.subject,
      outcome: 'Sent',
    });
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
  // P1-A: openLead stores only the id. activeLead is derived via useMemo above.
  const openLead  = useCallback((lead) => setActiveLeadId(lead.id), []);
  const closeLead = useCallback(() => setActiveLeadId(null), []);

  // ── Copilot ──
  // Phase 10B-2: added optional step parameter for cadenceStep launches.
  // All existing call sites omit step — they receive null and are unaffected.
  // CadenceTab passes the actual step object: openCopilot('cadenceStep', lead, step)
  const openCopilot  = useCallback((mode, lead=null, step=null) => {
    setCopilot({ open:true, mode: mode?.toLowerCase()||'email', lead, step });
  }, []);
  const closeCopilot = useCallback(() => setCopilot({ open:false, mode:null, lead:null, step:null }), []);

  // ── Cadence Execution ──
  const markStepComplete = useCallback((leadId, stepKey, cadenceDay) => {
    // Phase 9A-1: use the lead's active plan (cadenceSteps || SEQ_PLAN).
    // Previously this always used SEQ_PLAN, causing custom cadence steps
    // (whose keys are not in SEQ_PLAN) to produce undefined step labels and
    // malformed activity entries.
    const lead = leads.find(l => l.id === leadId);
    const plan = lead ? getActivePlan(lead) : SEQ_PLAN;
    const step = plan.find(s => s.key === stepKey);
    const summary = `${step?.label || stepKey} completed — Day ${cadenceDay}, ${step?.channel || 'Unknown'}`;

    setLeads(ls => ls.map(l => {
      if (l.id !== leadId) return l;
      return applyScore({ ...l, seqLog: { ...l.seqLog, [stepKey]: true }, lastTouch: 'Just now' });
    }));

    addActivity(leadId, 'Cadence Update', summary, {
      source:      'cadence',
      stepKey,
      stepLabel:   step?.label    || stepKey,
      stepChannel: step?.channel  || 'Unknown',
      cadenceDay,
    });

    // Phase 9C-1: check if cadence is now complete after this step.
    // Read the updated seqLog to determine completion status.
    const updatedSeqLog = { ...(lead?.seqLog || {}), [stepKey]: true };
    const updatedLead   = { ...lead, seqLog: updatedSeqLog };
    if (isCadenceComplete(updatedLead)) {
      addActivity(leadId, 'Cadence Update', `Cadence complete: ${lead?.cadenceName || 'Outreach sequence'}`, {
        source: 'cadence',
        cadenceDay: lead?.cadenceDay || cadenceDay,
      });
    }
  }, [leads, addActivity]);

  const advanceCadenceDay = useCallback((leadId) => {
    setLeads(ls => {
      const lead = ls.find(l => l.id === leadId);
      if (!lead || !isDayComplete(lead) || isCadenceComplete(lead)) return ls;

      // Phase 9A-1: use the lead's active plan (cadenceSteps || SEQ_PLAN).
      // Previously always used SEQ_PLAN, producing empty nextSteps and a
      // generic 'Day N' label for leads on custom cadences.
      const plan     = getActivePlan(lead);
      const nextDay  = nextCadenceDay(lead.cadenceDay, plan);
      const nextSteps = plan.filter(s => s.day === nextDay);
      const nextAction = nextSteps.length > 0
        ? `Day ${nextDay}: ${nextSteps[0].label}`
        : `Day ${nextDay}`;

      addActivity(leadId, 'Cadence Update', `Advanced to Day ${nextDay}`, {
        source:      'cadence',
        cadenceDay:  nextDay,
        stepLabel:   nextAction,
        stepChannel: nextSteps[0]?.channel || 'Unknown',
      });

      return ls.map(l => l.id !== leadId ? l : { ...l, cadenceDay: nextDay, nextAction });
    });
  }, [addActivity]);

  // ── Cadences ──
  const saveCadence   = useCallback((cad) => {
    if (cad.id) setCadences(cs => cs.map(c => c.id===cad.id?cad:c));
    else setCadences(cs => [...cs, { ...cad, id:Date.now() }]);
    // Phase 8D-1: cadence definitions no longer pushed to Sheets.
    // Previously this created phantom lead rows (business: 'Cadence: <name>', email: '')
    // in the Fresh Leads / Re-engagement tabs, polluting lead data with cadence templates
    // and causing reconcileSheetLeads to import them as real leads on next sync.
  }, []);
  const deleteCadence = useCallback((id) => setCadences(cs => cs.filter(c=>c.id!==id)), []);

  // ── Settings ──
  const updateSettings = useCallback((patch) => setSettings(s => ({...s,...patch})), []);

  // ── AI Enrichment ──────────────────────────────────────────────────────────
  //
  // enrichSingleLead(leadId)
  //   Calls enrichLead() with the current lead snapshot and settings.
  //   On success: applies intelligence patch via updateIntelligence, logs activity.
  //   Returns true on success, false on failure or missing key.
  //   Never throws — all errors are swallowed inside enrichLead().
  //
  // batchEnrichLeads(leadIds, onProgress?)
  //   Enriches multiple leads sequentially with a 500ms delay between calls
  //   to avoid Gemini rate limits. onProgress(completed, total) fires after each.
  //   Returns { enriched: number, failed: number }.

  const enrichSingleLead = useCallback(async (leadId) => {
    // Snapshot the lead and settings at call time — do not close over stale state
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return false;

    const result = await enrichLead(lead, settings);
    if (!result) return false;

    updateIntelligence(leadId, result);
    // Phase 10D: richer activity details for the Intelligence timeline card.
    // enrichedFields lists the non-empty fields written so the timeline can
    // display "Summary, Pain Points, Buying Signals updated" as a subtitle.
    const enrichedFields = [
      result.summary        ? 'Summary'        : null,
      result.painPoints?.length   ? 'Pain Points'   : null,
      result.buyingSignals?.length ? 'Buying Signals': null,
      result.objections?.length    ? 'Objections'    : null,
      result.leadTemperature ? 'Lead Temperature' : null,
      result.nextBestAction  ? 'Next Best Action' : null,
    ].filter(Boolean);
    addActivity(leadId, 'AI Generation', 'Lead enriched by Gemini', {
      source: 'gemini',
      enrichedFields,
    });
    return true;
  }, [leads, settings, updateIntelligence, addActivity]);

  const batchEnrichLeads = useCallback(async (leadIds, onProgress) => {
    let enriched = 0;
    let failed   = 0;
    const total  = leadIds.length;

    for (const id of leadIds) {
      const ok = await enrichSingleLead(id);
      if (ok) enriched++; else failed++;
      if (typeof onProgress === 'function') onProgress(enriched + failed, total);
      // 500ms delay between calls — avoids Gemini rate limits
      if (enriched + failed < total) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return { enriched, failed };
  }, [enrichSingleLead]);

  // ── Sheets Sync ───────────────────────────────────────────────────────────
  //
  // syncFromSheets()
  //   Fetches all leads from the connected Google Sheets Web App and reconciles
  //   them against the local leads array using the same rules as BulkCSV:
  //     - Matched leads (by email or business): profile fields only, never intel/AK/activities.
  //     - Unmatched leads: addLead() with tags: ['Sheets'].
  //
  //   Guard: if already syncing, returns immediately — no parallel sync.
  //   Guarantees: setSyncing(false) always fires via finally block.
  //   On failure: console.error only — silent for users.
  //   On success: setLastSynced(ISO string).
  //
  // Auto-sync on load:
  //   Runs once on mount when settings.syncLeads === true.
  //   Async fire-and-forget — never blocks app load or render.

  const syncFromSheets = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await SheetsAdapter.readLeads(settings);
      if (!result.ok) {
        console.error('[Sheets Sync] readLeads failed:', result.error);
        return;
      }
      const data = result.data || [];
      // Use setLeads functional update to read latest leads snapshot — avoids stale closure.
      setLeads(currentLeads => {
        const added   = [];
        const updates = [];

        data.forEach(sheetLead => {
          if (!sheetLead) return;
          // Phase 8D-2A: match order — externalId → email → business
          // externalId match requires both sides to be non-empty strings.
          // undefined === undefined must NEVER count as a match.
          const existing = currentLeads.find(l =>
            (l.externalId && sheetLead.externalId &&
              l.externalId === sheetLead.externalId) ||
            (l.email && sheetLead.email &&
              l.email.toLowerCase() === sheetLead.email.toLowerCase()) ||
            (l.business && sheetLead.business &&
              l.business.toLowerCase() === sheetLead.business.toLowerCase())
          );
          if (existing) {
            updates.push({ id: existing.id, sheetLead });
          } else {
            added.push(sheetLead);
          }
        });

        // Apply profile-only updates to matched leads
        let next = currentLeads.map(l => {
          const match = updates.find(u => u.id === l.id);
          if (!match) return l;
          const { sheetLead } = match;
          const now = new Date().toISOString();
          return applyScore({
            ...l,
            business:  sheetLead.business  || l.business,
            email:     sheetLead.email     || l.email,
            phone:     sheetLead.phone     || l.phone,
            city:      sheetLead.city      || l.city,
            stage:     sheetLead.stage     || l.stage,
            reviews:   sheetLead.reviews   || l.reviews,
            updatedAt: now,
            // NEVER touch: intelligence, accountKnowledge, activities, memory,
            //              followUps, touchLog, seqLog, cadenceDay, files, aiScore
          });
        });

        // Prepend new leads
        const now = new Date().toISOString();
        const newLeads = added.map(sheetLead =>
          applyScore(migrateLead({
            ...sheetLead,
            id:         Date.now() + Math.random(),
            tags:       ['Sheets'],
            createdAt:  now,
            touchLog:   [],
            activity:   [],
            activities: [],
            memory:     [],
            followUps:  [],
            files:      [],
            seqLog:     {},
          }))
        );

        return [...newLeads, ...next];
      });

      setLastSynced(new Date().toISOString());
    } catch (e) {
      console.error('[Sheets Sync] Unexpected error:', e);
    } finally {
      setSyncing(false);
    }
  }, [syncing, settings]);

  // Auto-sync on mount — only when settings.syncLeads is true.
  // Async fire-and-forget: never blocks app load or first render.
  useEffect(() => {
    if (settings.syncLeads) {
      // Defer to next tick so the app renders first
      const t = setTimeout(() => { syncFromSheets(); }, 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty deps — mount-only, syncLeads read at call time

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
      enrichSingleLead, batchEnrichLeads,
      clipSearch, setClipSearch,
      syncing, lastSynced, syncFromSheets,
    }}>
      {children}
    </AppCtx.Provider>
  );
}

export const useApp = () => useContext(AppCtx);
