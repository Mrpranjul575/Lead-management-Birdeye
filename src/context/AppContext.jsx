import { SheetsAdapter } from '../services/sheetsAdapter';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { MOCK_LEADS, MOCK_CADENCES } from '../data/mockData';
import { migrateLead, createActivity, createIntelligence } from '../data/schema';

const AppCtx = createContext(null);
const STORAGE_KEY = 'birdeye_sdr_leads_v4';
const CAD_KEY     = 'birdeye_sdr_cadences';
const SETTINGS_KEY= 'birdeye_sdr_settings';

function loadLeads() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    const raw = s ? JSON.parse(s) : MOCK_LEADS;
    return raw.map(migrateLead);
  } catch { return MOCK_LEADS.map(migrateLead); }
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
    setLeads(ls => ls.map(l => l.id===id ? {...l,...patch} : l));
    setActiveLead(al => al?.id===id ? {...al,...patch} : al);
  }, []);

  const updateLeadMerged = useCallback((id, ...patches) => {
    const merged = Object.assign({}, ...patches);
    updateLead(id, merged);
  }, [updateLead]);

  const addLead = useCallback((lead) => {
    const newLead = migrateLead({
      ...lead,
      id: Date.now(),
      touchLog:   lead.touchLog   || [],
      activity:   lead.activity   || [],
      activities: lead.activities || [],
      memory:     lead.memory     || [],
      followUps:  lead.followUps  || [],
      files:      lead.files      || [],
      seqLog:     lead.seqLog     || {},
    });
    setLeads(ls => [newLead, ...ls]);
    // Push to Google Sheets if configured
    setTimeout(() => {
      const s = loadSettings();
      if (s.sheetsId && s.sheetsToken && s.syncLeads !== false) {
        SheetsAdapter.pushLead(newLead, s).catch(() => {});
      }
    }, 0);
    return newLead;
  }, []);

  // ── Intelligence ──
  const updateIntelligence = useCallback((leadId, patch) => {
    setLeads(ls => ls.map(l => l.id===leadId
      ? { ...l, intelligence: { ...l.intelligence, ...patch, lastUpdated: new Date().toISOString() } }
      : l
    ));
    setActiveLead(al => al?.id===leadId
      ? { ...al, intelligence: { ...al.intelligence, ...patch, lastUpdated: new Date().toISOString() } }
      : al
    );
  }, []);

  // ── Unified Activity Engine ──
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
    // Push activity to Sheets
    setTimeout(() => {
      try {
        const s = loadSettings();
        if (s.sheetsId && s.sheetsToken && s.syncActivities !== false) {
          SheetsAdapter.pushActivity(leadId, '', entry, s).catch(() => {});
        }
      } catch {}
    }, 0);
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

  // ── Cadences ──
  const saveCadence   = useCallback((cad) => {
    if (cad.id) setCadences(cs => cs.map(c => c.id===cad.id?cad:c));
    else setCadences(cs => [...cs, { ...cad, id:Date.now() }]);
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
      updateIntelligence,
      addActivity, addActivityEntry, addMemoryEntry, removeMemoryEntry, addTouchEntry,
      cadences, saveCadence, deleteCadence,
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
