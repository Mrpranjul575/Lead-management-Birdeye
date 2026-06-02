import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, CheckCircle2, FileText, Zap, Eye, X, ChevronRight, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { STAGES_ALL } from '../constants/stages';

const STEPS = ['Upload', 'Enrich', 'Categorize', 'Score', 'Save'];

const LOG_LINES = [
  { text:'Analyzing business data…',          time:'00:02' },
  { text:'Extracting contact information…',   time:'00:04' },
  { text:'Calculating AI scores…',            time:'00:06' },
  { text:'Categorizing intents…',             time:'00:09' },
  { text:'Enriching competitor data…',        time:'00:12' },
  { text:'Generating outreach priorities…',   time:'00:15' },
];

// ── Column name → lead field mapping (case-insensitive) ──────────────────────
const COLUMN_MAP = [
  { field:'business',   aliases:['business','company','name','business name','company name'] },
  { field:'email',      aliases:['email','email address','e-mail'] },
  { field:'phone',      aliases:['phone','phone number','tel','telephone','mobile'] },
  { field:'website',    aliases:['website','url','web','site','domain'] },
  { field:'city',       aliases:['city','location','address','region','area'] },
  { field:'industry',   aliases:['industry','vertical','sector','category'] },
  { field:'intent',     aliases:['intent','interest','goal','objective'] },
  { field:'keyword',    aliases:['keyword','kw','search term','target keyword'] },
  { field:'competitor', aliases:['competitor','competition','rival'] },
  { field:'stage',      aliases:['stage','status','pipeline stage'] },
  { field:'reviews',    aliases:['reviews','review count','review_count','num reviews','ratings count'] },
  { field:'rating',     aliases:['rating','stars','avg rating','average rating','star rating'] },
  { field:'contact',    aliases:['contact','contact name','contact person','owner','manager'] },
];

// Build a lookup from lowercased alias → field name
const ALIAS_LOOKUP = {};
COLUMN_MAP.forEach(({ field, aliases }) => {
  aliases.forEach(a => { ALIAS_LOOKUP[a.toLowerCase()] = field; });
});

// Map a single parsed PapaParse row object to a lead field object
function mapRow(row) {
  const out = {};
  Object.entries(row).forEach(([col, val]) => {
    const mapped = ALIAS_LOOKUP[col.toLowerCase().trim()];
    if (mapped) out[mapped] = String(val ?? '').trim();
  });
  return out;
}

// Validate that a mapped row has at minimum a business name
function isUsable(mapped) {
  return !!(mapped.business && mapped.business.length > 0);
}

// Build a full lead object from a mapped row
function buildLead(mapped) {
  const stage = STAGES_ALL.includes(mapped.stage) ? mapped.stage : 'New';

  return {
    business:    mapped.business   || '',
    contact:     mapped.contact    || mapped.business || '',
    email:       mapped.email      || '',
    phone:       mapped.phone      || '',
    website:     mapped.website    || '',
    city:        mapped.city       || '',
    industry:    mapped.industry   || '',
    intent:      mapped.intent     || 'AI Visibility',
    keyword:     mapped.keyword    || '',
    competitor:  mapped.competitor || '',
    stage,
    aiScore:     0,           // computed by applyScore in addLead
    reviews:     parseInt(mapped.reviews) || 0,
    rating:      parseFloat(mapped.rating) || 0,
    aiVisibility: 0,
    compGap:     'High',
    nextAction:  'Initial Outreach',
    lastTouch:   'Never',
    cadenceDay:  0,
    cadenceTotal:7,
    tags:        ['Imported'],
    aeNotes:     '',
    activities:  [],
    memory:      [],
    followUps:   [],
    files:       [],
  };
}

export default function BulkCSV() {
  const { addLead, setView } = useApp();
  const { dark, T1, T2, B1, S1, S2, S3 } = useTheme();
  const fileRef = useRef();

  const [file,        setFile]        = useState(null);
  const [step,        setStep]        = useState(0);   // 0=idle, 1=uploading, 2=enriching, 3=done
  const [progress,    setProgress]    = useState(0);
  const [logVisible,  setLogVisible]  = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [dragging,    setDragging]    = useState(false);
  const [parsedLeads, setParsedLeads] = useState([]);   // all mapped leads from CSV
  const [parseError,  setParseError]  = useState('');  // user-visible parse error

  const handleFile = (f) => {
    if (!f) return;
    setParseError('');
    setSaved(false);
    setShowPreview(false);
    setLogVisible([]);

    // Parse with PapaParse first, then start the progress animation
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length && results.data.length === 0) {
          setParseError(`Could not parse file: ${results.errors[0]?.message || 'Unknown error'}`);
          return;
        }

        const mapped = results.data
          .map(mapRow)
          .filter(isUsable)
          .map(buildLead);

        if (mapped.length === 0) {
          setParseError('No usable rows found. Make sure the CSV has a "Business" or "Company" column.');
          return;
        }

        setParsedLeads(mapped);
        setFile(f);
        setStep(1);
        setProgress(0);

        // Animate progress bar after parse succeeds
        let p = 0;
        let logIdx = 0;
        const interval = setInterval(() => {
          p += Math.random() * 4 + 1;
          if (p >= 100) { p = 100; clearInterval(interval); setStep(3); }
          setProgress(Math.floor(p));
          setStep(p < 100 ? 2 : 3);

          const newIdx = Math.floor((p / 100) * LOG_LINES.length);
          if (newIdx > logIdx) {
            setLogVisible(prev => [...prev, ...LOG_LINES.slice(logIdx, newIdx)]);
            logIdx = newIdx;
          }
        }, 180);
      },
      error: (err) => {
        setParseError(`Parse error: ${err.message}`);
      },
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSaveAll = () => {
    parsedLeads.forEach(lead => addLead(lead));
    setSaved(true);
    setTimeout(() => setView('workqueue'), 1200);
  };

  const handleReset = () => {
    setStep(0);
    setFile(null);
    setLogVisible([]);
    setProgress(0);
    setParsedLeads([]);
    setParseError('');
    setSaved(false);
    setShowPreview(false);
  };

  // Derived stats from real data
  const totalRows  = parsedLeads.length;
  const enriched   = step === 3 ? totalRows : Math.floor((progress / 100) * totalRows);
  const processing = step === 3 ? 0          : Math.max(0, totalRows - enriched);
  const completed  = Math.floor(progress);

  // Show first 10 rows in preview
  const previewRows = parsedLeads.slice(0, 10);

  // Step indicator position
  const currentStep = step === 0 ? -1 : step === 1 ? 0 : step === 2 ? 1 : 4;

  return (
    <div className="fade-up" style={{ maxWidth:860 }}>

      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>Bulk CSV Processing</h1>
        <p style={{ fontSize:12, color:T2, marginTop:4 }}>Upload a CSV file to add multiple leads at once</p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* Upload card */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'24px' }}>

          {/* Step progress bar */}
          <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:20 }}>
            {STEPS.map((s, i) => {
              const done    = i < currentStep;
              const current = i === currentStep;
              return (
                <div key={s} style={{ display:'flex', alignItems:'center', flex:1 }}>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, flex:1 }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%', border:`2px solid`,
                      borderColor: done?'#10B981':current?'#5B3FC8':B1,
                      background: done?'#10B981':current?'rgba(91,63,200,0.15)':'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:11, fontWeight:700,
                      color: done?'#fff':current?'#7C5CE8':T2,
                      transition:'all 0.3s',
                      boxShadow: current?'0 0 12px rgba(91,63,200,0.4)':'none',
                    }}>
                      {done ? <CheckCircle2 size={14} color="#fff"/> : i+1}
                    </div>
                    <span style={{ fontSize:10, fontWeight:current||done?600:400, color:done?'#10B981':current?'#7C5CE8':T2, whiteSpace:'nowrap' }}>{s}</span>
                  </div>
                  {i < STEPS.length-1 && (
                    <div style={{ flex:1, height:2, background:i<currentStep?'#10B981':B1, borderRadius:99, margin:'0 4px', marginBottom:20, transition:'background 0.3s' }}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Parse error banner */}
          {parseError && (
            <div style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'10px 14px', borderRadius:9, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', marginBottom:14 }}>
              <AlertCircle size={14} color="#F87171" style={{ flexShrink:0, marginTop:1 }}/>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#F87171', marginBottom:2 }}>Could not parse file</div>
                <div style={{ fontSize:11, color:T2 }}>{parseError}</div>
              </div>
            </div>
          )}

          {/* Drop zone — shown when no file */}
          {step === 0 && (
            <div
              onDrop={handleDrop}
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onClick={()=>fileRef.current?.click()}
              style={{
                border:`2px dashed ${dragging?'#5B3FC8':B1}`,
                borderRadius:12, padding:'40px 24px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:12,
                cursor:'pointer', transition:'all 0.2s',
                background: dragging?'rgba(91,63,200,0.06)':S2,
              }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='#5B3FC8'; e.currentTarget.style.background='rgba(91,63,200,0.04)'; }}
              onMouseLeave={e=>{ if(!dragging){ e.currentTarget.style.borderColor=B1; e.currentTarget.style.background=S2; }}}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(91,63,200,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Upload size={22} color="#7C5CE8"/>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:4 }}>Drop your CSV here</div>
                <div style={{ fontSize:12, color:T2 }}>or click to browse — supports .csv, .xlsx, .txt</div>
              </div>
              <div style={{ fontSize:11, color:T2, background:S3, padding:'4px 12px', borderRadius:99, marginTop:4 }}>
                Expected columns: Business, Email, Phone, City, Website, Industry
              </div>
            </div>
          )}

          {/* File selected — show filename + progress */}
          {step > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* File pill */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`1px solid ${step===3?'rgba(16,185,129,0.3)':B1}`, background:step===3?'rgba(16,185,129,0.06)':S2 }}>
                <div style={{ width:36, height:36, borderRadius:8, background:'rgba(91,63,200,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <FileText size={16} color="#7C5CE8"/>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{file?.name}</div>
                  <div style={{ fontSize:11, color:T2, marginTop:1 }}>{totalRows} leads · {file ? (file.size/1024/1024).toFixed(1) : '0'}MB</div>
                </div>
                {step===3
                  ? <CheckCircle2 size={18} color="#10B981"/>
                  : <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid rgba(91,63,200,0.3)', borderTopColor:'#7C5CE8', animation:'spin 0.8s linear infinite' }}/>
                }
                {step===3 && (
                  <button onClick={handleReset} style={{ padding:4, border:'none', background:'transparent', cursor:'pointer', color:T2, marginLeft:4 }}>
                    <X size={13}/>
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {step === 2 && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:T2 }}>Processing leads…</span>
                    <span style={{ fontSize:12, fontWeight:600, color:'#7C5CE8', fontFamily:'JetBrains Mono,monospace' }}>{progress}%</span>
                  </div>
                  <div style={{ height:6, background:S3, borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:6, width:`${progress}%`, borderRadius:99, background:'linear-gradient(90deg,#5B3FC8,#4edea3)', transition:'width 0.2s ease', boxShadow:'0 0 10px rgba(91,63,200,0.4)' }}/>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#10B981' }}>✓ Processing complete</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#10B981', fontFamily:'JetBrains Mono,monospace' }}>100%</span>
                </div>
              )}

              {/* Stats row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                {[
                  { label:'Total Leads',  value:totalRows,           color:T1         },
                  { label:'Mapped',       value:step===3?totalRows:enriched, color:'#7C5CE8'  },
                  { label:'Processing',   value:processing,          color:'#F59E0B'  },
                  { label:'Completed',    value:`${completed}%`,     color:'#10B981'  },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background:S2, border:`1px solid ${B1}`, borderRadius:9, padding:'12px', textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace', lineHeight:1 }}>{value}</div>
                    <div style={{ fontSize:10, color:T2, marginTop:4 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Live log */}
              <div style={{ background:S2, border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Processing Log</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {logVisible.map((line, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <CheckCircle2 size={12} color="#10B981" style={{ flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:T1, flex:1 }}>{line.text}</span>
                      <span style={{ fontSize:10, color:T2, fontFamily:'JetBrains Mono,monospace' }}>{line.time}</span>
                    </div>
                  ))}
                  {step === 2 && (
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(91,63,200,0.3)', borderTopColor:'#7C5CE8', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>
                      <span style={{ fontSize:12, color:T2 }}>Processing…</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview + Save — shown when done */}
        {step === 3 && (
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${B1}` }}>
              <div>
                <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Preview Results</span>
                <span style={{ fontSize:11, color:T2, marginLeft:8 }}>
                  Showing {previewRows.length} of {totalRows} leads
                </span>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>setShowPreview(p=>!p)} style={{
                  display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8,
                  border:`1px solid ${B1}`, background:'transparent', color:T2,
                  fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=dark?'#484F58':'#D1D5DB'; e.currentTarget.style.color=T1;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T2;}}>
                  <Eye size={12}/> {showPreview?'Hide':'View Results'}
                </button>
                {!saved && (
                  <button onClick={handleSaveAll} style={{
                    display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8,
                    border:'none', background:'#5B3FC8', color:'#fff',
                    fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                    boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s',
                  }}
                    onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
                    onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
                    <CheckCircle2 size={12}/> Save All {totalRows} Lead{totalRows !== 1 ? 's' : ''}
                  </button>
                )}
                {saved && (
                  <div style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', color:'#10B981', fontSize:11, fontWeight:600 }}>
                    <CheckCircle2 size={12}/> Saved! Redirecting…
                  </div>
                )}
              </div>
            </div>

            {showPreview && (
              <div style={{ overflowX:'auto' }}>
                {/* Table header */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 90px 100px 110px 60px', gap:0, padding:'8px 20px', background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', borderBottom:`1px solid ${B1}` }}>
                  {['Business','Email','City','Industry','Intent','AI Score'].map(h => (
                    <div key={h} style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</div>
                  ))}
                </div>
                {previewRows.map((lead, i) => (
                  <div key={i}
                    style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 90px 100px 110px 60px', gap:0, padding:'10px 20px', borderBottom:`1px solid ${dark?'#21262D':'#F3F4F5'}`, transition:'background 0.1s', cursor:'default' }}
                    onMouseEnter={e=>e.currentTarget.style.background=dark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.015)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:12, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.business}</div>
                    <div style={{ fontSize:11, color:T2, fontFamily:'JetBrains Mono,monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.email || '—'}</div>
                    <div style={{ fontSize:11, color:T2 }}>{lead.city || '—'}</div>
                    <div style={{ fontSize:11, color:T2 }}>{lead.industry || '—'}</div>
                    <div>
                      <span style={{
                        fontSize:10, fontWeight:500, padding:'2px 7px', borderRadius:99,
                        background:'rgba(91,63,200,0.15)', color:'#7C5CE8',
                      }}>{lead.intent || 'AI Visibility'}</span>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:lead.aiScore>=80?'#10B981':lead.aiScore>=65?'#F59E0B':'#EF4444', fontFamily:'JetBrains Mono,monospace' }}>{lead.aiScore}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.txt" style={{ display:'none' }}
        onChange={e => handleFile(e.target.files?.[0])}/>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
