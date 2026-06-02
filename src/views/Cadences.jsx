import { useState } from 'react';
import { Plus, Mail, MessageSquare, Mic, Link2, Zap, Edit2, Trash2,
         ChevronDown, CheckCircle2, GitBranch, Copy, Search,
         MoreHorizontal, AlertTriangle, X, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';

const CHANNEL_META = {
  Email:     { icon:Mail,          color:'#7C5CE8', bg:'rgba(91,63,200,0.15)',   label:'Email'     },
  SMS:       { icon:MessageSquare, color:'#adc6ff', bg:'rgba(173,198,255,0.12)', label:'SMS'       },
  Voicemail: { icon:Mic,           color:'#F59E0B', bg:'rgba(245,158,11,0.12)',  label:'Voicemail' },
  LinkedIn:  { icon:Link2,         color:'#0A66C2', bg:'rgba(10,102,194,0.15)',  label:'LinkedIn'  },
  Call:      { icon:Mic,           color:'#4edea3', bg:'rgba(78,222,163,0.12)',  label:'Call'      },
};

const IF_THEN_OPTIONS = ['Replied','No Reply','Bounced','Opened','Clicked','LinkedIn Accepted','Demo Booked'];
const IF_THEN_ACTIONS = ['Move to Demo Booked','Add to Nurture','Stop Sequence','Send Email Follow-up','Notify SDR','Move to Re-engage'];

const IF_COLORS = {
  'Replied':           '#10B981', 'LinkedIn Accepted': '#10B981',
  'No Reply':          '#F59E0B', 'Opened':            '#3B82F6',
  'Bounced':           '#EF4444', 'Demo Booked':       '#7C5CE8',
  'Clicked':           '#3B82F6',
};

// ── Canvas step node ──
function StepNode({ step, idx, isActive, onClick, onDelete, dark, stats }) {
  const ch = CHANNEL_META[step.channel] || CHANNEL_META.Email;
  const Icon = ch.icon;
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';

  return (
    <div style={{ position:'relative', marginBottom:32 }}>
      {/* Vertical connector */}
      {true && (
        <div style={{ position:'absolute', left:20, top:48, bottom:-32, width:2, background:'var(--b1)', zIndex:0 }}/>
      )}
      {/* Step number bubble */}
      <div style={{
        position:'absolute', left:0, top:16, width:40, height:40, borderRadius:'50%',
        background: isActive ? '#5B3FC8' : (dark?'#161B22':'#FFFFFF'),
        border:`2px solid ${isActive?'#5B3FC8':'var(--b1)'}`,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:13, fontWeight:700, color: isActive?'#fff':T1,
        zIndex:1, cursor:'pointer', transition:'all 0.15s',
        boxShadow: isActive?'0 0 16px rgba(91,63,200,0.4)':'none',
      }} onClick={onClick}>
        {idx+1}
      </div>

      {/* Card */}
      <div onClick={onClick} style={{
        marginLeft:56, background: isActive?(dark?'rgba(91,63,200,0.08)':'rgba(91,63,200,0.04)') : (dark?'#161B22':'#FFFFFF'),
        border:`1px solid ${isActive?'rgba(91,63,200,0.4)':'var(--b1)'}`,
        borderRadius:12, padding:'14px 16px', cursor:'pointer',
        transition:'all 0.15s', position:'relative',
        boxShadow: isActive?'0 0 0 1px rgba(91,63,200,0.2)':'none',
      }}
        onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.borderColor='rgba(91,63,200,0.3)'; }}
        onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.borderColor='var(--b1)'; }}>

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:8, background:ch.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Icon size={16} color={ch.color}/>
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:T1 }}>{step.name||`${ch.label} Step`}</span>
                <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:dark?'#21262D':'#F3F4F5', color:T2, fontFamily:'JetBrains Mono,monospace' }}>Day {step.day}</span>
              </div>
              <span style={{ fontSize:11, color:T2 }}>{step.type||'Automated'} {ch.label}</span>
            </div>
          </div>
          <button onClick={e=>{e.stopPropagation(); onDelete();}} style={{ padding:4, border:'none', background:'transparent', cursor:'pointer', color:'var(--t3)', borderRadius:5, transition:'all 0.12s', opacity:0.5 }}
            onMouseEnter={e=>{e.currentTarget.style.color='#EF4444'; e.currentTarget.style.opacity='1';}}
            onMouseLeave={e=>{e.currentTarget.style.color='var(--t3)'; e.currentTarget.style.opacity='0.5';}}>
            <Trash2 size={12}/>
          </button>
        </div>

        {/* Subject preview */}
        {step.subject && (
          <div style={{ padding:'7px 10px', borderRadius:7, background:dark?'rgba(0,0,0,0.3)':'rgba(0,0,0,0.04)', border:`1px solid var(--b1)`, marginBottom:10 }}>
            <span style={{ fontSize:11, color:T2, fontFamily:'JetBrains Mono,monospace' }}>Subject: {step.subject}</span>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div style={{ display:'flex', gap:16, paddingTop:10, borderTop:`1px solid var(--b1)` }}>
            {Object.entries(stats).map(([k,v])=>(
              <div key={k}>
                <div style={{ fontSize:9, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</div>
                <div style={{ fontSize:12, fontWeight:700, color:v.includes('%')?'#4edea3':'var(--t1)', fontFamily:'JetBrains Mono,monospace', marginTop:2 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* If/Then branch */}
      {step.ifThen && (
        <div style={{ marginLeft:56, marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <GitBranch size={12} color='var(--t2)'/>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'0.05em' }}>IF {step.ifThen.condition?.toUpperCase()}</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              { label:'YES', action: step.ifThen.yes, color:'#10B981', bg:'rgba(16,185,129,0.08)', border:'rgba(16,185,129,0.25)' },
              { label:'NO',  action: step.ifThen.no,  color:'var(--t2)', bg: dark?'rgba(0,0,0,0.1)':'rgba(0,0,0,0.03)', border:'var(--b1)' },
            ].map(({ label, action, color, bg, border })=>(
              <div key={label} style={{ position:'relative', background:bg, border:`1px solid ${border}`, borderRadius:9, padding:'10px 12px', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color, borderRadius:'99px 99px 0 0', opacity:0.6 }}/>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                  <span style={{ fontSize:9, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
                </div>
                <span style={{ fontSize:11, color:'var(--t1)' }}>{action||'—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit panel (right column) ──
function EditPanel({ step, onChange, onClose, dark }) {
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S2=dark?'#0D1117':'#F8F9FA';
  const inpStyle = { width:'100%', padding:'7px 10px', borderRadius:7, border:`1px solid ${B1}`, background: dark?'#0D1117':'#F9FAFB', color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s' };
  const fo = e=>e.target.style.borderColor='#5B3FC8', bl = e=>e.target.style.borderColor=B1;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background: dark?'#161B22':'#FFFFFF', border:`1px solid ${B1}`, borderRadius:14, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:`1px solid ${B1}`, background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)' }}>
        <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Edit Step: {CHANNEL_META[step.channel]?.label||'Email'}</span>
        <button onClick={onClose} style={{ border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={14}/></button>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Step Name</div>
          <input value={step.name||''} onChange={e=>onChange({name:e.target.value})} style={inpStyle} onFocus={fo} onBlur={bl}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 70px', gap:10 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Channel</div>
            <select value={step.channel||'Email'} onChange={e=>onChange({channel:e.target.value})} style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
              {Object.keys(CHANNEL_META).map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Day</div>
            <input type="number" min={1} max={60} value={step.day||1} onChange={e=>onChange({day:+e.target.value})} style={{ ...inpStyle, textAlign:'center' }} onFocus={fo} onBlur={bl}/>
          </div>
        </div>
        {(step.channel==='Email'||!step.channel) && (
          <>
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Subject Line</div>
              <input value={step.subject||''} onChange={e=>onChange({subject:e.target.value})}
                placeholder="Quick win for {{company}}…"
                style={{ ...inpStyle, fontFamily:'JetBrains Mono,monospace' }} onFocus={fo} onBlur={bl}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>Email Body</div>
                <button style={{ fontSize:10, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:3 }}>
                  <Zap size={10}/> Optimize with AI
                </button>
              </div>
              <div style={{ border:`1px solid ${B1}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ display:'flex', gap:4, padding:'6px 8px', borderBottom:`1px solid ${B1}`, background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)' }}>
                  {['B','I','U','{}'].map(f=>(
                    <button key={f} style={{ width:22, height:22, borderRadius:4, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>{f}</button>
                  ))}
                </div>
                <textarea value={step.body||''} onChange={e=>onChange({body:e.target.value})} rows={6}
                  placeholder="Hi {{first_name}},\n\nI noticed {{company}} has…"
                  style={{ width:'100%', padding:'10px', border:'none', outline:'none', background:'transparent', color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.7, resize:'none' }}/>
              </div>
            </div>
          </>
        )}

        {/* If/Then logic */}
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>If / Then Logic</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:600, color:'#F59E0B' }}>If</span>
              <select value={step.ifThen?.condition||''} onChange={e=>onChange({ifThen:{...step.ifThen,condition:e.target.value}})}
                style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
                <option value="">None</option>
                {IF_THEN_OPTIONS.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            {step.ifThen?.condition && <>
              <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, fontWeight:600, color:'#10B981' }}>YES →</span>
                <select value={step.ifThen?.yes||''} onChange={e=>onChange({ifThen:{...step.ifThen,yes:e.target.value}})}
                  style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
                  <option value="">Select action…</option>
                  {IF_THEN_ACTIONS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'80px 1fr', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:11, fontWeight:600, color:T2 }}>NO →</span>
                <select value={step.ifThen?.no||''} onChange={e=>onChange({ifThen:{...step.ifThen,no:e.target.value}})}
                  style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
                  <option value="">Select action…</option>
                  {IF_THEN_ACTIONS.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            </>}
          </div>
        </div>
      </div>

      <div style={{ padding:'12px 16px', borderTop:`1px solid ${B1}`, background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)', display:'flex', justifyContent:'flex-end', gap:8 }}>
        <button onClick={onClose} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
        <button onClick={onClose} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'background 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
          onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
          <Save size={11}/> Save Step
        </button>
      </div>
    </div>
  );
}

const INITIAL_STEPS = [
  { id:1, name:'AI Visibility Intro', channel:'Email',    day:1, type:'Automated', subject:'Quick win to get {{company}} more reviews', body:'Hi {{first_name}},\n\nI noticed {{company}} has incredible reviews but low visibility in local AI searches like ChatGPT and Gemini.\n\nWe\'ve helped similar businesses in {{city}} boost their AI search presence by optimizing their review profile structure.\n\nOpen to a quick chat next week to share how?', ifThen:null, stats:{ Sent:'1,204', Open:'42%', Reply:'12%' } },
  { id:2, name:'Connect & Engage',     channel:'LinkedIn', day:3, type:'Manual',    subject:'', body:'',          ifThen:{ condition:'LinkedIn Accepted', yes:'Move to Demo Booked', no:'Send Email Follow-up' }, stats:{ Sent:'850', Accepted:'28%' } },
  { id:3, name:'Competitor Proof',     channel:'Email',    day:5, type:'Automated', subject:'How {{city}} businesses are beating competitors with AI', body:'', ifThen:null, stats:{ Sent:'620', Open:'38%', Reply:'9%'  } },
];

const TOOLBOX = [
  { channel:'Email',     label:'Email',       icon:Mail,          color:'#7C5CE8', bg:'rgba(91,63,200,0.12)'  },
  { channel:'Call',      label:'Call',         icon:Mic,           color:'#4edea3', bg:'rgba(78,222,163,0.12)' },
  { channel:'LinkedIn',  label:'LinkedIn',     icon:Link2,         color:'#adc6ff', bg:'rgba(173,198,255,0.1)' },
  { channel:'SMS',       label:'SMS',          icon:MessageSquare, color:'#7C5CE8', bg:'rgba(91,63,200,0.12)'  },
  { channel:'Voicemail', label:'Custom Task',  icon:Mic,           color:' var(--t2)', bg:'rgba(0,0,0,0.06)'  },
];

export default function Cadences() {
  const { theme, cadences, saveCadence, leads, updateLead, addActivity } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  const [steps,      setSteps]      = useState(INITIAL_STEPS);
  const [activeStep, setActiveStep] = useState(0);
  const [cadName,    setCadName]    = useState('AI Visibility Outreach');
  const [cadDesc,    setCadDesc]    = useState('Multi-channel outreach targeting leads to improve AI visibility.');
  const [view,       setView]       = useState('editor'); // 'editor' | 'performance'
  const [savedMsg,   setSavedMsg]   = useState(false);
  const [applyTarget, setApplyTarget] = useState(null);
  const [applyingId,  setApplyingId]  = useState(null);
  const [applyDone,   setApplyDone]   = useState(null);

  const handleApplyToLead = (cad, leadId) => {
    const target = leads.find(l => l.id === leadId);
    if (!target) return;
    updateLead(leadId, {
      cadenceId:    cad.id,
      cadenceName:  cad.name,
      cadenceDay:   0,
      cadenceTotal: cad.steps?.length || 7,
    });
    addActivity(leadId, 'Cadence Update', 'Cadence applied: ' + cad.name, { source: 'manual' });
    setApplyDone(cad.id);
    setApplyingId(null);
    setTimeout(() => setApplyDone(null), 2500);
  };

  const handleSaveCadence = () => {
    saveCadence({ id: null, name: cadName, description: cadDesc, steps });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const updateStep = (id, patch) => setSteps(ss=>ss.map(s=>s.id===id?{...s,...patch}:s));
  const deleteStep = (id) => { setSteps(ss=>ss.filter(s=>s.id!==id)); if(steps[activeStep]?.id===id) setActiveStep(0); };
  const addStep    = (channel='Email') => {
    const newStep = { id:Date.now(), name:`${channel} Step`, channel, day: steps.length+1, type:'Automated', subject:'', body:'', ifThen:null, stats:null };
    setSteps(ss=>[...ss, newStep]);
    setActiveStep(steps.length);
  };

  const inpStyle = { width:'100%', padding:'8px 10px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s' };
  const fo = e=>e.target.style.borderColor='#5B3FC8', bl = e=>e.target.style.borderColor=B1;

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:0, height:'calc(100vh - 140px)', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>Cadences</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>Build and manage outreach sequences</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:`1px solid rgba(91,63,200,0.3)`, background:'rgba(91,63,200,0.08)', color:'#7C5CE8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', boxShadow:'0 0 0 1px rgba(91,63,200,0.2), 0 0 12px rgba(91,63,200,0.1)' }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,63,200,0.15)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(91,63,200,0.08)';}}>
            <Zap size={12}/> Build with AI
          </button>
          <button style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
            onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
            <Plus size={13}/> New Cadence
          </button>
        </div>
      </div>

      {/* 3-column canvas */}
      <div style={{ display:'grid', gridTemplateColumns:'260px 1fr 300px', gap:14, flex:1, overflow:'hidden', minHeight:0 }}>

        {/* LEFT: Details + Toolbox */}
        <div style={{ display:'flex', flexDirection:'column', gap:14, overflow:'hidden' }}>
          {/* Details */}
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'16px', flexShrink:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Cadence Details</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Name</div>
                <input value={cadName} onChange={e=>setCadName(e.target.value)} style={inpStyle} onFocus={fo} onBlur={bl}/>
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Description</div>
                <textarea value={cadDesc} onChange={e=>setCadDesc(e.target.value)} rows={2}
                  style={{ ...inpStyle, resize:'none' }} onFocus={fo} onBlur={bl}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
                <div style={{ fontSize:11, color:T2 }}>Owner: Paul · Senior SDR</div>
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(78,222,163,0.12)', border:'1px solid rgba(78,222,163,0.2)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#4edea3' }}/>
                  <span style={{ fontSize:10, fontWeight:600, color:'#4edea3' }}>Active</span>
                </div>
              </div>

              {/* Save cadence button */}
              <button onClick={handleSaveCadence} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
                onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
                <Save size={11}/> {savedMsg ? '✓ Saved!' : 'Save Cadence'}
              </button>

              {/* Apply to Lead */}
              <div style={{ borderTop:`1px solid ${B1}`, paddingTop:10 }}>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Apply to Lead</div>
                {applyDone === null && (
                  <select
                    onChange={e => {
                      const id = parseInt(e.target.value);
                      if (id) handleApplyToLead({ id: Date.now(), name: cadName, description: cadDesc, steps }, id);
                    }}
                    defaultValue=""
                    style={{ padding:'5px 10px', borderRadius:7, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:11, fontFamily:'inherit', outline:'none', cursor:'pointer', width:'100%' }}>
                    <option value="" disabled>Select lead…</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.business}</option>
                    ))}
                  </select>
                )}
                {applyDone !== null && (
                  <div style={{ fontSize:11, fontWeight:600, color:'#10B981', padding:'5px 0' }}>✓ Applied!</div>
                )}
              </div>
            </div>
          </div>

          {/* Toolbox */}
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, overflow:'hidden', flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
            <div style={{ padding:'12px 14px', borderBottom:`1px solid ${B1}`, flexShrink:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T1 }}>Step Elements</div>
              <div style={{ fontSize:10, color:T2, marginTop:2 }}>Click to add to sequence</div>
            </div>
            <div style={{ padding:'8px', overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:6 }}>
              {TOOLBOX.map(({ channel, label, icon:Icon, color, bg })=>(
                <button key={channel} onClick={()=>addStep(channel)} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  borderRadius:9, border:`1px solid ${B1}`, background:'transparent',
                  cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', textAlign:'left',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.background=dark?'#21262D':'#F9FAFB'; e.currentTarget.style.borderColor='rgba(91,63,200,0.3)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.borderColor=B1;}}>
                  <div style={{ width:32, height:32, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon size={14} color={color}/>
                  </div>
                  <span style={{ fontSize:12, fontWeight:500, color:T1 }}>{label}</span>
                  <Plus size={11} color={T2} style={{ marginLeft:'auto' }}/>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTRE: Canvas / Timeline */}
        <div style={{ background: dark?'#0a0e14':'#F0F1F3', border:`1px solid ${B1}`, borderRadius:14, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>
          {/* Dot grid */}
          <div style={{ position:'absolute', inset:0, opacity:0.04, backgroundImage:'radial-gradient(var(--t1) 1px, transparent 1px)', backgroundSize:'24px 24px', pointerEvents:'none' }}/>

          {/* Canvas toolbar */}
          <div style={{ height:52, borderBottom:`1px solid ${B1}`, background: dark?'rgba(22,27,34,0.6)':'rgba(255,255,255,0.6)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', flexShrink:0, zIndex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <GitBranch size={16} color="#7C5CE8"/>
              <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Sequence Flow</span>
              <span style={{ fontSize:10, color:T2, background: dark?'#21262D':'#E5E7EB', padding:'1px 7px', borderRadius:99, fontFamily:'JetBrains Mono,monospace' }}>{steps.length} steps</span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{ display:'flex', borderRadius:7, border:`1px solid ${B1}`, overflow:'hidden' }}>
                {['Editor','Performance'].map((v,i)=>(
                  <button key={v} onClick={()=>setView(v.toLowerCase())} style={{ padding:'5px 12px', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, background: view===v.toLowerCase()?(dark?'#21262D':'#fff'):'transparent', color: view===v.toLowerCase()?T1:T2, fontWeight: view===v.toLowerCase()?600:400, borderRight:i===0?`1px solid ${B1}`:undefined }}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          <div style={{ flex:1, overflowY:'auto', padding:'24px 24px 24px 36px', position:'relative', zIndex:1 }}>
            {steps.map((step, idx)=>(
              <StepNode key={step.id} step={step} idx={idx}
                isActive={activeStep===idx}
                onClick={()=>setActiveStep(idx)}
                onDelete={()=>deleteStep(step.id)}
                dark={dark} stats={step.stats}/>
            ))}

            {/* Add step */}
            <div style={{ marginLeft:56, marginTop:4 }}>
              <button onClick={()=>addStep()} style={{
                width:40, height:40, borderRadius:'50%',
                background: dark?'#161B22':'#FFFFFF',
                border:`2px dashed rgba(91,63,200,0.4)`,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor:'pointer', color:'#7C5CE8', transition:'all 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,63,200,0.1)'; e.currentTarget.style.borderColor='rgba(91,63,200,0.8)';}}
                onMouseLeave={e=>{e.currentTarget.style.background=dark?'#161B22':'#FFFFFF'; e.currentTarget.style.borderColor='rgba(91,63,200,0.4)';}}>
                <Plus size={18}/>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Edit panel */}
        {steps[activeStep]
          ? <EditPanel step={steps[activeStep]} onChange={patch=>updateStep(steps[activeStep].id,patch)} onClose={()=>setActiveStep(null)} dark={dark}/>
          : (
            <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
              <GitBranch size={28} color="var(--t3)"/>
              <div style={{ fontSize:12, color:T2, textAlign:'center' }}>Click a step to edit its<br/>content and if/then logic</div>
            </div>
          )
        }
      </div>
    </div>
  );
}
