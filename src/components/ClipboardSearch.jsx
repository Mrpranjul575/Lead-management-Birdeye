import { useState, useEffect } from 'react';
import { Search, X, Clipboard, ChevronRight, ExternalLink, Phone, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { STAGE_STYLE } from '../constants/stages';

export default function ClipboardSearch() {
  const { leads, openLead, closeLead, setClipSearch, setView } = useApp();
  const [query,   setQuery]   = useState('');
  const [pasted,  setPasted]  = useState(false);
  const [results, setResults] = useState([]);

  const dark = true; // follows app theme via CSS vars
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';

  // Auto-read clipboard on open
  useEffect(() => {
    navigator.clipboard.readText().then(text => {
      if (text?.trim()) { setQuery(text.trim()); setPasted(true); }
    }).catch(() => {});
  }, []);

  // Search leads
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const q = query.toLowerCase().trim();
    const matches = leads.filter(l =>
      l.business?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.contact?.toLowerCase().includes(q) ||
      l.phone?.replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
      l.salesloftUrl?.toLowerCase().includes(q) ||
      (l.salesloftUrl && q.match(/\d{6,}/) && l.salesloftUrl.includes(q.match(/\d{6,}/)[0]))
    ).slice(0, 8);
    setResults(matches);
  }, [query, leads]);

  const handleOpen = (lead) => {
    openLead(lead);
    setView('workqueue');
    setClipSearch(false);
  };

  return (
    <>
      <div onClick={()=>setClipSearch(false)} style={{ position:'fixed', inset:0, zIndex:299, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)' }}/>
      <div style={{
        position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)',
        width:560, zIndex:300, borderRadius:16,
        background:'var(--s1)', border:'1px solid var(--b1)',
        boxShadow:'0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(91,63,200,0.2)',
        fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden',
      }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 18px', borderBottom:'1px solid var(--b1)' }}>
          <div style={{ width:34, height:34, borderRadius:9, background:'rgba(91,63,200,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Clipboard size={15} color="#7C5CE8"/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Paste &amp; Find Lead</div>
            <div style={{ fontSize:11, color:T2 }}>Paste email, name, phone, or Salesloft URL</div>
          </div>
          {pasted && <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:'rgba(16,185,129,0.12)', color:'#10B981', display:'flex', alignItems:'center', gap:4 }}>📋 Pasted</span>}
          <button onClick={()=>setClipSearch(false)} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={15}/></button>
        </div>

        {/* Search input */}
        <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--b1)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:'var(--bg)', border:'1px solid rgba(91,63,200,0.3)', boxShadow:'0 0 0 2px rgba(91,63,200,0.1)' }}>
            <Search size={15} color="#7C5CE8" style={{ flexShrink:0 }}/>
            <input
              autoFocus
              value={query}
              onChange={e=>{ setQuery(e.target.value); setPasted(false); }}
              placeholder="Search by email, name, phone, business or Salesloft URL…"
              style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:13, color:T1, fontFamily:'inherit' }}/>
            {query && <button onClick={()=>setQuery('')} style={{ border:'none', background:'transparent', cursor:'pointer', color:T2, display:'flex' }}><X size={13}/></button>}
          </div>
          {/* Field hints */}
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            {['Email','Contact Name','Business','Phone','Salesloft URL'].map(f=>(
              <span key={f} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'var(--s3)', color:T2, border:'1px solid var(--b1)' }}>{f}</span>
            ))}
          </div>
        </div>

        {/* Results */}
        <div style={{ maxHeight:360, overflowY:'auto' }}>
          {query.trim() && results.length===0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:T2 }}>
              <div style={{ fontSize:16, marginBottom:8 }}>🔍</div>
              <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:4 }}>No leads found</div>
              <div style={{ fontSize:12, color:T2 }}>Try a different search term</div>
            </div>
          ) : results.map(lead=>{
            const st = STAGE_STYLE[lead.stage]||STAGE_STYLE['New'];
            const initials = lead.business.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
            return (
              <div key={lead.id} onClick={()=>handleOpen(lead)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', cursor:'pointer', borderBottom:'1px solid var(--b1)', transition:'background 0.1s' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--s3)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                {/* Avatar */}
                <div style={{ width:36, height:36, borderRadius:9, background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {initials}
                </div>
                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:T1 }}>{lead.business}</span>
                    <span style={{ ...st, fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99 }}>{lead.stage}</span>
                  </div>
                  <div style={{ display:'flex', gap:12 }}>
                    {lead.contact && <span style={{ fontSize:11, color:T2 }}>{lead.contact}</span>}
                    {lead.email   && <span style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}><Mail size={9}/>{lead.email}</span>}
                    {lead.phone   && <span style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:3 }}><Phone size={9}/>{lead.phone}</span>}
                  </div>
                </div>
                {/* Score + arrow */}
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#7C5CE8', fontFamily:'JetBrains Mono,monospace' }}>{lead.aiScore}</span>
                  <ChevronRight size={14} color={T2}/>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!query.trim() && (
            <div style={{ padding:'24px 18px' }}>
              <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Recent Leads</div>
              {leads.slice(0,5).map(lead=>{
                const st = STAGE_STYLE[lead.stage]||STAGE_STYLE['New'];
                const initials = lead.business.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                return (
                  <div key={lead.id} onClick={()=>handleOpen(lead)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:9, cursor:'pointer', transition:'background 0.1s', marginBottom:4 }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--s3)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>{initials}</div>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{lead.business}</span>
                      {lead.contact && <span style={{ fontSize:11, color:T2, marginLeft:8 }}>{lead.contact}</span>}
                    </div>
                    <span style={{ ...st, fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99 }}>{lead.stage}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 18px', borderTop:'1px solid var(--b1)', background:'rgba(0,0,0,0.15)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, color:T2 }}>Press <kbd style={{ padding:'1px 5px', borderRadius:4, background:'var(--s3)', border:'1px solid var(--b1)', fontSize:10 }}>Enter</kbd> to open first result</span>
          <span style={{ fontSize:11, color:T2 }}>{results.length ? `${results.length} found` : `${leads.length} leads`}</span>
        </div>
      </div>
    </>
  );
}
