import { STAGE_STYLE, INTENT_STYLE } from '../constants/stages';
import MyLeads from './MyLeads';
import NextBestStep from '../components/NextBestStep';
import { useApp } from '../context/AppContext';

// Temporarily override leads in context with filtered subset
// We do this by wrapping MyLeads with a filter prop concept
// Since MyLeads uses useApp directly, we create a thin wrapper per filter

export function HotLeads()    { return <FilteredView stage="Hot"         title="Hot Leads"   sub="High-priority leads requiring immediate action" emoji="🔥"/>; }
export function FollowUps()   { return <FilteredView stage="Follow Up"   title="Follow Ups"  sub="Leads due for follow up today" emoji="🔄"/>; }
export function DemoBooked()  { return <FilteredView stage="Demo Booked" title="Demo Booked" sub="Demos scheduled — prep your pitch" emoji="📅"/>; }
export function ReEngage()    { return <FilteredView stage="Re-engage"   title="Re-engage"   sub="Cold leads — time to restart outreach" emoji="💬"/>; }

function FilteredView({ stage, title, sub, emoji }) {
  const { theme, leads, openLead, selected, toggleSelect, selectAll, clearSelect, bulkUpdateStage } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S3=dark?'#21262D':'#F3F4F5';

  const filtered = leads.filter(l=>l.stage===stage);

  const STAGE_STYLE = {
    'Hot':         { bg:'rgba(239,68,68,0.15)',  color:'#F87171' },
    'Contacted':   { bg:'rgba(245,158,11,0.15)', color:'#FCD34D' },
    'Demo Booked': { bg:'rgba(91,63,200,0.18)',  color:'#7C5CE8' },
    'Follow Up':   { bg:'rgba(56,189,248,0.15)', color:'#38BDF8' },
    'Re-engage':   { bg:'rgba(251,146,60,0.15)', color:'#FB923C' },
  };
  const INTENT_STYLE = {
    'AI Visibility': { bg:'rgba(91,63,200,0.15)', color:'#7C5CE8' },
    'Review Growth': { bg:'rgba(59,130,246,0.15)',color:'#60A5FA' },
    'Listings':      { bg:'rgba(16,185,129,0.15)',color:'#34D399' },
  };

  const allIds = filtered.map(l=>l.id);
  const allSel = allIds.length>0 && allIds.every(id=>selected.has(id));
  const GRID = '1fr 100px 56px 80px 80px 90px 110px 36px';

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>{emoji} {title}</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>{sub} · {filtered.length} leads</p>
        </div>
      </div>

      {/* Empty state */}
      {filtered.length===0 ? (
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'60px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>{emoji}</div>
          <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:6 }}>No {title} right now</div>
          <div style={{ fontSize:12, color:T2 }}>Leads will appear here when their stage is set to "{stage}"</div>
        </div>
      ) : (
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, overflow:'hidden' }}>
          {/* Bulk bar */}
          {selected.size>0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', background:'rgba(91,63,200,0.1)', borderBottom:`1px solid ${B1}` }}>
              <span style={{ fontSize:12, fontWeight:600, color:'#7C5CE8' }}>{selected.size} selected</span>
              {['Hot','Follow Up','Demo Booked','Nurturing','Lost','Converted'].map(s=>(
                <button key={s} onClick={()=>bulkUpdateStage(s)} style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'none', background:'rgba(91,63,200,0.2)', color:'#7C5CE8', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>→ {s}</button>
              ))}
              <button onClick={clearSelect} style={{ marginLeft:'auto', fontSize:11, color:T2, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Clear</button>
            </div>
          )}

          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:`28px ${GRID}`, gap:8, padding:'8px 16px', background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', borderBottom:`1px solid ${B1}`, alignItems:'center' }}>
            <input type="checkbox" checked={allSel} onChange={e=>e.target.checked?selectAll(allIds):clearSelect()} style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
            {['Business','Intent','Score','Reviews','AI Vis.','Last Touch','Next Action',''].map(h=>(
              <div key={h} style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</div>
            ))}
          </div>

          {/* Rows */}
          {filtered.map(lead=>{
            const stg  = STAGE_STYLE[lead.stage]||{bg:'rgba(59,130,246,0.15)',color:'#60A5FA'};
            const itnt = INTENT_STYLE[lead.intent]||INTENT_STYLE['AI Visibility'];
            const isSel = selected.has(lead.id);
            const scoreColor = lead.aiScore>=80?'#10B981':lead.aiScore>=65?'#F59E0B':'#EF4444';
            return (
              <div key={lead.id} onClick={()=>openLead(lead)}
                style={{ display:'grid', gridTemplateColumns:`28px ${GRID}`, gap:8, padding:'10px 16px', borderBottom:`1px solid ${dark?'rgba(48,54,61,0.5)':'#F3F4F5'}`, alignItems:'center', background:isSel?'rgba(91,63,200,0.07)':'transparent', cursor:'pointer', transition:'background 0.1s' }}
                onMouseEnter={e=>{ if(!isSel) e.currentTarget.style.background=dark?'rgba(255,255,255,0.025)':'rgba(0,0,0,0.02)'; }}
                onMouseLeave={e=>{ if(!isSel) e.currentTarget.style.background='transparent'; }}>
                <div onClick={e=>{e.stopPropagation();toggleSelect(lead.id);}}>
                  <input type="checkbox" checked={isSel} onChange={()=>{}} style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{lead.business}</div>
                  <div style={{ fontSize:10, color:T2, fontFamily:'JetBrains Mono,monospace', marginTop:1 }}>{lead.email}</div>
                </div>
                <div><span style={{ ...itnt, padding:'2px 7px', borderRadius:99, fontSize:10, fontWeight:500 }}>{lead.intent}</span></div>
                <div style={{ fontSize:11, fontWeight:700, color:scoreColor, fontFamily:'JetBrains Mono,monospace' }}>{lead.aiScore}</div>
                <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{lead.reviews}</div>
                <div style={{ fontSize:11, fontWeight:600, color:lead.aiVisibility<15?'#EF4444':lead.aiVisibility<25?'#F59E0B':'#10B981' }}>{lead.aiVisibility}%</div>
                <div style={{ fontSize:10, color:T2 }}>{lead.lastTouch}</div>
                <div><NextBestStep lead={lead} compact/></div>
                <div/>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
