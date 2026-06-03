import { useState, useRef } from 'react';
import Papa from 'papaparse';
import {
  Upload, CheckCircle2, FileText, Zap, Eye, X,
  AlertCircle, Database, Sparkles, RotateCcw
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { STAGES_ALL } from '../constants/stages';
import { SheetsAdapter } from '../services/sheetsAdapter';
import { reconcileSheetLeads } from '../utils/reconcileUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CSV_STEPS = ['Upload', 'Map Columns', 'Processing', 'Summary'];

const LOG_LINES = [
  { text: 'Analyzing business data…',        time: '00:02' },
  { text: 'Extracting contact information…', time: '00:04' },
  { text: 'Calculating AI scores…',          time: '00:06' },
  { text: 'Categorizing intents…',           time: '00:09' },
  { text: 'Enriching competitor data…',      time: '00:12' },
  { text: 'Generating outreach priorities…', time: '00:15' },
];

// Maps to field keys used on the lead object
const FIELD_OPTIONS = [
  { value: '',          label: 'Skip this column'  },
  { value: 'business',  label: 'Business Name'     },
  { value: 'contact',   label: 'Contact Name'      },
  { value: 'email',     label: 'Email'             },
  { value: 'phone',     label: 'Phone'             },
  { value: 'website',   label: 'Website'           },
  { value: 'city',      label: 'City / Location'   },
  { value: 'industry',  label: 'Industry'          },
  { value: 'intent',    label: 'Intent'            },
  { value: 'aiScore',   label: 'AI Score'          },
  { value: 'reviews',   label: 'Reviews'           },
  { value: 'rating',    label: 'Rating'            },
  { value: 'stage',     label: 'Stage'             },
  { value: 'aeNotes',   label: 'Notes'             },
];

// Auto-mapping: normalised CSV header → lead field key
const AUTO_MAP = {
  'business': 'business', 'business name': 'business', 'company': 'business', 'account': 'business',
  'contact': 'contact', 'name': 'contact', 'full name': 'contact', 'contact name': 'contact',
  'email': 'email', 'email address': 'email',
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone',
  'website': 'website', 'url': 'website', 'domain': 'website',
  'city': 'city', 'location': 'city', 'city/state': 'city',
  'industry': 'industry', 'vertical': 'industry', 'sector': 'industry',
  'intent': 'intent', 'signal': 'intent', 'intent signal': 'intent',
  'score': 'aiScore', 'ai score': 'aiScore', 'lead score': 'aiScore',
  'reviews': 'reviews', 'review count': 'reviews',
  'rating': 'rating', 'star rating': 'rating',
  'stage': 'stage', 'status': 'stage', 'lead stage': 'stage',
  'notes': 'aeNotes', 'ae notes': 'aeNotes', 'comments': 'aeNotes',
};

function autoDetectMapping(headers) {
  const result = {};
  headers.forEach(h => {
    result[h] = AUTO_MAP[h.toLowerCase().trim()] || '';
  });
  return result;
}


// ─── Build a lead from a row + mapping ───────────────────────────────────────

function buildLeadFromMapping(row, mapping) {
  const out = {};
  Object.entries(mapping).forEach(([header, field]) => {
    if (!field) return;
    const val = String(row[header] ?? '').trim();
    if (val) out[field] = val;
  });

  // Require at minimum a business name; fall back to contact
  if (!out.business && out.contact) out.business = out.contact;
  if (!out.business) return null;

  const stage = STAGES_ALL.includes(out.stage) ? out.stage : 'New';

  return {
    business:     out.business   || '',
    contact:      out.contact    || out.business || '',
    email:        out.email      || '',
    phone:        out.phone      || '',
    website:      out.website    || '',
    city:         out.city       || '',
    industry:     out.industry   || '',
    intent:       out.intent     || 'AI Visibility',
    aeNotes:      out.aeNotes    || '',
    stage,
    aiScore:      parseFloat(out.aiScore) || 0,
    reviews:      parseInt(out.reviews)   || 0,
    rating:       parseFloat(out.rating)  || 0,
    aiVisibility: 0,
    compGap:      'High',
    nextAction:   'Initial Outreach',
    lastTouch:    'Never',
    cadenceDay:   0,
    cadenceTotal: 7,
    tags:         ['Import'],
    createdAt:    new Date().toISOString(),
    activities:   [],
    memory:       [],
    followUps:    [],
    files:        [],
  };
}


// ─── Main component ───────────────────────────────────────────────────────────

export default function BulkCSV() {
  const { addLead, updateLead, leads, setView, settings, batchEnrichLeads } = useApp();
  const { dark, T1, T2, T3, B1, S1, S2, S3 } = useTheme();
  const fileRef = useRef();

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState('csv'); // 'csv' | 'sheets'

  // ── CSV tab state ──
  const [csvStep,     setCsvStep]     = useState(0); // 0=upload 1=mapping 2=processing 3=summary
  const [file,        setFile]        = useState(null);
  const [csvHeaders,  setCsvHeaders]  = useState([]);   // raw headers from CSV
  const [csvRows,     setCsvRows]     = useState([]);   // raw parsed rows
  const [mapping,     setMapping]     = useState({});   // { header: fieldKey }
  const [dedupe,      setDedupe]      = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [logVisible,  setLogVisible]  = useState([]);
  const [parseError,  setParseError]  = useState('');
  const [dragging,    setDragging]    = useState(false);
  const [csvSummary,  setCsvSummary]  = useState(null); // { imported, skipped, failed, ids }

  // ── Sheets tab state ──
  const [sheetsStatus,  setSheetsStatus]  = useState('idle'); // idle|loading|success|error
  const [sheetsError,   setSheetsError]   = useState('');
  const [sheetsSummary, setSheetsSummary] = useState(null); // { imported, updated, merged, ids }

  // ── Enrichment state (shared) ──
  const [enriching,       setEnriching]       = useState(false);
  const [enrichProgress,  setEnrichProgress]  = useState({ done: 0, total: 0 });
  const [enrichDone,      setEnrichDone]      = useState(false);
  const [enrichCount,     setEnrichCount]     = useState(0);

  const canEnrich = settings?.aiProvider === 'gemini' && !!settings?.geminiKey;

  // ─────────────────────────────────────────────────────────────────────────────
  // CSV HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleFile = (f) => {
    if (!f) return;
    setParseError('');
    setShowPreview(false);
    setLogVisible([]);
    setCsvSummary(null);
    setEnrichDone(false);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length && results.data.length === 0) {
          setParseError(`Could not parse file: ${results.errors[0]?.message || 'Unknown error'}`);
          return;
        }
        if (!results.data.length) {
          setParseError('No rows found in this file.');
          return;
        }
        const headers = Object.keys(results.data[0]);
        setCsvHeaders(headers);
        setCsvRows(results.data);
        setMapping(autoDetectMapping(headers));
        setFile(f);
        setCsvStep(1); // go to mapping step
      },
      error: (err) => { setParseError(`Parse error: ${err.message}`); },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleMappingChange = (header, value) => {
    setMapping(prev => ({ ...prev, [header]: value }));
  };

  const handleRunImport = () => {
    setCsvStep(2);
    setProgress(0);
    setLogVisible([]);

    // Build leads from mapping
    const existingEmails = new Set(leads.map(l => (l.email || '').toLowerCase()).filter(Boolean));
    const importedIds = [];
    let imported = 0, skipped = 0, failed = 0;

    const leadsToImport = [];
    csvRows.forEach(row => {
      const built = buildLeadFromMapping(row, mapping);
      if (!built) { failed++; return; }
      if (dedupe && built.email && existingEmails.has(built.email.toLowerCase())) {
        skipped++;
        return;
      }
      leadsToImport.push(built);
    });

    // Animate progress, then save all at completion
    let p = 0;
    let logIdx = 0;
    const interval = setInterval(() => {
      p += Math.random() * 4 + 1;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        // Commit all leads at once when animation finishes
        leadsToImport.forEach(lead => {
          const saved = addLead(lead);
          importedIds.push(saved?.id);
          imported++;
        });
        setCsvSummary({ imported, skipped, failed, ids: importedIds.filter(Boolean) });
        setCsvStep(3);
      }
      setProgress(Math.floor(p));

      const newIdx = Math.floor((p / 100) * LOG_LINES.length);
      if (newIdx > logIdx) {
        setLogVisible(prev => [...prev, ...LOG_LINES.slice(logIdx, newIdx)]);
        logIdx = newIdx;
      }
    }, 180);
  };

  const handleCsvReset = () => {
    setCsvStep(0); setFile(null); setCsvHeaders([]); setCsvRows([]);
    setMapping({}); setProgress(0); setLogVisible([]); setParseError('');
    setCsvSummary(null); setShowPreview(false); setEnrichDone(false); setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
  };

  const previewRows = csvRows.slice(0, 3);


  // ─────────────────────────────────────────────────────────────────────────────
  // SHEETS HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleSheetsImport = async () => {
    setSheetsStatus('loading');
    setSheetsError('');
    setSheetsSummary(null);
    setEnrichDone(false);

    const result = await SheetsAdapter.readLeads(settings);
    if (!result.ok) {
      setSheetsError(result.error || 'Unknown error');
      setSheetsStatus('error');
      return;
    }

    const data = result.data || [];
    const summary = reconcileSheetLeads(data, leads, addLead, updateLead);
    setSheetsSummary({ ...summary, ids: [] }); // ids not tracked for sheets import
    setSheetsStatus('success');
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // ENRICHMENT HANDLER (shared)
  // ─────────────────────────────────────────────────────────────────────────────

  const handleEnrich = async (ids) => {
    if (!ids?.length) return;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: ids.length });
    const result = await batchEnrichLeads(ids, (done, total) => {
      setEnrichProgress({ done, total });
    });
    setEnrichCount(result?.enriched || 0);
    setEnriching(false);
    setEnrichDone(true);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED STYLE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  const card = {
    background: S1, border: `1px solid ${B1}`, borderRadius: 14, padding: '24px',
  };

  const btn = (color = '#5B3FC8') => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
    borderRadius: 8, border: 'none', background: color, color: '#fff',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: `0 4px 12px ${color}50`, transition: 'opacity 0.15s',
  });

  const ghostBtn = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
    borderRadius: 8, border: `1px solid ${B1}`, background: 'transparent',
    color: T2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.15s',
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // ENRICHMENT CARD (reused in both tabs)
  // ─────────────────────────────────────────────────────────────────────────────

  const EnrichCard = ({ ids }) => {
    if (!canEnrich || !ids?.length) return null;
    return (
      <div style={{ background: dark ? 'rgba(91,63,200,0.07)' : 'rgba(91,63,200,0.04)', border: '1px solid rgba(91,63,200,0.25)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Sparkles size={16} color="#7C5CE8" />
          <span style={{ fontSize: 13, fontWeight: 700, color: T1 }}>Enrich imported leads with AI?</span>
        </div>
        <p style={{ fontSize: 12, color: T2, margin: '0 0 14px', lineHeight: 1.6 }}>
          Gemini will generate intelligence for each lead — pain points, buying signals, temperature and recommended next action.
        </p>

        {enriching && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T2 }}>Enriching {enrichProgress.done} / {enrichProgress.total}…</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7C5CE8', fontFamily: 'JetBrains Mono,monospace' }}>
                {enrichProgress.total > 0 ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0}%
              </span>
            </div>
            <div style={{ height: 5, background: S3, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: 5, borderRadius: 99, background: 'linear-gradient(90deg,#5B3FC8,#7C5CE8)',
                width: `${enrichProgress.total > 0 ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}

        {enrichDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontSize: 12, fontWeight: 600 }}>
            <CheckCircle2 size={14} /> ✓ {enrichCount} lead{enrichCount !== 1 ? 's' : ''} enriched
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={enriching}
              onClick={() => handleEnrich(ids)}
              style={{ ...btn(), opacity: enriching ? 0.5 : 1, cursor: enriching ? 'not-allowed' : 'pointer' }}>
              <Sparkles size={13} /> Enrich {ids.length} Lead{ids.length !== 1 ? 's' : ''}
            </button>
            <button
              disabled={enriching}
              onClick={() => setEnrichDone(true)}
              style={{ ...ghostBtn, opacity: enriching ? 0.4 : 1 }}>
              Skip enrichment
            </button>
          </div>
        )}
      </div>
    );
  };


  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="fade-up" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: T1, margin: 0 }}>Bulk Import</h1>
        <p style={{ fontSize: 12, color: T2, marginTop: 4 }}>
          Import leads from a CSV file or sync from your connected Google Sheet
        </p>
      </div>

      {/* ── Pill Tabs ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: S2, borderRadius: 10, padding: 4, width: 'fit-content', border: `1px solid ${B1}` }}>
        {[
          { id: 'csv',    label: 'CSV Upload'         },
          { id: 'sheets', label: 'Import from Sheets' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? '#5B3FC8' : 'transparent',
            color:      activeTab === tab.id ? '#fff' : T2,
            fontSize: 12, fontWeight: activeTab === tab.id ? 600 : 400,
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════
          TAB 1: CSV UPLOAD
      ════════════════════════════════════════════════ */}
      {activeTab === 'csv' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── Step progress bar ── */}
          <div style={{ ...card, paddingBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
              {CSV_STEPS.map((s, i) => {
                const done    = i < csvStep;
                const current = i === csvStep;
                return (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', border: '2px solid',
                        borderColor: done ? '#10B981' : current ? '#5B3FC8' : B1,
                        background:  done ? '#10B981' : current ? 'rgba(91,63,200,0.15)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        color: done ? '#fff' : current ? '#7C5CE8' : T2,
                        transition: 'all 0.3s',
                        boxShadow: current ? '0 0 12px rgba(91,63,200,0.4)' : 'none',
                      }}>
                        {done ? <CheckCircle2 size={14} color="#fff" /> : i + 1}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: current || done ? 600 : 400, color: done ? '#10B981' : current ? '#7C5CE8' : T2, whiteSpace: 'nowrap' }}>{s}</span>
                    </div>
                    {i < CSV_STEPS.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: i < csvStep ? '#10B981' : B1, borderRadius: 99, margin: '0 4px', marginBottom: 20, transition: 'background 0.3s' }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Parse error */}
            {parseError && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14 }}>
                <AlertCircle size={14} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#F87171', marginBottom: 2 }}>Could not parse file</div>
                  <div style={{ fontSize: 11, color: T2 }}>{parseError}</div>
                </div>
              </div>
            )}

            {/* ── Step 0: Drop zone ── */}
            {csvStep === 0 && (
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#5B3FC8' : B1}`,
                  borderRadius: 12, padding: '40px 24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: dragging ? 'rgba(91,63,200,0.06)' : S2,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#5B3FC8'; e.currentTarget.style.background = 'rgba(91,63,200,0.04)'; }}
                onMouseLeave={e => { if (!dragging) { e.currentTarget.style.borderColor = B1; e.currentTarget.style.background = S2; } }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(91,63,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload size={22} color="#7C5CE8" />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T1, marginBottom: 4 }}>Drop your CSV here</div>
                  <div style={{ fontSize: 12, color: T2 }}>or click to browse — supports .csv, .xlsx, .txt</div>
                </div>
                <div style={{ fontSize: 11, color: T2, background: S3, padding: '4px 12px', borderRadius: 99, marginTop: 4 }}>
                  Headers auto-detected — you'll map them in the next step
                </div>
              </div>
            )}


            {/* ── Step 1: Column mapping ── */}
            {csvStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 4 }}>Map your columns</div>
                  <div style={{ fontSize: 12, color: T2 }}>
                    Tell us which column maps to which field. Unrecognised columns are skipped.
                  </div>
                </div>

                {/* Mapping table */}
                <div style={{ border: `1px solid ${B1}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '8px 14px', background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${B1}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Column</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maps To</div>
                  </div>
                  {csvHeaders.map(header => (
                    <div key={header} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '9px 14px', borderBottom: `1px solid ${dark ? '#21262D' : '#F3F4F5'}`, alignItems: 'center' }}>
                      <div style={{ fontSize: 12, color: T1, fontFamily: 'JetBrains Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                        {header}
                      </div>
                      <select
                        value={mapping[header] || ''}
                        onChange={e => handleMappingChange(header, e.target.value)}
                        style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${mapping[header] ? 'rgba(91,63,200,0.4)' : B1}`, background: mapping[header] ? 'rgba(91,63,200,0.06)' : S2, color: mapping[header] ? '#7C5CE8' : T2, fontSize: 11, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        {FIELD_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Dedupe toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, background: S2, border: `1px solid ${B1}` }}>
                  <input
                    id="dedupe-toggle"
                    type="checkbox"
                    checked={dedupe}
                    onChange={e => setDedupe(e.target.checked)}
                    style={{ width: 14, height: 14, accentColor: '#5B3FC8', cursor: 'pointer' }}
                  />
                  <label htmlFor="dedupe-toggle" style={{ fontSize: 12, color: T1, cursor: 'pointer', userSelect: 'none' }}>
                    Skip duplicate emails (leads with matching email won't be imported again)
                  </label>
                </div>

                {/* Preview rows */}
                {showPreview && (
                  <div style={{ border: `1px solid ${B1}`, borderRadius: 10, overflow: 'auto' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T2, padding: '8px 14px', borderBottom: `1px solid ${B1}`, background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)' }}>
                      Preview — first {previewRows.length} rows with mapping applied
                    </div>
                    {previewRows.map((row, ri) => {
                      const built = buildLeadFromMapping(row, mapping);
                      return (
                        <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, padding: '8px 14px', borderBottom: ri < previewRows.length - 1 ? `1px solid ${dark ? '#21262D' : '#F3F4F5'}` : 'none', fontSize: 11 }}>
                          <div style={{ color: built ? T1 : '#F87171', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{built?.business || '⚠ No business'}</div>
                          <div style={{ color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{built?.email || '—'}</div>
                          <div style={{ color: T2 }}>{built?.city || '—'}</div>
                          <div style={{ color: T2 }}>{built?.industry || '—'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowPreview(p => !p)} style={ghostBtn}
                    onMouseEnter={e => { e.currentTarget.style.color = T1; e.currentTarget.style.borderColor = B1; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T2; }}>
                    <Eye size={13} /> {showPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                  <button onClick={handleRunImport} style={btn()}>
                    <Zap size={13} /> Continue to Import ({csvRows.length} rows)
                  </button>
                  <button onClick={handleCsvReset} style={ghostBtn}>
                    <X size={13} /> Start over
                  </button>
                </div>
              </div>
            )}


            {/* ── Step 2: Processing animation ── */}
            {csvStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* File pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${B1}`, background: S2 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(91,63,200,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={16} color="#7C5CE8" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T1 }}>{file?.name}</div>
                    <div style={{ fontSize: 11, color: T2, marginTop: 1 }}>{csvRows.length} rows detected</div>
                  </div>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(91,63,200,0.3)', borderTopColor: '#7C5CE8', animation: 'spin 0.8s linear infinite' }} />
                </div>
                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: T2 }}>Processing leads…</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#7C5CE8', fontFamily: 'JetBrains Mono,monospace' }}>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: S3, borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: 6, width: `${progress}%`, borderRadius: 99, background: 'linear-gradient(90deg,#5B3FC8,#4edea3)', transition: 'width 0.2s ease', boxShadow: '0 0 10px rgba(91,63,200,0.4)' }} />
                  </div>
                </div>
                {/* Live log */}
                <div style={{ background: S2, border: `1px solid ${B1}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Processing Log</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {logVisible.map((line, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckCircle2 size={12} color="#10B981" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: T1, flex: 1 }}>{line.text}</span>
                        <span style={{ fontSize: 10, color: T2, fontFamily: 'JetBrains Mono,monospace' }}>{line.time}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(91,63,200,0.3)', borderTopColor: '#7C5CE8', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: T2 }}>Processing…</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>{/* end card */}

          {/* ── Step 3: Summary ── */}
          {csvStep === 3 && csvSummary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 16 }}>Import Complete</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Imported',  value: csvSummary.imported, color: '#10B981', icon: '✓' },
                    { label: 'Skipped',   value: csvSummary.skipped,  color: '#F59E0B', icon: '⊘' },
                    { label: 'Failed',    value: csvSummary.failed,   color: '#F87171', icon: '✗' },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} style={{ background: S2, border: `1px solid ${B1}`, borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'JetBrains Mono,monospace', lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: 11, color: T2, marginTop: 5 }}>{icon} {label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setView('leads')} style={btn()}>View Leads</button>
                  <button onClick={handleCsvReset} style={ghostBtn}><RotateCcw size={13} /> Import More</button>
                </div>
              </div>

              {/* Enrichment offer */}
              {csvSummary.ids.length > 0 && !enrichDone && (
                <EnrichCard ids={csvSummary.ids} />
              )}
              {enrichDone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10B981', fontSize: 12, fontWeight: 600 }}>
                  <CheckCircle2 size={14} /> ✓ {enrichCount} lead{enrichCount !== 1 ? 's' : ''} enriched
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* ════════════════════════════════════════════════
          TAB 2: IMPORT FROM SHEETS
      ════════════════════════════════════════════════ */}
      {activeTab === 'sheets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* IDLE */}
          {sheetsStatus === 'idle' && (
            <div style={{ ...card }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(91,63,200,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Database size={22} color="#7C5CE8" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T1, marginBottom: 6 }}>Import from Google Sheets</div>
                  <p style={{ fontSize: 12, color: T2, margin: '0 0 12px', lineHeight: 1.7 }}>
                    Pull your leads directly from your connected Google Sheet.
                    New leads will be added. Existing leads will have their profile fields updated.
                    Intelligence, activities, and memory are never overwritten.
                  </p>

                  {/* Sheet status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: S2, border: `1px solid ${B1}`, marginBottom: 16, width: 'fit-content' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: settings?.sheetsId ? '#10B981' : T3, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: settings?.sheetsId ? T1 : T2 }}>
                      {settings?.sheetsId
                        ? `Sheet: …${settings.sheetsId.slice(-12)}`
                        : 'No sheet connected'}
                    </span>
                  </div>

                  {!settings?.sheetsId ? (
                    <div>
                      <p style={{ fontSize: 12, color: '#F59E0B', margin: '0 0 12px' }}>
                        ⚠ Configure Google Sheets in Settings first.
                      </p>
                      <button onClick={() => setView('settings')} style={ghostBtn}>
                        <Database size={13} /> Go to Settings
                      </button>
                    </div>
                  ) : (
                    <button onClick={handleSheetsImport} style={btn()}>
                      <Database size={13} /> Pull from Sheets
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LOADING */}
          {sheetsStatus === 'loading' && (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(91,63,200,0.3)', borderTopColor: '#7C5CE8', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T2 }}>Pulling leads from Google Sheets…</span>
            </div>
          )}

          {/* SUCCESS */}
          {sheetsStatus === 'success' && sheetsSummary && (
            <>
              <div style={{ ...card }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T1, marginBottom: 16 }}>Sheets Sync Complete</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'New Leads',  value: sheetsSummary.imported, color: '#10B981', icon: '✓' },
                    { label: 'Updated',    value: sheetsSummary.updated,  color: '#7C5CE8', icon: '↻' },
                    { label: 'Merged',     value: sheetsSummary.merged,   color: '#F59E0B', icon: '⊘' },
                  ].map(({ label, value, color, icon }) => (
                    <div key={label} style={{ background: S2, border: `1px solid ${B1}`, borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'JetBrains Mono,monospace', lineHeight: 1 }}>{value}</div>
                      <div style={{ fontSize: 11, color: T2, marginTop: 5 }}>{icon} {label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setView('leads')} style={btn()}>View Leads</button>
                  <button onClick={() => { setSheetsStatus('idle'); setSheetsSummary(null); setEnrichDone(false); }} style={ghostBtn}>
                    <RotateCcw size={13} /> Sync Again
                  </button>
                </div>
              </div>
              <EnrichCard ids={[]} />
            </>
          )}

          {/* ERROR */}
          {sheetsStatus === 'error' && (
            <div style={{ ...card, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertCircle size={16} color="#F87171" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#F87171' }}>Could not connect to Google Sheets</span>
              </div>
              <p style={{ fontSize: 12, color: T2, margin: '0 0 16px', lineHeight: 1.6 }}>{sheetsError}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSheetsImport} style={btn()}>Try Again</button>
                <button onClick={() => setView('settings')} style={ghostBtn}>Check Settings</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" style={{ display: 'none' }}
        onChange={e => handleFile(e.target.files?.[0])} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
