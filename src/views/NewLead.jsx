import { useState } from 'react';
import { Zap, CheckCircle2, Plus, Send, Brain, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SheetsAdapter } from '../services/sheetsAdapter';

const INTENTS    = ['AI Visibility','Review Growth','Listings','Competitor Dominance','Local SEO'];
const INDUSTRIES = ['Dental','Med Spa','Chiropractic','Wellness','Fitness','Dermatology','Healthcare','Automotive','Legal','Real Estate','Other'];
const STAGES     = ['New','Contacted','Follow Up','Hot','Demo Booked','Nurturing'];

const EXTRACT_FIELDS = [
  { key:'business',     label:'Business Name'    },
  { key:'contact',      label:'Contact Name'     },
  { key:'email',        label:'Email'            },
  { key:'phone',        label:'Phone'            },
  { key:'website',      label:'Website'          },
  { key:'city',         label:'City / State'     },
  { key:'intent',       label:'Intent',          type:'select', options:INTENTS    },
  { key:'industry',     label:'Industry',        type:'select', options:INDUSTRIES },
  { key:'keyword',      label:'Keyword'          },
  { key:'competitor',   label:'Competitor'       },
  { key:'reviews',      label:'Est. Reviews',    type:'number'  },
  { key:'mqlDate',      label:'MQL Date/Time',   readOnly:true  },
  { key:'salesloftUrl', label:'Salesloft URL'    },
  { key:'gmbUrl',       label:'GMB URL'          },
];

function parseRaw(raw, aiReport, seoReport, repGap) {
  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const out   = {};

  // ── MQL timestamp ──
  const ts = raw.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[\s,]+\d{1,2}:\d{2}\s*[AP]?M?)\b/i)
           || raw.match(/\b(\d{4}-\d{2}-\d{2}T[\d:]+)\b/);
  out.mqlDate = ts ? ts[1] : new Date().toLocaleString('en-US',{ month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' });

  lines.forEach(line => {
    const lo = line.toLowerCase();

    // Email
    const em = line.match(/[\w.+\-]+@[\w\-]+\.\w+/);
    if (em && !out.email) out.email = em[0];

    // Phone
    const ph = line.match(/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/);
    if (ph && !out.phone) out.phone = ph[0];

    // ── Salesloft URL — explicit or contains 'salesloft' ──
    if (lo.includes('salesloft') && !out.salesloftUrl) {
      const url = line.match(/https?:\/\/\S+/);
      out.salesloftUrl = url ? url[0] : line.replace(/^salesloft[:\s]*/i,'').trim();
    }

    // ── GMB URL — google maps, goo.gl, g.page, or 'gmb' label ──
    if ((lo.includes('google.com/maps') || lo.includes('goo.gl') || lo.includes('g.page') || /^gmb[:\s]/i.test(line)) && !out.gmbUrl) {
      const url = line.match(/https?:\/\/\S+/);
      out.gmbUrl = url ? url[0] : line.replace(/^gmb[:\s]*/i,'').trim();
    }

    // ── Keyword ──
    if (/^keyword[:\s]/i.test(line) || /^kw[:\s]/i.test(line)) {
      out.keyword = line.replace(/^(keyword|kw)[:\s]*/i,'').trim().slice(0,80);
    }

    // ── Competitor ──
    if (/competitor[:\s]/i.test(line) || /rival[:\s]/i.test(line)) {
      out.competitor = line.replace(/^(competitor|rival)[:\s]*/i,'').trim().slice(0,80);
    }
    // "Their competitor is X" or "competing with X"
    const compMatch = line.match(/(?:competitor is|competing with|vs\.?)\s+(.+)/i);
    if (compMatch && !out.competitor) out.competitor = compMatch[1].trim().slice(0,80);

    // ── Review count ──
    const revMatch = line.match(/(\d+)\s*(?:reviews?|ratings?)/i);
    if (revMatch && !out.reviews) out.reviews = parseInt(revMatch[1]);

    // ── Website (not salesloft, not gmb) ──
    if (!out.website && (line.match(/^https?:\/\//) || /^\S+\.(com|co|io|net|org|dental|clinic|spa)$/i.test(line))) {
      if (!lo.includes('salesloft') && !lo.includes('google.com/maps') && !lo.includes('goo.gl') && !lo.includes('g.page')) {
        out.website = line.replace(/^https?:\/\//, '').replace(/\/$/, '');
      }
    }

    // ── City/State ──
    if (/,\s*[A-Z]{2}\b/.test(line) && !out.city) out.city = line;

    // ── Industry ──
    const industryMap = [
      [/dental|dentist/i,'Dental'], [/spa|med.?spa/i,'Med Spa'],
      [/chiro/i,'Chiropractic'],    [/wellness/i,'Wellness'],
      [/fitness|gym/i,'Fitness'],   [/derm|skin.?care/i,'Dermatology'],
      [/legal|law.?firm|attorney/i,'Legal'], [/auto|car.?deal/i,'Automotive'],
    ];
    for (const [re, val] of industryMap) {
      if (re.test(line) && !out.industry) { out.industry = val; break; }
    }

    // ── Intent ──
    if (/ai.?visib|appear.*ai|ai.*search|chatgpt|gemini/i.test(line) && !out.intent) out.intent='AI Visibility';
    if (/review|rating/i.test(line) && !out.intent)                                   out.intent='Review Growth';
    if (/listing|gmb|google my biz/i.test(line) && !out.intent)                      out.intent='Listings';
    if (/competitor|domina/i.test(line) && !out.intent)                              out.intent='Competitor Dominance';

    // ── Business name ──
    if (!out.business && /^[A-Z]/.test(line) && !line.includes('@')
        && !line.match(/^https?:\/\//) && line.length < 80
        && !/\d{3}[\s.\-]?\d{4}/.test(line)
        && !lo.includes('keyword') && !lo.includes('competitor')
        && !lo.includes('salesloft') && !lo.includes('gmb'))
      out.business = line;
  });

  // ── Pull competitor from AI/SEO/rep gap reports ──
  const allText = [aiReport, seoReport, repGap].filter(Boolean).join('\n');
  if (!out.competitor && allText) {
    const m = allText.match(/(?:competitor[:\s]+|competing with[:\s]+|vs\.?\s+)([A-Z][^\n,\.]+)/i);
    if (m) out.competitor = m[1].trim().slice(0,80);
  }

  // Pull review count from rep gap
  if (!out.reviews && repGap) {
    const rm = repGap.match(/(\d+)\s*reviews?/i);
    if (rm) out.reviews = parseInt(rm[1]);
  }

  if (!out.intent)   out.intent   = 'AI Visibility';
  if (!out.industry) out.industry = 'Healthcare';
  if (!out.reviews)  out.reviews  = 0;

  return out;
}

function generateAENotes(extracted, aiReport, seoReport, repGap, addlNotes) {
  const parts = [];

  if (extracted.business) {
    parts.push(`LEAD: ${extracted.business}${extracted.city ? ` · ${extracted.city}` : ''}${extracted.industry ? ` · ${extracted.industry}` : ''}`);
  }
  if (extracted.keyword)    parts.push(`Keyword: ${extracted.keyword}`);
  if (extracted.competitor) parts.push(`Competitor: ${extracted.competitor}`);
  if (extracted.reviews)    parts.push(`Est. reviews: ${extracted.reviews}`);
  if (extracted.gmbUrl)     parts.push(`GMB: ${extracted.gmbUrl}`);
  if (extracted.salesloftUrl) parts.push(`Salesloft: ${extracted.salesloftUrl}`);
  if (extracted.mqlDate)    parts.push(`MQL date: ${extracted.mqlDate}`);

  if (aiReport?.trim())   parts.push(`\nAI SCAN REPORT:\n${aiReport.trim()}`);
  if (seoReport?.trim())  parts.push(`\nLOCAL SEO REPORT:\n${seoReport.trim()}`);
  if (repGap?.trim())     parts.push(`\nREPUTATION GAP:\n${repGap.trim()}`);
  if (addlNotes?.trim())  parts.push(`\nADDITIONAL NOTES:\n${addlNotes.trim()}`);

  return parts.join('\n');
}

const SAMPLE = `Lead received: 05/30/2025 10:42 AM

Bright Smile Dental
john@brightsmiledental.com
(312) 555-2233
123 Main St, Austin, TX
https://brightsmiledental.com
Salesloft: https://app.salesloft.com/people/12345678
GMB: https://g.page/brightsmile-dental
Keyword: dental austin
Competitor is Glow Dental (412 reviews)`;

export default function NewLead() {
  const { theme, addLead, setView } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  const [raw,        setRaw]        = useState(SAMPLE);
  const [aiReport,   setAiReport]   = useState('');
  const [seoReport,  setSeoReport]  = useState('');
  const [repGap,     setRepGap]     = useState('');
  const [addlNotes,  setAddlNotes]  = useState('');
  const [parsed,     setParsed]     = useState(null);
  const [editing,    setEditing]    = useState({});
  const [aeNotes,    setAeNotes]    = useState('');
  const [parsing,    setParsing]    = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [pushedSheet,setPushedSheet]= useState(false);
  const [activeTab,  setActiveTab]  = useState('raw');

  const tabs = [
    { id:'raw',    label:'Raw Lead Data'        },
    { id:'ai',     label:'AI Scan Report'       },
    { id:'seo',    label:'Local SEO Report'     },
    { id:'rep',    label:'Reputation Gap'       },
    { id:'notes',  label:'Additional Notes'     },
  ];

  const tabContent = { raw, ai:aiReport, seo:seoReport, rep:repGap, notes:addlNotes };
  const tabSetters = { raw:setRaw, ai:setAiReport, seo:setSeoReport, rep:setRepGap, notes:setAddlNotes };
  const tabPlaceholders = {
    raw:   'Paste raw data — email, notes, any text. Include date/time for MQL, GMB URL, Salesloft URL, keyword, competitor…',
    ai:    'Paste Birdeye AI scan output…',
    seo:   'Paste local SEO audit results…',
    rep:   'Paste reputation gap data — competitor review counts, AI visibility scores…',
    notes: 'Any extra context, objections, win signals…',
  };

  const handleParse = () => {
    setParsing(true);
    setTimeout(()=>{
      const result = parseRaw(raw, aiReport, seoReport, repGap);
      setParsed(result);
      setEditing({ ...result, stage:'New' });
      const notes = generateAENotes(result, aiReport, seoReport, repGap, addlNotes);
      setAeNotes(notes);
      setParsing(false);
      setSaved(false);
    }, 700);
  };

  const handleSave = () => {
    addLead({
      ...editing,
      reviews:  parseInt(editing.reviews)||0,
      rating:   0, aiVisibility:0,
      compGap:  editing.competitor ? 'High' : 'Medium',
      nextAction:'Initial Outreach',
      lastTouch: 'Never',
      cadenceDay:0, cadenceTotal:7,
      tags:['New'],
      aeNotes,
    });
    setSaved(true);
    setTimeout(()=>setView('workqueue'), 1400);
  };

  const handlePushSheet = () => {
    if (!editing || !parsed) return;
    const leadData = { ...editing, aeNotes, reviews: parseInt(editing.reviews) || 0 };
    SheetsAdapter.pushLead(leadData).catch(() => {});
    setPushedSheet(true);
    setTimeout(() => setPushedSheet(false), 2500);
  };

  const inpStyle = {
    width:'100%', padding:'7px 10px', borderRadius:8,
    border:`1px solid ${B1}`, background:'transparent',
    color:T1, fontSize:12, fontFamily:'inherit', outline:'none',
    transition:'border-color 0.15s',
  };
  const fo = e=>e.target.style.borderColor='#5B3FC8';
  const bl = e=>e.target.style.borderColor=B1;

  return (
    <div className="fade-up" style={{ maxWidth:1020 }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>New Lead — Smart Parser</h1>
        <p style={{ fontSize:12, color:T2, marginTop:4 }}>
          Paste raw data, scan reports, GMB URL, Salesloft URL and keyword — we'll extract everything and auto-generate AE notes
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

        {/* ── LEFT: tabbed inputs ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Tab bar */}
          <div style={{ display:'flex', gap:2, background:S1, border:`1px solid ${B1}`, borderRadius:10, padding:4, flexWrap:'wrap' }}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
                padding:'5px 10px', borderRadius:7, border:'none', cursor:'pointer',
                background: activeTab===t.id?'#5B3FC8':'transparent',
                color: activeTab===t.id?'#fff':T2,
                fontSize:11, fontWeight: activeTab===t.id?600:400,
                fontFamily:'inherit', transition:'all 0.15s',
              }}>
                {t.label}
                {tabContent[t.id] && t.id!=='raw' && (
                  <span style={{ marginLeft:4, width:5, height:5, borderRadius:'50%', background: activeTab===t.id?'rgba(255,255,255,0.6)':'#10B981', display:'inline-block', verticalAlign:'middle' }}/>
                )}
              </button>
            ))}
          </div>

          {/* Active textarea */}
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:'14px' }}>
            <textarea
              value={tabContent[activeTab]}
              onChange={e=>{ tabSetters[activeTab](e.target.value); setParsed(null); setSaved(false); }}
              rows={activeTab==='raw' ? 10 : 6}
              placeholder={tabPlaceholders[activeTab]}
              style={{ width:'100%', padding:'10px', borderRadius:8, resize:'vertical', border:`1px solid ${B1}`, outline:'none', background:S2, color:T1, fontSize: activeTab==='raw'?11:12, fontFamily: activeTab==='raw'?'JetBrains Mono,monospace':'inherit', lineHeight:1.7, transition:'border-color 0.15s' }}
              onFocus={fo} onBlur={bl}/>
          </div>

          {/* Quick tip */}
          <div style={{ display:'flex', gap:8, padding:'9px 12px', borderRadius:9, background:'rgba(91,63,200,0.06)', border:'1px solid rgba(91,63,200,0.2)' }}>
            <Brain size={13} color="#7C5CE8" style={{ flexShrink:0, marginTop:1 }}/>
            <p style={{ fontSize:11, color:T2, margin:0, lineHeight:1.6 }}>
              <strong style={{ color:'#7C5CE8' }}>Tips:</strong> Include GMB URL (g.page/… or google.com/maps), Salesloft URL, and a <code style={{ background:'rgba(0,0,0,0.2)', padding:'1px 4px', borderRadius:3 }}>Keyword: dental austin</code> line. Competitor info is extracted from all pasted text.
            </p>
          </div>

          {/* Parse button */}
          <button onClick={handleParse} disabled={!raw.trim()||parsing} style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            padding:'11px', borderRadius:10, border:'none',
            background: raw.trim()?'#5B3FC8':'rgba(91,63,200,0.3)', color:'#fff',
            fontSize:13, fontWeight:600, cursor: raw.trim()?'pointer':'not-allowed',
            fontFamily:'inherit', boxShadow: raw.trim()?'0 4px 16px rgba(91,63,200,0.35)':'none',
            transition:'all 0.15s',
          }}
            onMouseEnter={e=>{ if(raw.trim()) e.currentTarget.style.background='#4828B5'; }}
            onMouseLeave={e=>{ if(raw.trim()) e.currentTarget.style.background='#5B3FC8'; }}>
            {parsing
              ? <><span style={{ width:13,height:13,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',animation:'spin 0.7s linear infinite',display:'inline-block' }}/> Parsing…</>
              : <><Zap size={14}/> Parse &amp; Generate AE Notes</>
            }
          </button>
        </div>

        {/* ── RIGHT: extracted fields + AE notes ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Extracted fields */}
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:'16px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Extracted Information</span>
              {parsed && <span style={{ fontSize:11, color:'#10B981', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}><CheckCircle2 size={12}/> Parsed</span>}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              {EXTRACT_FIELDS.map(({ key, label, type, options, readOnly })=>{
                const val = editing[key]||'';
                const hit = parsed?.[key];
                return (
                  <div key={key} style={{
                    display:'grid', gridTemplateColumns:'110px 1fr 16px', gap:8, alignItems:'center',
                    padding:'6px 10px', borderRadius:8,
                    border:`1px solid ${hit?'rgba(16,185,129,0.25)':B1}`,
                    background: hit?(dark?'rgba(16,185,129,0.05)':'rgba(16,185,129,0.03)'):S2,
                    transition:'all 0.2s',
                  }}>
                    <div style={{ fontSize:9, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</div>
                    {readOnly ? (
                      <div style={{ fontSize:11, color:hit?'#10B981':dark?'#484F58':'#D1D5DB', fontFamily:'JetBrains Mono,monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val||'—'}</div>
                    ) : type==='select' ? (
                      <select value={val} onChange={e=>setEditing(ed=>({...ed,[key]:e.target.value}))} disabled={!parsed}
                        style={{ ...inpStyle, background:'transparent', padding:'4px 6px', fontSize:11 }}>
                        {options.map(o=><option key={o}>{o}</option>)}
                      </select>
                    ) : type==='number' ? (
                      <input type="number" value={val} onChange={e=>setEditing(ed=>({...ed,[key]:e.target.value}))} disabled={!parsed}
                        style={{ ...inpStyle, padding:'4px 6px', fontSize:11 }} onFocus={fo} onBlur={bl}/>
                    ) : (
                      <input value={val} onChange={e=>setEditing(ed=>({...ed,[key]:e.target.value}))} disabled={!parsed}
                        placeholder={parsed?'—':'parse first'}
                        style={{ ...inpStyle, padding:'4px 6px', fontSize:11, overflow:'hidden', textOverflow:'ellipsis' }} onFocus={fo} onBlur={bl}/>
                    )}
                    {hit ? <CheckCircle2 size={11} color="#10B981"/> : <div/>}
                  </div>
                );
              })}

              {/* Stage */}
              <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 16px', gap:8, alignItems:'center', padding:'6px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S2 }}>
                <div style={{ fontSize:9, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.04em' }}>Stage</div>
                <select value={editing.stage||'New'} onChange={e=>setEditing(ed=>({...ed,stage:e.target.value}))} disabled={!parsed}
                  style={{ ...inpStyle, background:'transparent', padding:'4px 6px', fontSize:11 }}>
                  {STAGES.map(s=><option key={s}>{s}</option>)}
                </select>
                <div/>
              </div>
            </div>
          </div>

          {/* Auto-generated AE notes */}
          {parsed && (
            <div style={{ background:S1, border:`1px solid rgba(91,63,200,0.3)`, borderRadius:12, padding:'14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <Brain size={13} color="#7C5CE8"/>
                <span style={{ fontSize:11, fontWeight:600, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Auto-Generated AE Notes</span>
              </div>
              <textarea value={aeNotes} onChange={e=>setAeNotes(e.target.value)} rows={6}
                style={{ width:'100%', padding:'9px 10px', borderRadius:8, border:`1px solid ${B1}`, outline:'none', background:S2, color:T1, fontSize:11, fontFamily:'JetBrains Mono,monospace', lineHeight:1.6, resize:'vertical', transition:'border-color 0.15s' }}
                onFocus={fo} onBlur={bl}/>
            </div>
          )}

          {/* MQL callout */}
          {parsed?.mqlDate && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, background:'rgba(91,63,200,0.08)', border:'1px solid rgba(91,63,200,0.2)' }}>
              <span style={{ fontSize:13 }}>🕐</span>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'#7C5CE8' }}>MQL Timestamp</div>
                <div style={{ fontSize:11, color:T2 }}>{editing.mqlDate}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          {parsed && !saved && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button onClick={handlePushSheet} style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  padding:'9px', borderRadius:9,
                  border:`1px solid ${pushedSheet?'rgba(16,185,129,0.4)':B1}`,
                  background: pushedSheet?'rgba(16,185,129,0.1)':'transparent',
                  color: pushedSheet?'#10B981':T2,
                  fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s',
                }}
                  onMouseEnter={e=>{ if(!pushedSheet){ e.currentTarget.style.borderColor='#10B981'; e.currentTarget.style.color='#10B981'; }}}
                  onMouseLeave={e=>{ if(!pushedSheet){ e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T2; }}}>
                  {pushedSheet ? <><CheckCircle2 size={13}/> Pushed!</> : <><Send size={13}/> Push to Sheet</>}
                </button>
                <button onClick={()=>{ setParsed(null); setEditing({}); setSaved(false); setAeNotes(''); }} style={{
                  padding:'9px', borderRadius:9, border:`1px solid ${B1}`,
                  background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit',
                }}>Reset</button>
              </div>
              <button onClick={handleSave} style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                padding:'11px', borderRadius:10, border:'none',
                background:'#5B3FC8', color:'#fff', fontSize:13, fontWeight:600,
                cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 14px rgba(91,63,200,0.35)',
                transition:'background 0.15s',
              }}
                onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
                onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
                <Plus size={14}/> Save Lead to Workspace
              </button>
            </div>
          )}

          {saved && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderRadius:10, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)' }}>
              <CheckCircle2 size={14} color="#10B981"/>
              <span style={{ fontSize:12, fontWeight:600, color:'#10B981' }}>Saved! Redirecting to Work Queue…</span>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
