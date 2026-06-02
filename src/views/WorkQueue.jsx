import { useState, useMemo } from 'react';
import {
  Flame, RefreshCw, CalendarCheck, MessageSquare,
  RotateCcw, CheckCircle2, SlidersHorizontal, Filter,
  MoreHorizontal, Clock, ChevronDown, Settings2
} from 'lucide-react';
import { STAGE_STYLE, INTENT_STYLE } from '../constants/stages';
import ScoreRing from '../components/ui/ScoreRing';
import NextBestStep from '../components/NextBestStep';
import { useApp } from '../context/AppContext';

/* ─── Stage colors ─── */
const STAGE = {
  'Hot':         { bg:'rgba(239,68,68,0.15)',  color:'#F87171' },
  'Contacted':   { bg:'rgba(245,158,11,0.15)', color:'#FCD34D' },
  'Demo Booked': { bg:'rgba(91,63,200,0.18)',  color:'#7C5CE8' },
  'Converted':   { bg:'rgba(16,185,129,0.15)', color:'#34D399' },
  'Lost':        { bg:'rgba(239,68,68,0.15)',  color:'#F87171' },
  'Follow Up':   { bg:'rgba(56,189,248,0.15)', color:'#38BDF8' },
  'Nurturing':   { bg:'rgba(236,72,153,0.15)', color:'#F472B6' },
  'New':         { bg:'rgba(59,130,246,0.15)', color:'#60A5FA' },
  'Re-engage':   { bg:'rgba(251,146,60,0.15)', color:'#FB923C' },
};

/* ─── Intent colors ─── */
const INTENT = {
  'AI Visibility': { bg:'rgba(91,63,200,0.15)',  color:'#7C5CE8' },
  'Review Growth': { bg:'rgba(59,130,246,0.15)', color:'#60A5FA' },
  'Listings':      { bg:'rgba(16,185,129,0.15)', color:'#34D399' },
};


/* ─── Stat card ─── */
function StatCard({ label, value, sub, icon:Icon, ic, ib, onFilter, active, informational }) {
  return (
    <div
      onClick={informational ? undefined : onFilter}
      style={{
        background:'var(--s1)',
        border: active ? `1px solid ${ic}` : '1px solid var(--b1)',
        borderRadius:12, padding:'14px 16px',
        cursor: informational ? 'default' : 'pointer',
        transition:'border-color 0.15s',
        display:'flex', flexDirection:'column', gap:0,
        opacity: informational ? 0.75 : 1,
      }}
      onMouseEnter={e => { if (!informational && !active) e.currentTarget.style.borderColor=ic; }}
      onMouseLeave={e => { if (!informational && !active) e.currentTarget.style.borderColor='var(--b1)'; }}>
      <div style={{ width:30, height:30, borderRadius:8, background:ib,
        display:'flex', alignItems:'center', justifyContent:'center', marginBottom:10 }}>
        <Icon size={14} color={ic}/>
      </div>
      <div style={{ fontSize:28, fontWeight:700, color:'var(--t1)', lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:600, color:ic, marginTop:5 }}>{label}</div>
      <div style={{ fontSize:10, color:'var(--t2)', marginTop:2 }}>{sub}</div>
      {!informational && (
        <div style={{ fontSize:10, color: active ? ic : 'var(--p-glow)', marginTop:10 }}>
          {active ? '● Filtered' : 'View leads →'}
        </div>
      )}
    </div>
  );
}

export default function WorkQueue() {
  const { leads, selected, toggleSelect, selectAll, clearSelect, bulkUpdateStage, openLead, search } = useApp();
  const [activeFilter, setActiveFilter] = useState('all');

  /* ── Live stat counts ── */
  const hotCount        = useMemo(() => leads.filter(l => l.stage === 'Hot').length,         [leads]);
  const followUpCount   = useMemo(() => leads.filter(l => l.stage === 'Follow Up').length,   [leads]);
  const demoCount       = useMemo(() => leads.filter(l => l.stage === 'Demo Booked').length, [leads]);
  const noResponseCount = useMemo(() => leads.filter(l => l.stage === 'Contacted').length,   [leads]);
  const reEngageCount   = useMemo(() => leads.filter(l => l.stage === 'Re-engage').length,   [leads]);
  const convertedCount  = useMemo(() => leads.filter(l => l.stage === 'Converted').length,   [leads]);

  /* ── Stat card definitions (derived) ── */
  const STATS = useMemo(() => [
    { label:'Hot Leads',       value:hotCount,        sub:'High priority',  icon:Flame,         ic:'#EF4444', ib:'rgba(239,68,68,0.12)',   filterId:'hot'         },
    { label:'Follow Ups Due',  value:followUpCount,   sub:'Due today',      icon:RefreshCw,     ic:'#F59E0B', ib:'rgba(245,158,11,0.12)',  filterId:'followup'    },
    { label:'Demos to Book',   value:demoCount,       sub:'Ready to book',  icon:CalendarCheck, ic:'#7C5CE8', ib:'rgba(91,63,200,0.15)',   filterId:'demos'       },
    { label:'No Response',     value:noResponseCount, sub:'Awaiting reply', icon:MessageSquare, ic:'#38BDF8', ib:'rgba(56,189,248,0.12)',  filterId:'noresponse'  },
    { label:'Re-engage',       value:reEngageCount,   sub:'Cold > 7 days',  icon:RotateCcw,     ic:'#F472B6', ib:'rgba(236,72,153,0.12)',  filterId:'reengage'    },
    { label:'Converted',       value:convertedCount,  sub:'All time',       icon:CheckCircle2,  ic:'#10B981', ib:'rgba(16,185,129,0.12)',  filterId:null          },
  ], [hotCount, followUpCount, demoCount, noResponseCount, reEngageCount, convertedCount]);

  /* ── Filter tab definitions (derived) ── */
  const FILTERS = useMemo(() => [
    { id:'all',        label:'All Leads',   count:leads.length  },
    { id:'hot',        label:'Hot',         count:hotCount      },
    { id:'followup',   label:'Follow Ups',  count:followUpCount },
    { id:'noresponse', label:'No Response', count:noResponseCount },
    { id:'reengage',   label:'Re-engage',   count:reEngageCount },
    { id:'demos',      label:'Demos',       count:demoCount     },
  ], [leads.length, hotCount, followUpCount, noResponseCount, reEngageCount, demoCount]);

  /* filter + search */
  const filtered = leads.filter(l => {
    if (search) {
      const q = search.toLowerCase();
      if (!l.business.toLowerCase().includes(q) && !l.contact?.toLowerCase().includes(q)) return false;
    }
    if (activeFilter === 'hot'        && l.stage !== 'Hot')         return false;
    if (activeFilter === 'followup'   && l.stage !== 'Follow Up')   return false;
    if (activeFilter === 'noresponse' && l.stage !== 'Contacted') return false;
    if (activeFilter === 'reengage'   && l.stage !== 'Re-engage')   return false;
    if (activeFilter === 'demos'      && l.stage !== 'Demo Booked') return false;
    return true;
  });

  const allIds  = filtered.map(l => l.id);
  const allSel  = allIds.length > 0 && allIds.every(id => selected.has(id));

  /* shared style shortcuts */
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  /* table column widths — matches screen proportions */
  const COLS = '28px minmax(0,1.8fr) 100px 56px 80px 90px 80px minmax(0,1fr) 90px 90px 28px';

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ── Page header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>Work Queue</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>Your action center for today</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button className="btn-ghost">May 30, 2025 <ChevronDown size={11}/></button>
          <button className="btn-ghost">All Queues <ChevronDown size={11}/></button>
          <button className="btn-ghost"><SlidersHorizontal size={11}/> Customize</button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12 }}>
        {STATS.map(s => (
          <StatCard
            key={s.label}
            {...s}
            active={s.filterId !== null && activeFilter === s.filterId}
            informational={s.filterId === null}
            onFilter={s.filterId ? () => setActiveFilter(s.filterId) : undefined}
          />
        ))}
      </div>

      {/* ── Lead table ── */}
      <div style={{ background:'var(--s1)', border:'1px solid var(--b1)', borderRadius:12, overflow:'hidden' }}>

        {/* Filter + toolbar row */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'10px 14px', borderBottom:`1px solid ${B1}`,
        }}>
          {/* Left: filter tabs */}
          <div style={{ display:'flex', alignItems:'center', gap:2, flexWrap:'wrap' }}>
            {FILTERS.map(f => {
              const active = activeFilter === f.id;
              return (
                <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
                  display:'flex', alignItems:'center', gap:5,
                  padding:'5px 10px', borderRadius:8, border:'none', cursor:'pointer',
                  background: active ? 'var(--p)' : 'transparent',
                  color: active ? '#fff' : T2,
                  fontSize:11, fontWeight: active ? 600 : 400,
                  fontFamily:'inherit', transition:'all 0.12s',
                  borderBottom: active ? 'none' : '2px solid transparent',
                }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background='var(--s3)'; e.currentTarget.style.color=T1; }}}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T2; }}}>
                  {f.label}
                  <span style={{ fontSize:10, opacity:0.65 }}>{f.count}</span>
                </button>
              );
            })}
          </div>

          {/* Right: dropdowns + gear */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:10 }}>All Owners <ChevronDown size={10}/></button>
            <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:10 }}>All Intents <ChevronDown size={10}/></button>
            <button className="btn-ghost" style={{ padding:'4px 10px', fontSize:10 }}>More Filters <ChevronDown size={10}/></button>
            <button className="btn-ghost" style={{ padding:'4px 7px', fontSize:10 }}><Settings2 size={12}/></button>
          </div>
        </div>

        {/* ── Bulk action bar (slides in when rows selected) ── */}
        {selected.size > 0 && (
          <div style={{
            display:'flex', alignItems:'center', gap:10, padding:'7px 14px',
            background:'rgba(91,63,200,0.1)', borderBottom:`1px solid var(--b1)`,
          }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#7C5CE8' }}>{selected.size} selected</span>
            <div style={{ display:'flex', gap:6 }}>
              {['Hot','Follow Up','Demo Booked','Nurturing','Lost'].map(s => (
                <button key={s} onClick={() => bulkUpdateStage(s)} style={{
                  fontSize:10, padding:'3px 10px', borderRadius:99, border:'none',
                  background:'rgba(91,63,200,0.2)', color:'#7C5CE8',
                  cursor:'pointer', fontFamily:'inherit', fontWeight:500,
                  transition:'background 0.12s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(91,63,200,0.35)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(91,63,200,0.2)'}>
                  → {s}
                </button>
              ))}
            </div>
            <button onClick={clearSelect} style={{
              marginLeft:'auto', fontSize:11, color:T2,
              background:'none', border:'none', cursor:'pointer', fontFamily:'inherit',
            }}
              onMouseEnter={e => e.currentTarget.style.color='#EF4444'}
              onMouseLeave={e => e.currentTarget.style.color=T2}>
              Clear
            </button>
          </div>
        )}

        {/* ── Table header ── */}
        <div style={{
          display:'grid', gridTemplateColumns:COLS, gap:8,
          padding:'8px 14px', borderBottom:`1px solid ${B1}`,
          background:'rgba(0,0,0,0.18)', alignItems:'center',
        }}>
          {/* Select-all checkbox */}
          <div>
            <input type="checkbox" checked={allSel}
              onChange={e => e.target.checked ? selectAll(allIds) : clearSelect()}
              style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
          </div>
          {['Business','Intent','AI Score','Reviews','AI Visibility','Comp. Gap','Next Action','Last Touch','Status',''].map((h,i) => (
            <div key={i} style={{
              fontSize:10, fontWeight:600, color:T2,
              textTransform:'uppercase', letterSpacing:'0.04em',
            }}>{h}</div>
          ))}
        </div>

        {/* ── Rows ── */}
        <div>
          {filtered.map(lead => {
            const stageStyle  = STAGE[lead.stage]  || STAGE['New'];
            const intentStyle = INTENT[lead.intent] || INTENT['AI Visibility'];
            const isSel       = selected.has(lead.id);

            return (
              <div key={lead.id}
                onClick={() => openLead(lead)}
                style={{
                  display:'grid', gridTemplateColumns:COLS, gap:8,
                  padding:'9px 14px',
                  borderBottom:`1px solid rgba(48,54,61,0.5)`,
                  background: isSel ? 'rgba(91,63,200,0.08)' : 'transparent',
                  alignItems:'center', cursor:'pointer',
                  transition:'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background='rgba(255,255,255,0.025)'; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background='transparent'; }}>

                {/* Checkbox */}
                <div onClick={e => { e.stopPropagation(); toggleSelect(lead.id); }}>
                  <input type="checkbox" checked={isSel} onChange={() => {}}
                    style={{ width:13, height:13, accentColor:'#5B3FC8', cursor:'pointer' }}/>
                </div>

                {/* Business name + email */}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {lead.business}
                  </div>
                  <div style={{ fontSize:10, color:T2, fontFamily:'JetBrains Mono,monospace', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {lead.email}
                  </div>
                </div>

                {/* Intent badge */}
                <div>
                  <span style={{ ...intentStyle, padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:500 }}>
                    {lead.intent}
                  </span>
                </div>

                {/* AI Score ring */}
                <div><ScoreRing score={lead.aiScore}/></div>

                {/* Reviews */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:T1 }}>{lead.reviews}</div>
                  <div style={{ fontSize:10, color:T2 }}>★ {lead.rating}</div>
                </div>

                {/* AI Visibility */}
                <div>
                  <div style={{
                    fontSize:11, fontWeight:600,
                    color: lead.aiVisibility < 15 ? '#EF4444' : lead.aiVisibility < 25 ? '#F59E0B' : '#10B981',
                  }}>↓ {lead.aiVisibility}%</div>
                  <div style={{ height:3, width:44, borderRadius:99, background:'var(--b1)', marginTop:4 }}>
                    <div style={{ height:3, borderRadius:99, background:'var(--p)', width:`${Math.min(lead.aiVisibility*3,100)}%`, transition:'width 0.3s' }}/>
                  </div>
                </div>

                {/* Comp Gap */}
                <div style={{
                  fontSize:11, fontWeight:600,
                  color: lead.compGap==='High' ? '#EF4444' : lead.compGap==='Medium' ? '#F59E0B' : '#10B981',
                }}>
                  {lead.compGap}
                </div>

                {/* Next Action */}
                <div>
                  <NextBestStep lead={lead} compact/>
                </div>

                {/* Last Touch */}
                <div style={{ fontSize:10, color:T2, display:'flex', alignItems:'center', gap:4 }}>
                  <Clock size={9}/> {lead.lastTouch}
                </div>

                {/* Status pill */}
                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                  <span style={{
                    ...stageStyle, padding:'2px 8px', borderRadius:99,
                    fontSize:10, fontWeight:600, width:'fit-content',
                  }}>
                    {lead.stage === 'Hot' ? '🔥 ' : ''}{lead.stage}
                  </span>
                </div>

                {/* ••• menu */}
                <div onClick={e => e.stopPropagation()}>
                  <button style={{
                    padding:3, borderRadius:5, border:'none', background:'transparent',
                    cursor:'pointer', color:T2, display:'flex', alignItems:'center',
                  }}
                    onMouseEnter={e => e.currentTarget.style.color=T1}
                    onMouseLeave={e => e.currentTarget.style.color=T2}>
                    <MoreHorizontal size={14}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Table footer / pagination ── */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'8px 14px', borderTop:`1px solid ${B1}`,
          background:'rgba(0,0,0,0.15)',
        }}>
          <span style={{ fontSize:11, color:T2 }}>{filtered.length} leads</span>
          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
            {['1','2','3','…','12'].map(p => (
              <button key={p} style={{
                width:24, height:24, borderRadius:6, border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:11,
                background: p==='1' ? 'var(--p)' : 'transparent',
                color: p==='1' ? '#fff' : T2,
                transition:'background 0.12s, color 0.12s',
              }}
                onMouseEnter={e => { if (p!=='1') e.currentTarget.style.background='var(--s3)'; }}
                onMouseLeave={e => { if (p!=='1') e.currentTarget.style.background='transparent'; }}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
