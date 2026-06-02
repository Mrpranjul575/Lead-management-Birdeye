import { useState } from 'react';
import { Radar, Send, Edit2, Zap, Brain, TrendingUp, Users, DollarSign, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';

const SIGNALS = [
  { id:1,
    name:'Sarah Miller',     initials:'SM',
    title:'VP Marketing',    company:'TechFlow',
    lastContact:'6 mo ago',  lostReason:'Budget',
    signal:'New Signal Detected',
    signalDetail:'Viewed pricing page 3× today & downloaded "2024 AI Guide"',
    hook:`Hi Sarah, noticed you checking out our new AI features. Since budget was tight back in Q2, I thought you'd want to see our new usage-based tier that aligns perfectly with TechFlow's current scale. Worth a quick sync?`,
    signalColor:'#4edea3',
  },
  { id:2,
    name:'James Chen',       initials:'JC',
    title:'Director Ops',    company:'BuildKite',
    lastContact:'8 mo ago',  lostReason:'Timing',
    signal:'LinkedIn Activity',
    signalDetail:'Posted about struggling with pipeline visibility tools',
    hook:`James - saw your post about pipeline visibility. The timing might be better now; we just launched a unified dashboard that solves exactly the reporting bottleneck you mentioned at BuildKite. Mind if I send over a quick 2-min demo video?`,
    signalColor:'#adc6ff',
  },
  { id:3,
    name:'Emma Rodriguez',   initials:'ER',
    title:'CEO',             company:'NovaDent',
    lastContact:'5 mo ago',  lostReason:'Competitor',
    signal:'Funding Announcement',
    signalDetail:'NovaDent just raised Series B — $12M. Expansion planned.',
    hook:`Congrats on the Series B, Emma! With the expansion coming, now's a great time to lock in your AI visibility before competitors catch up. We helped 3 dental groups in similar growth phases — happy to share what worked.`,
    signalColor:'#7C5CE8',
  },
  { id:4,
    name:'Marcus Webb',      initials:'MW',
    title:'Owner',           company:'Glow Wellness',
    lastContact:'4 mo ago',  lostReason:'No Decision',
    signal:'Competitor Mention',
    signalDetail:'Engaged with Yext and Birdeye competitor content on LinkedIn',
    hook:`Hey Marcus, noticed you've been looking at some alternatives lately — totally fair. One thing I'd love to show you is how our AI visibility stack compares directly. 10 mins, no pitch — just data. Would Thursday work?`,
    signalColor:'#F59E0B',
  },
];

const TOP_SIGNALS = [
  { label:'Pricing Page Views',         sub:'14 leads active in last 24h',          color:'#4edea3'  },
  { label:'Competitor Mentions (Social)',sub:'8 leads engaging with competitors',    color:'#adc6ff'  },
  { label:'Funding Announcements',       sub:'3 lost accounts raised Series B+',     color:'#7C5CE8'  },
];

export default function ReEngage() {
  const { theme, openCopilot } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';
  const glass = dark
    ? { background:'rgba(22,27,34,0.7)', backdropFilter:'blur(12px)', border:`1px solid var(--b1)` }
    : { background:'rgba(255,255,255,0.7)', backdropFilter:'blur(12px)', border:`1px solid #E5E7EB` };

  const [editing, setEditing]   = useState(null);
  const [editText, setEditText] = useState('');
  const [sent, setSent]         = useState(new Set());

  const handleSend = (id) => { setSent(s=>new Set([...s,id])); };
  const handleEdit = (sig) => { setEditing(sig.id); setEditText(sig.hook); };

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <Radar size={22} color="#7C5CE8"/>
            <h1 style={{ fontSize:22, fontWeight:700, color:T1, margin:0, letterSpacing:'-0.02em' }}>Re-engage Pipeline</h1>
          </div>
          <p style={{ fontSize:13, color:T2, maxWidth:520, margin:0 }}>
            AI has identified 'Zombie' leads showing new intent signals. Review the generated hooks and re-engage with one click.
          </p>
        </div>

        {/* Metric cards */}
        <div style={{ display:'flex', gap:12, flexShrink:0 }}>
          <div style={{ ...glass, borderRadius:14, padding:'14px 18px', minWidth:130, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-10, right:-10, width:60, height:60, background:'rgba(239,68,68,0.1)', borderRadius:'50%', filter:'blur(16px)' }}/>
            <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Total Dead</div>
            <div style={{ fontSize:24, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', marginTop:6 }}>1,248</div>
          </div>
          <div style={{ ...glass, borderRadius:14, padding:'14px 18px', minWidth:130, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, background:'rgba(91,63,200,0.15)', borderRadius:'50%', filter:'blur(20px)' }}/>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <Zap size={11} color="#7C5CE8"/>
              <span style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em' }}>AI Opportunities</span>
            </div>
            <div style={{ fontSize:24, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', marginTop:6 }}>
              42 <span style={{ fontSize:13, fontWeight:400, color:'#10B981', marginLeft:4 }}>↑ 12%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:16, alignItems:'start' }}>

        {/* Lead cards */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* List header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 4px 10px', borderBottom:`1px solid ${B1}` }}>
            <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Lead Context</span>
            <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>AI Signal &amp; Hook</span>
          </div>

          {SIGNALS.map(sig => {
            const isSent = sent.has(sig.id);
            const isEditing = editing===sig.id;
            return (
              <div key={sig.id} style={{
                ...glass, borderRadius:14, padding:20, position:'relative', overflow:'hidden',
                opacity: isSent ? 0.6 : 1, transition:'opacity 0.3s',
              }}>
                {/* Purple gradient top line */}
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg,transparent,rgba(91,63,200,0.5),transparent)' }}/>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:20 }}>

                  {/* Left: context */}
                  <div style={{ borderRight:`1px solid ${B1}`, paddingRight:20 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{
                        width:40, height:40, borderRadius:9, flexShrink:0,
                        background: dark?'#21262D':'#F3F4F5',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:13, fontWeight:700, color:T1,
                      }}>{sig.initials}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:T1 }}>{sig.name}</div>
                        <div style={{ fontSize:11, color:T2 }}>{sig.title} @ {sig.company}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background: dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)', color:T2, border:`1px solid ${B1}` }}>
                        Last: {sig.lastContact}
                      </span>
                      <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#F87171', border:'1px solid rgba(239,68,68,0.2)' }}>
                        Lost: {sig.lostReason}
                      </span>
                    </div>
                  </div>

                  {/* Right: signal + hook */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {/* Signal */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <Radar size={14} color={sig.signalColor}/>
                      <span style={{ fontSize:10, fontWeight:700, color:sig.signalColor, textTransform:'uppercase', letterSpacing:'0.06em' }}>{sig.signal}</span>
                      <span style={{ fontSize:11, color:T2, borderLeft:`1px solid ${B1}`, paddingLeft:8 }}>{sig.signalDetail}</span>
                    </div>

                    {/* Hook — editable if editing */}
                    <div style={{
                      position:'relative', background:dark?'rgba(22,27,34,0.5)':'rgba(248,249,250,0.8)',
                      borderRadius:10, padding:12, border:`1px solid ${B1}`,
                    }}>
                      {/* Speech bubble arrow */}
                      <div style={{ position:'absolute', left:-6, top:14, width:10, height:10, background: dark?'#0D1117':'#F8F9FA', border:`1px solid ${B1}`, borderRight:'none', borderTop:'none', transform:'rotate(45deg)' }}/>
                      {isEditing
                        ? <textarea value={editText} onChange={e=>setEditText(e.target.value)} rows={4}
                            style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:12, color:T1, fontFamily:'inherit', lineHeight:1.7, resize:'none' }}/>
                        : <p style={{ fontSize:12, color:T1, lineHeight:1.7, fontStyle:'italic', margin:0 }}>"{sig.hook}"</p>
                      }
                    </div>

                    {/* Actions */}
                    <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                      {!isSent && (
                        <>
                          <button onClick={()=> isEditing ? setEditing(null) : handleEdit(sig)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                            onMouseEnter={e=>{e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)';}}
                            onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1;}}>
                            <Edit2 size={11}/> {isEditing ? 'Done' : 'Edit'}
                          </button>
                          <button onClick={()=>handleSend(sig.id)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8, border:'1px solid rgba(91,63,200,0.3)', background:'rgba(91,63,200,0.1)', color:'#7C5CE8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                            onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,63,200,0.2)';}}
                            onMouseLeave={e=>{e.currentTarget.style.background='rgba(91,63,200,0.1)';}}>
                            <Send size={11}/> Send Sequence
                          </button>
                          <button onClick={()=>openCopilot('email', null)}
                            style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 10px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:'#7C5CE8', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
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

        {/* Right: Intelligence Brief */}
        <div style={{ ...glass, borderRadius:14, overflow:'hidden', position:'relative' }}>
          <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, background:'rgba(91,63,200,0.08)', borderRadius:'50%', filter:'blur(30px)', pointerEvents:'none' }}/>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'14px 16px', borderBottom:`1px solid ${B1}`, background: dark?'rgba(22,27,34,0.5)':'rgba(255,255,255,0.5)' }}>
            <Brain size={16} color="#7C5CE8"/>
            <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Intelligence Brief</span>
          </div>
          <div style={{ padding:'16px' }}>

            {/* Top signals */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Top Signals Today</div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {TOP_SIGNALS.map(({ label, sub, color })=>(
                  <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:color, flexShrink:0, marginTop:5 }}/>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500, color:T1 }}>{label}</div>
                      <div style={{ fontSize:10, color:T2, marginTop:1 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Copilot suggestion */}
            <div style={{ padding:'12px', borderRadius:10, background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', border:`1px solid ${B1}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <Zap size={12} color={T2}/>
                <span style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Copilot Suggestion</span>
              </div>
              <p style={{ fontSize:12, color:T1, lineHeight:1.6, margin:0 }}>
                Consider running a bulk sequence for the <span style={{ color:'#7C5CE8', fontWeight:600 }}>14 leads</span> viewing pricing. I've drafted a template highlighting our new flexible payment options.
              </p>
              <button style={{ marginTop:10, width:'100%', padding:'7px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T1, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background=dark?'#21262D':'#F3F4F5'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                Review Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
