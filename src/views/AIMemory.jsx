import { useState, useMemo } from 'react';
import { Brain, Search, Plus, X, Trash2, Clock, Sparkles, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';

const MEMORY_TAGS = ['Competitor','Budget','Decision Maker','Pain Point','Timeline','Objection','Win Signal','Context'];

const TAG_STYLE = {
  'Competitor':     { bg:'rgba(239,68,68,0.12)',  color:'#F87171' },
  'Budget':         { bg:'rgba(245,158,11,0.12)', color:'#FCD34D' },
  'Decision Maker': { bg:'rgba(91,63,200,0.15)',  color:'#7C5CE8' },
  'Pain Point':     { bg:'rgba(236,72,153,0.12)', color:'#F472B6' },
  'Timeline':       { bg:'rgba(56,189,248,0.12)', color:'#38BDF8' },
  'Objection':      { bg:'rgba(239,68,68,0.12)',  color:'#F87171' },
  'Win Signal':     { bg:'rgba(16,185,129,0.12)', color:'#34D399' },
  'Context':        { bg:'rgba(59,130,246,0.12)', color:'#60A5FA' },
};

export default function AIMemory() {
  const { leads, addMemoryEntry, removeMemoryEntry } = useApp();
  const { dark, T1, T2, B1, S1, S2, S3 } = useTheme();

  const [q,          setQ]          = useState('');
  const [tagFilter,  setTagFilter]  = useState('All');
  const [leadFilter, setLeadFilter] = useState('All Leads');
  const [adding,     setAdding]     = useState(false);
  const [newText,    setNewText]    = useState('');
  const [newTag,     setNewTag]     = useState('Context');
  const [newLeadId,  setNewLeadId]  = useState('');

  // Build flat memory list from all leads
  const allMemories = useMemo(() => {
    return leads.flatMap(l =>
      (l.memory || []).map(m => ({ ...m, leadId:l.id, lead:l.business }))
    ).sort((a,b) => (b.id||0) - (a.id||0));
  }, [leads]);

  const filtered = useMemo(() => {
    let out = allMemories;
    if (q)                          out = out.filter(m => m.text?.toLowerCase().includes(q.toLowerCase()) || m.lead?.toLowerCase().includes(q.toLowerCase()));
    if (tagFilter !== 'All')        out = out.filter(m => m.tag === tagFilter);
    if (leadFilter !== 'All Leads') out = out.filter(m => m.lead === leadFilter);
    return out;
  }, [allMemories, q, tagFilter, leadFilter]);

  const handleAdd = () => {
    if (!newText.trim()) return;
    const lead = leads.find(l => l.id === parseInt(newLeadId)) || leads[0];
    if (!lead) return;
    addMemoryEntry(lead.id, { text:newText.trim(), tag:newTag, date:'Today' });
    setNewText(''); setAdding(false); setNewLeadId('');
  };

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(m => { if (!g[m.lead]) g[m.lead]=[]; g[m.lead].push(m); });
    return g;
  }, [filtered]);

  const inp = (val, set, ph='') => ({
    value: val, onChange:e=>set(e.target.value), placeholder:ph,
    style: { width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s' },
    onFocus:e=>e.target.style.borderColor='#5B3FC8',
    onBlur: e=>e.target.style.borderColor=B1,
  });

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:900 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <Brain size={20} color="#7C5CE8"/> AI Memory
          </h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>Context and intelligence across all your leads — persists across sessions</p>
        </div>
        <button onClick={()=>setAdding(true)} style={{
          display:'flex', alignItems:'center', gap:5, padding:'8px 14px', borderRadius:8,
          border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600,
          cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
          onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
          <Plus size={13}/> Add Memory
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[
          { label:'Total Entries',     value:allMemories.length,                                            color:'#7C5CE8' },
          { label:'Leads Covered',     value:new Set(allMemories.map(m=>m.leadId)).size,                   color:'#3B82F6' },
          { label:'Win Signals',       value:allMemories.filter(m=>m.tag==='Win Signal').length,           color:'#10B981' },
          { label:'Objections Logged', value:allMemories.filter(m=>m.tag==='Objection').length,            color:'#EF4444' },
        ].map(({ label, value, color })=>(
          <div key={label} style={{ background:S1, border:`1px solid ${B1}`, borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace', lineHeight:1 }}>{value}</div>
            <div style={{ fontSize:11, color:T2, marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background:S1, border:'1px solid rgba(91,63,200,0.3)', borderRadius:12, padding:'16px', boxShadow:'0 4px 20px rgba(91,63,200,0.15)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:600, color:T1, display:'flex', alignItems:'center', gap:6 }}>
              <Sparkles size={13} color="#7C5CE8"/> New Memory Entry
            </span>
            <button onClick={()=>setAdding(false)} style={{ border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={14}/></button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <textarea {...inp(newText, setNewText, 'What do you want to remember about this lead?')} rows={3} style={{ ...inp(newText,setNewText,'').style, resize:'none', lineHeight:1.6 }}/>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ position:'relative', flex:1 }}>
                <select value={newLeadId} onChange={e=>setNewLeadId(e.target.value)}
                  style={{ width:'100%', padding:'7px 28px 7px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:11, fontFamily:'inherit', outline:'none', appearance:'none' }}>
                  <option value="">Select lead…</option>
                  {leads.map(l=><option key={l.id} value={l.id}>{l.business}</option>)}
                </select>
                <ChevronDown size={11} color={T2} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
              </div>
              <div style={{ position:'relative', flex:1 }}>
                <select value={newTag} onChange={e=>setNewTag(e.target.value)}
                  style={{ width:'100%', padding:'7px 28px 7px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:11, fontFamily:'inherit', outline:'none', appearance:'none' }}>
                  {MEMORY_TAGS.map(t=><option key={t}>{t}</option>)}
                </select>
                <ChevronDown size={11} color={T2} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
              </div>
              <button onClick={handleAdd} disabled={!newText.trim()||!newLeadId} style={{
                padding:'7px 16px', borderRadius:8, border:'none',
                background:newText.trim()&&newLeadId?'#5B3FC8':'rgba(91,63,200,0.3)',
                color:'#fff', fontSize:11, fontWeight:600, cursor:newText.trim()&&newLeadId?'pointer':'not-allowed',
                fontFamily:'inherit', whiteSpace:'nowrap',
              }}>
                Save Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:180, maxWidth:280, display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:8, background:S1, border:`1px solid ${B1}` }}>
          <Search size={12} color={T2} style={{ flexShrink:0 }}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search memories…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:12, color:T1, fontFamily:'inherit' }}/>
          {q && <button onClick={()=>setQ('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={11}/></button>}
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {['All', ...MEMORY_TAGS].map(t=>{
            const active=tagFilter===t, ts=TAG_STYLE[t];
            return (
              <button key={t} onClick={()=>setTagFilter(t)} style={{
                padding:'4px 10px', borderRadius:99, border:`1px solid ${active?(ts?.color||'#7C5CE8'):B1}`,
                background:active?(ts?.bg||'rgba(91,63,200,0.15)'):'transparent',
                color:active?(ts?.color||'#7C5CE8'):T2,
                fontSize:10, fontWeight:active?600:400, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
              }}>{t}</button>
            );
          })}
        </div>
      </div>

      {/* Grouped entries */}
      {Object.keys(grouped).length===0 ? (
        <div style={{ textAlign:'center', padding:'48px', color:T2, fontSize:13 }}>
          {allMemories.length===0
            ? 'No memory entries yet — add entries on any lead or click "Add Memory" above'
            : 'No entries match your filters'}
        </div>
      ) : Object.entries(grouped).map(([leadName, items])=>(
        <div key={leadName} style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:24, height:24, borderRadius:6, background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0 }}>
              {leadName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{leadName}</span>
            <span style={{ fontSize:10, color:T2, background:S3, padding:'1px 7px', borderRadius:99 }}>{items.length}</span>
            <div style={{ flex:1, height:1, background:B1 }}/>
          </div>
          {items.map(m=>{
            const ts=TAG_STYLE[m.tag]||TAG_STYLE['Context'];
            return (
              <div key={m.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:S1, border:`1px solid ${B1}`, borderRadius:10, transition:'border-color 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(91,63,200,0.3)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=B1}>
                <Brain size={13} color="#7C5CE8" style={{ flexShrink:0, marginTop:2 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:12, color:T1, lineHeight:1.6, margin:0 }}>{m.text}</p>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                    <span style={{ ...ts, padding:'1px 7px', borderRadius:99, fontSize:10, fontWeight:600 }}>{m.tag}</span>
                    <span style={{ fontSize:10, color:T2, display:'flex', alignItems:'center', gap:3 }}><Clock size={9}/> {m.date}</span>
                  </div>
                </div>
                <button onClick={()=>removeMemoryEntry(m.leadId, m.id)} style={{ padding:4, borderRadius:5, border:'none', background:'transparent', cursor:'pointer', color:T2, opacity:0.5, transition:'all 0.12s' }}
                  onMouseEnter={e=>{e.currentTarget.style.color='#EF4444'; e.currentTarget.style.opacity='1';}}
                  onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.opacity='0.5';}}>
                  <Trash2 size={12}/>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
