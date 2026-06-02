import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, MoreHorizontal, Clock,
         Filter, SlidersHorizontal, Download, Plus, X, Upload } from 'lucide-react';
import { STAGE_STYLE, INTENT_STYLE } from '../constants/stages';
import ScoreRing from '../components/ui/ScoreRing';
import { useApp } from '../context/AppContext';


const COLS = [
  { key:'business',    label:'Business',      sortable:true,  w:'1fr'   },
  { key:'intent',      label:'Intent',        sortable:true,  w:'100px' },
  { key:'aiScore',     label:'Score',         sortable:true,  w:'64px'  },
  { key:'stage',       label:'Stage',         sortable:true,  w:'110px' },
  { key:'reviews',     label:'Reviews',       sortable:true,  w:'72px'  },
  { key:'aiVisibility',label:'AI Vis.',       sortable:true,  w:'72px'  },
  { key:'lastTouch',   label:'Last Touch',    sortable:false, w:'90px'  },
  { key:'nextAction',  label:'Next Action',   sortable:false, w:'130px' },
  { key:'_actions',    label:'',              sortable:false, w:'36px'  },
];
const GRID = COLS.map(c=>c.w).join(' ');

const ALL_STAGES   = ['All Stages','New','Hot','Contacted','Follow Up','Demo Booked','Nurturing','Re-engage','Converted','Lost'];
const ALL_INTENTS  = ['All Intents','AI Visibility','Review Growth','Listings'];
const ALL_INDUSTRIES = ['All Industries','Dental','Med Spa','Chiropractic','Wellness','Fitness','Dermatology'];


export default function MyLeads() {
  const { theme, leads, openLead, selected, toggleSelect, selectAll, clearSelect, bulkUpdateStage, setView } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA', S3=dark?'#21262D':'#F3F4F5';

  const [q, setQ]             = useState('');
  const [stage, setStage]     = useState('All Stages');
  const [intent, setIntent]   = useState('All Intents');
  const [industry, setIndustry] = useState('All Industries');
  const [sortKey, setSortKey] = useState('aiScore');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = useMemo(() => {
    let out = [...leads];
    if (q) out = out.filter(l =>
      l.business.toLowerCase().includes(q.toLowerCase()) ||
      l.email?.toLowerCase().includes(q.toLowerCase()) ||
      l.city?.toLowerCase().includes(q.toLowerCase()));
    if (stage !== 'All Stages')    out = out.filter(l => l.stage === stage);
    if (intent !== 'All Intents')  out = out.filter(l => l.intent === intent);
    if (industry !== 'All Industries') out = out.filter(l => l.industry === industry);
    out.sort((a,b) => {
      const av = a[sortKey]??0, bv = b[sortKey]??0;
      return sortDir==='asc' ? (av>bv?1:-1) : (av<bv?1:-1);
    });
    return out;
  }, [leads, q, stage, intent, industry, sortKey, sortDir]);

  const allIds = filtered.map(l=>l.id);
  const allSel = allIds.length>0 && allIds.every(id=>selected.has(id));

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null;
    return (
      <span style={{ marginLeft:4, opacity: sortKey===col.key?1:0.3 }}>
        {sortKey===col.key && sortDir==='asc' ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
      </span>
    );
  };

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>My Leads</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>{filtered.length} leads in your pipeline</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:`1px solid var(--b1)`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
            onMouseEnter={e=>{e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)';}}
            onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor='var(--b1)';}}>
            <Download size={12}/> Export
          </button>
          <button onClick={()=>setView('bulkcsv')} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:`1px solid var(--b1)`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
            onMouseEnter={e=>{e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)';}}
            onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor='var(--b1)';}}>
            <Upload size={12}/> Bulk Import
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
            onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
            <Plus size={12}/> Add Lead
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {/* Search */}
        <div style={{ flex:1, minWidth:200, maxWidth:320, display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:8, background:S1, border:`1px solid ${B1}` }}>
          <Search size={13} color={T2} style={{ flexShrink:0 }}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search leads…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:12, color:T1, fontFamily:'inherit' }}/>
          {q && <button onClick={()=>setQ('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:T2, display:'flex' }}><X size={12}/></button>}
        </div>

        {/* Stage filter */}
        {[
          { val:stage, set:setStage, options:ALL_STAGES },
          { val:intent, set:setIntent, options:ALL_INTENTS },
          { val:industry, set:setIndustry, options:ALL_INDUSTRIES },
        ].map(({ val, set, options },i) => (
          <div key={i} style={{ position:'relative' }}>
            <select value={val} onChange={e=>set(e.target.value)}
              style={{ padding:'7px 28px 7px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S1, color: val.startsWith('All')?T2:T1, fontSize:11, fontFamily:'inherit', cursor:'pointer', outline:'none', appearance:'none', WebkitAppearance:'none' }}>
              {options.map(o=><option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={11} color={T2} style={{ position:'absolute', right:7, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
          </div>
        ))}

        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button style={{ padding:'7px 10px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
            <SlidersHorizontal size={12}/> More Filters
          </button>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size>0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderRadius:10, background:'rgba(91,63,200,0.1)', border:'1px solid rgba(91,63,200,0.25)' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'#7C5CE8' }}>{selected.size} selected</span>
          <div style={{ display:'flex', gap:6 }}>
            {['Hot','Follow Up','Demo Booked','Nurturing','Lost'].map(s=>(
              <button key={s} onClick={()=>bulkUpdateStage(s)} style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'none', background:'rgba(91,63,200,0.2)', color:'#7C5CE8', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>→ {s}</button>
            ))}
          </div>
          <button onClick={clearSelect} style={{ marginLeft:'auto', fontSize:11, color:T2, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}
            onMouseEnter={e=>e.currentTarget.style.color='#EF4444'}
            onMouseLeave={e=>e.currentTarget.style.color=T2}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, overflow:'hidden' }}>
        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:`28px ${GRID}`, gap:8, padding:'8px 16px', background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', borderBottom:`1px solid ${B1}`, alignItems:'center' }}>
          <input type="checkbox" checked={allSel} onChange={e=>e.target.checked?selectAll(allIds):clearSelect()}
            style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
          {COLS.map(col=>(
            <div key={col.key} onClick={()=>col.sortable&&handleSort(col.key)}
              style={{ fontSize:10, fontWeight:600, color:sortKey===col.key?'#7C5CE8':T2, textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', cursor:col.sortable?'pointer':'default', userSelect:'none' }}>
              {col.label}<SortIcon col={col}/>
            </div>
          ))}
        </div>

        {/* Rows */}
        <div>
          {filtered.length===0 ? (
            <div style={{ padding:'48px', textAlign:'center', color:T2, fontSize:13 }}>
              No leads match your filters
            </div>
          ) : filtered.map(lead => {
            const stg  = STAGE_STYLE[lead.stage]  || STAGE_STYLE['New'];
            const itnt = INTENT_STYLE[lead.intent] || INTENT_STYLE['AI Visibility'];
            const isSel = selected.has(lead.id);
            return (
              <div key={lead.id}
                style={{ display:'grid', gridTemplateColumns:`28px ${GRID}`, gap:8, padding:'9px 16px', borderBottom:`1px solid ${dark?'rgba(48,54,61,0.5)':'#F3F4F5'}`, alignItems:'center', background:isSel?'rgba(91,63,200,0.07)':'transparent', transition:'background 0.1s', cursor:'pointer' }}
                onClick={()=>openLead(lead)}
                onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background=dark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.02)'; }}
                onMouseLeave={e=>{ if(!isSel) e.currentTarget.style.background='transparent'; }}>

                <div onClick={e=>{e.stopPropagation();toggleSelect(lead.id);}}>
                  <input type="checkbox" checked={isSel} onChange={()=>{}} style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
                </div>

                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.business}</div>
                  <div style={{ fontSize:10, color:T2, fontFamily:'JetBrains Mono,monospace', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.email}</div>
                </div>

                <div><span style={{ ...itnt, padding:'2px 7px', borderRadius:99, fontSize:10, fontWeight:500 }}>{lead.intent}</span></div>

                <div><ScoreRing score={lead.aiScore}/></div>

                <div><span style={{ ...stg, padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:600 }}>{lead.stage}</span></div>

                <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{lead.reviews}</div>

                <div style={{ fontSize:11, fontWeight:600, color:lead.aiVisibility<15?'#EF4444':lead.aiVisibility<25?'#F59E0B':'#10B981' }}>
                  {lead.aiVisibility}%
                </div>

                <div style={{ fontSize:10, color:T2, display:'flex', alignItems:'center', gap:3 }}>
                  <Clock size={9}/> {lead.lastTouch}
                </div>

                <div style={{ fontSize:11, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.nextAction}</div>

                <div onClick={e=>e.stopPropagation()}>
                  <button style={{ padding:3, border:'none', background:'transparent', cursor:'pointer', color:T2, display:'flex', borderRadius:5, transition:'all 0.12s' }}
                    onMouseEnter={e=>{e.currentTarget.style.background=dark?'#21262D':'#F3F4F5'; e.currentTarget.style.color=T1;}}
                    onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T2;}}>
                    <MoreHorizontal size={14}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderTop:`1px solid ${B1}`, background:dark?'rgba(0,0,0,0.15)':'rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize:11, color:T2 }}>{filtered.length} of {leads.length} leads</span>
          <div style={{ display:'flex', gap:3 }}>
            {['1','2','3','…','12'].map(p=>(
              <button key={p} style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, background:p==='1'?'#5B3FC8':'transparent', color:p==='1'?'#fff':T2, transition:'all 0.12s' }}
                onMouseEnter={e=>{ if(p!=='1') e.currentTarget.style.background=S3; }}
                onMouseLeave={e=>{ if(p!=='1') e.currentTarget.style.background='transparent'; }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
