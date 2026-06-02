import { useState, useMemo } from 'react';
import { Radar, Send, Edit2, Zap, Brain, GitBranch } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { INTENT_STYLE } from '../constants/stages';
import { isConfirmed } from '../data/schema';

// ── Derive a signal label + detail from existing lead fields ──────────────────
function deriveSignal(lead) {
  // Phase 7C-2C: read confirmed competitors from accountKnowledge (authoritative).
  // Fall back to deprecated intelligence.competitors then lead.competitor (import field).
  const confirmedAKComps = (lead.accountKnowledge?.competitors || []).filter(isConfirmed);
  const intel = lead.intelligence || {};
  const competitor = confirmedAKComps[0]?.name
    || intel.competitors?.[0]
    || lead.competitor
    || null;

  if (competitor) {
    return {
      label:  'Competitor Active',
      detail: `${competitor} may be gaining ground while ${lead.business} is cold`,
      color:  '#F59E0B',
    };
  }
  if (lead.intent === 'AI Visibility') {
    return {
      label:  'AI Visibility Gap',
      detail: `${lead.aiVisibility ?? 0}% visibility — well below the ~35% industry average`,
      color:  '#7C5CE8',
    };
  }
  if (lead.intent === 'Review Growth') {
    return {
      label:  'Review Volume Gap',
      detail: `${lead.reviews ?? 0} reviews — below competitive threshold for ${lead.industry || 'this industry'}`,
      color:  '#60A5FA',
    };
  }
  if (lead.intent === 'Listings') {
    return {
      label:  'Listings Incomplete',
      detail: `Business listings may be inconsistent or missing in key directories`,
      color:  '#34D399',
    };
  }
  return {
    label:  'Gone Cold',
    detail: `Last touch: ${lead.lastTouch || 'Unknown'} — no recent engagement`,
    color:  '#8B949E',
  };
}

export default function ReEngage() {
  const { leads, updateLead, openCopilot } = useApp();
  const { dark, T1, T2, B1, S1, S2 } = useTheme();

  const glass = dark
    ? { background:'rgba(22,27,34,0.7)', backdropFilter:'blur(12px)', border:`1px solid ${B1}` }
    : { background:'rgba(255,255,255,0.7)', backdropFilter:'blur(12px)', border:`1px solid #E5E7EB` };

  // ── Local UI state ────────────────────────────────────────────────────────
  const [editing,  setEditing]  = useState(null);   // lead.id being edited
  const [editText, setEditText] = useState('');
  const [sent,     setSent]     = useState(new Set()); // lead ids with sent sequence

  // ── Live data ─────────────────────────────────────────────────────────────
  const reEngageLeads = useMemo(
    () => leads.filter(l => l.stage === 'Re-engage'),
    [leads]
  );

  // Intent breakdown for Intelligence Brief
  const intentBreakdown = useMemo(() => {
    const counts = {};
    reEngageLeads.forEach(l => {
      const intent = l.intent || 'Other';
      counts[intent] = (counts[intent] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => ({
        intent,
        count,
        style: INTENT_STYLE[intent] || { bg:'rgba(139,148,158,0.15)', color:'#8B949E' },
      }));
  }, [reEngageLeads]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSend = (lead) => {
    // Update lastTouch + nextAction; stage stays unchanged per requirements
    updateLead(lead.id, {
      lastTouch:  'Just now',
      nextAction: 'Re-engage sequence sent',
    });
    setSent(s => new Set([...s, lead.id]));
  };

  const handleEdit = (lead) => {
    const sig = deriveSignal(lead);
    setEditing(lead.id);
    setEditText(`Hi ${lead.contact?.split(' ')[0] || lead.business},\n\nNoticed ${lead.business} has been quiet for a while. Given your ${lead.intent || 'interest'}, I wanted to share a quick update that might be relevant.\n\n${sig.detail}.\n\nWorth a quick 10-min call? — Paul | Birdeye`);
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (reEngageLeads.length === 0) {
    return (
      <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>
        {/* Header */}
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Radar size={22} color="#7C5CE8"/>
            <h1 style={{ fontSize:22, fontWeight:700, color:T1, margin:0, letterSpacing:'-0.02em' }}>Re-engage Pipeline</h1>
          </div>
          <p style={{ fontSize:13, color:T2, maxWidth:520, margin:0 }}>
            Leads that have gone cold and need a fresh touch to restart the conversation.
          </p>
        </div>
        {/* Empty state */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'60px', textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:14 }}>💤</div>
          <div style={{ fontSize:15, fontWeight:600, color:T1, marginBottom:6 }}>No re-engage leads right now</div>
          <div style={{ fontSize:12, color:T2 }}>Leads will appear here when their stage is set to <strong style={{ color:'#FB923C' }}>Re-engage</strong>.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Radar size={22} color="#7C5CE8"/>
            <h1 style={{ fontSize:22, fontWeight:700, color:T1, margin:0, letterSpacing:'-0.02em' }}>Re-engage Pipeline</h1>
          </div>
          <p style={{ fontSize:13, color:T2, maxWidth:520, margin:0 }}>
            Leads that have gone cold and need a fresh touch. Review, edit the hook, and send a sequence.
          </p>
        </div>

        {/* ── KPI cards — live ── */}
        <div style={{ display:'flex', gap:12, flexShrink:0 }}>
          <div style={{ ...glass, borderRadius:14, padding:'14px 18px', minWidth:130, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-10, right:-10, width:60, height:60, background:'rgba(251,146,60,0.1)', borderRadius:'50%', filter:'blur(16px)' }}/>
            <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Re-engage Leads</div>
            <div style={{ fontSize:24, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', marginTop:6 }}>{reEngageLeads.length}</div>
          </div>
          <div style={{ ...glass, borderRadius:14, padding:'14px 18px', minWidth:130, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, background:'rgba(91,63,200,0.15)', borderRadius:'50%', filter:'blur(20px)' }}/>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Zap size={11} color="#7C5CE8"/>
              <span style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em' }}>AI Opportunities</span>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', marginTop:6 }}>
              {reEngageLeads.length}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

        {/* ── Lead cards ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Column header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 4px 10px', borderBottom:`1px solid ${B1}` }}>
            <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Lead Context</span>
            <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Signal &amp; Hook</span>
          </div>

          {reEngageLeads.map(lead => {
            const isSent    = sent.has(lead.id);
            const isEditing = editing === lead.id;
            const sig       = deriveSignal(lead);
            const intel     = lead.intelligence || {};
            const initials  = lead.business.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const context   = intel.objections?.[0] || lead.aeNotes?.slice(0, 80) || null;
            const intentSty = INTENT_STYLE[lead.intent] || INTENT_STYLE['AI Visibility'];

            return (
              <div key={lead.id} style={{
                ...glass, borderRadius:14, padding:20,
                position:'relative', overflow:'hidden',
                opacity: isSent ? 0.6 : 1, transition:'opacity 0.3s',
              }}>
                {/* Top gradient line */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(91,63,200,0.5),transparent)' }}/>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:20 }}>

                  {/* Left: lead context */}
                  <div style={{ borderRight:`1px solid ${B1}`, paddingRight:20 }}>

                    {/* Avatar + name */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{
                        width:40, height:40, borderRadius:9, flexShrink:0,
                        background:'linear-gradient(135deg,#5B3FC8,#3B82F6)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:13, fontWeight:700, color:'#fff',
                      }}>{initials}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:T1 }}>{lead.business}</div>
                        <div style={{ fontSize:11, color:T2 }}>{lead.contact || '—'}{lead.city ? ` · ${lead.city}` : ''}</div>
                      </div>
                    </div>

                    {/* Meta chips */}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)', color:T2, border:`1px solid ${B1}` }}>
                        Last: {lead.lastTouch || 'Unknown'}
                      </span>
                      <span style={{ ...intentSty, fontSize:10, fontWeight:500, padding:'2px 8px', borderRadius:99 }}>
                        {lead.intent}
                      </span>
                      {lead.aiScore != null && (
                        <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:'rgba(91,63,200,0.12)', color:'#7C5CE8' }}>
                          Score: {lead.aiScore}
                        </span>
                      )}
                    </div>

                    {/* Context note if available */}
                    {context && (
                      <div style={{ marginTop:8, fontSize:10, color:T2, lineHeight:1.5, fontStyle:'italic' }}>
                        "{context}{context.length >= 80 ? '…' : ''}"
                      </div>
                    )}
                  </div>

                  {/* Right: signal + hook + actions */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

                    {/* Signal row */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <Radar size={14} color={sig.color}/>
                      <span style={{ fontSize:10, fontWeight:700, color:sig.color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{sig.label}</span>
                      <span style={{ fontSize:11, color:T2, borderLeft:`1px solid ${B1}`, paddingLeft:8 }}>{sig.detail}</span>
                    </div>

                    {/* Hook box — editable */}
                    <div style={{
                      position:'relative',
                      background:dark?'rgba(22,27,34,0.5)':'rgba(248,249,250,0.8)',
                      borderRadius:10, padding:12, border:`1px solid ${B1}`,
                    }}>
                      {/* Speech bubble arrow */}
                      <div style={{ position:'absolute', left:-6, top:14, width:10, height:10, background:dark?'#0D1117':'#F8F9FA', border:`1px solid ${B1}`, borderRight:'none', borderTop:'none', transform:'rotate(45deg)' }}/>
                      {isEditing
                        ? <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={5}
                            style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:12, color:T1, fontFamily:'inherit', lineHeight:1.7, resize:'none' }}/>
                        : <p style={{ fontSize:12, color:T1, lineHeight:1.7, fontStyle:'italic', margin:0 }}>
                            "Use AI Copilot to generate a personalised re-engagement message for {lead.business}."
                          </p>
                      }
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                      {!isSent && (
                        <>
                          <button
                            onClick={() => isEditing ? setEditing(null) : handleEdit(lead)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                            onMouseEnter={e=>{ e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)'; }}
                            onMouseLeave={e=>{ e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1; }}>
                            <Edit2 size={11}/> {isEditing ? 'Done' : 'Draft Hook'}
                          </button>
                          <button
                            onClick={() => handleSend(lead)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8, border:'1px solid rgba(91,63,200,0.3)', background:'rgba(91,63,200,0.1)', color:'#7C5CE8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(91,63,200,0.2)'; }}
                            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(91,63,200,0.1)'; }}>
                            <Send size={11}/> Send Sequence
                          </button>
                          <button
                            onClick={() => openCopilot('email', lead)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:'#7C5CE8', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}
                            title="Generate re-engage email with AI Copilot">
                            <Zap size={11}/>
                          </button>
                        </>
                      )}
                      {isSent && (
                        <span style={{ fontSize:11, color:'#10B981', fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                          ✓ Sequence Sent
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Intelligence Brief (right panel) ── */}
        <div style={{ ...glass, borderRadius:14, overflow:'hidden', position:'relative' }}>
          <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, background:'rgba(91,63,200,0.08)', borderRadius:'50%', filter:'blur(30px)', pointerEvents:'none' }}/>

          {/* Panel header */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 16px', borderBottom:`1px solid ${B1}`, background:dark?'rgba(22,27,34,0.5)':'rgba(255,255,255,0.5)' }}>
            <Brain size={16} color="#7C5CE8"/>
            <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Intelligence Brief</span>
          </div>

          <div style={{ padding:'16px' }}>

            {/* Intent breakdown — live from real leads */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Re-engage by Intent</div>
              {intentBreakdown.length === 0 ? (
                <div style={{ fontSize:11, color:T2, fontStyle:'italic' }}>No data yet</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {intentBreakdown.map(({ intent, count, style }) => (
                    <div key={intent} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:style.color, flexShrink:0, marginTop:5 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ fontSize:12, fontWeight:500, color:T1 }}>{intent}</div>
                          <span style={{ fontSize:11, fontWeight:700, color:style.color, fontFamily:'JetBrains Mono,monospace' }}>{count}</span>
                        </div>
                        <div style={{ height:3, background:'var(--b1)', borderRadius:99, marginTop:4, overflow:'hidden' }}>
                          <div style={{ height:3, width:`${(count / reEngageLeads.length) * 100}%`, background:style.color, borderRadius:99, transition:'width 0.4s ease' }}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Copilot suggestion — live count */}
            <div style={{ padding:'12px', borderRadius:10, background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', border:`1px solid ${B1}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <GitBranch size={12} color={T2}/>
                <span style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Copilot Suggestion</span>
              </div>
              <p style={{ fontSize:12, color:T1, lineHeight:1.6, margin:0 }}>
                You have <span style={{ color:'#7C5CE8', fontWeight:600 }}>{reEngageLeads.length} lead{reEngageLeads.length !== 1 ? 's' : ''}</span> in re-engage. Use the Zap button on each card to generate a personalised re-engagement email via AI Copilot.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
