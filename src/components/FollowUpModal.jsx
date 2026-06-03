import { useState } from 'react';
import { X, Calendar, Clock, MessageSquare, Mail, Phone, Link2,
         CheckCircle2, Bell, Zap, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ACTIVITY_TYPES } from '../data/schema';

const TYPES = [
  { id:'email',    label:'Email',      icon:Mail,           color:'#7C5CE8', bg:'rgba(91,63,200,0.12)'  },
  { id:'call',     label:'Call',       icon:Phone,          color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  { id:'sms',      label:'SMS',        icon:MessageSquare,  color:'#3B82F6', bg:'rgba(59,130,246,0.12)' },
  { id:'linkedin', label:'LinkedIn',   icon:Link2,          color:'#0A66C2', bg:'rgba(10,102,194,0.12)' },
  { id:'demo',     label:'Demo Call',  icon:Zap,            color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
];

const QUICK_DATES = [
  { label:'Tomorrow',  offset:1  },
  { label:'In 2 days', offset:2  },
  { label:'In 3 days', offset:3  },
  { label:'Next week', offset:7  },
  { label:'In 2 weeks',offset:14 },
  { label:'In a month',offset:30 },
];

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n);
  return r.toISOString().split('T')[0];
}

function formatDisplay(dateStr, time) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T${time||'09:00'}`);
  return d.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

export default function FollowUpModal({ lead, onClose }) {
  const { theme, updateLeadMerged, addActivity } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  const today = new Date().toISOString().split('T')[0];
  const [type,  setType]  = useState('email');
  const [date,  setDate]  = useState(addDays(today, 1));
  const [time,  setTime]  = useState('09:00');
  const [notes, setNotes] = useState('');
  const [remind,setRemind]= useState('30');
  const [saved, setSaved] = useState(false);

  const selectedType = TYPES.find(t=>t.id===type)||TYPES[0];

  const handleSave = () => {
    const followUp = {
      id: Date.now(), type, date, time, notes,
      remind: parseInt(remind),
      display: formatDisplay(date, time),
      leadId: lead.id, done: false,
      createdAt: new Date().toISOString(),
    };

    // ── FIX: single merged update — no stale closure issue ──
    const newFollowUps = [...(lead.followUps||[]), followUp];
    updateLeadMerged(lead.id,
      { followUps: newFollowUps, nextAction: `${selectedType.label} — ${formatDisplay(date, time)}` }
    );
    // Phase 9C-2: use ACTIVITY_TYPES.FOLLOW_UP ('Follow Up') instead of
    // addActivityEntry (which created a 'Note'). Timeline now shows a Calendar
    // icon for scheduled follow-ups instead of a FileText icon.
    addActivity(lead.id, ACTIVITY_TYPES.FOLLOW_UP,
      `Follow-up scheduled: ${selectedType.label} on ${formatDisplay(date, time)}`,
      { source: 'manual', outcome: 'Scheduled' }
    );

    setSaved(true);
    setTimeout(() => onClose(), 1000);
  };

  const inp = {
    style: { width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s', colorScheme:dark?'dark':'light' },
    onFocus: e=>e.target.style.borderColor='#5B3FC8',
    onBlur:  e=>e.target.style.borderColor=B1,
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:199, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:480, zIndex:200, borderRadius:16,
        background:S1, border:`1px solid ${B1}`,
        boxShadow:dark?'0 24px 64px rgba(0,0,0,0.6)':'0 24px 64px rgba(0,0,0,0.15)',
        fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${B1}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(91,63,200,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Calendar size={15} color="#7C5CE8"/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Schedule Follow Up</div>
              <div style={{ fontSize:11, color:T2 }}>{lead.business}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2, borderRadius:6 }}>
            <X size={15}/>
          </button>
        </div>

        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Type */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Type</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {TYPES.map(t=>{
                const active=type===t.id;
                return (
                  <button key={t.id} onClick={()=>setType(t.id)} style={{
                    display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8,
                    border:`1px solid ${active?t.color+'60':B1}`, background:active?t.bg:'transparent',
                    color:active?t.color:T2, fontSize:11, fontWeight:active?600:400,
                    cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                  }}>
                    <t.icon size={12}/>{t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date + Time */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:10 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Date</div>
              <input type="date" value={date} min={today} onChange={e=>setDate(e.target.value)} {...inp}/>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Time</div>
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} {...inp}/>
            </div>
          </div>

          {/* Quick date chips */}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {QUICK_DATES.map(({ label, offset })=>{
              const qd=addDays(today,offset), active=date===qd;
              return (
                <button key={label} onClick={()=>setDate(qd)} style={{
                  padding:'4px 10px', borderRadius:99, border:`1px solid ${active?'rgba(91,63,200,0.5)':B1}`,
                  background:active?'rgba(91,63,200,0.12)':'transparent',
                  color:active?'#7C5CE8':T2, fontSize:10, fontWeight:active?600:400,
                  cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s',
                }}>{label}</button>
              );
            })}
          </div>

          {/* Scheduled preview */}
          {date && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:9, background:dark?'rgba(91,63,200,0.08)':'rgba(91,63,200,0.04)', border:'1px solid rgba(91,63,200,0.2)' }}>
              <Clock size={13} color="#7C5CE8"/>
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'#7C5CE8' }}>Scheduled for</div>
                <div style={{ fontSize:12, color:T1, fontWeight:500 }}>{formatDisplay(date, time)}</div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Notes <span style={{ fontWeight:400, textTransform:'none' }}>(optional)</span></div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}
              placeholder="What's the goal? Any context to remember…"
              style={{ ...inp.style, resize:'none', lineHeight:1.6 }}
              onFocus={inp.onFocus} onBlur={inp.onBlur}/>
          </div>

          {/* Reminder */}
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Bell size={13} color={T2}/>
            <span style={{ fontSize:12, color:T2 }}>Remind me</span>
            <div style={{ position:'relative' }}>
              <select value={remind} onChange={e=>setRemind(e.target.value)}
                style={{ padding:'5px 24px 5px 8px', borderRadius:7, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:11, fontFamily:'inherit', outline:'none', appearance:'none', cursor:'pointer' }}>
                <option value="15">15 min before</option>
                <option value="30">30 min before</option>
                <option value="60">1 hr before</option>
                <option value="1440">1 day before</option>
              </select>
              <ChevronDown size={10} color={T2} style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display:'flex', gap:10, padding:'14px 20px', borderTop:`1px solid ${B1}`, background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)' }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px', borderRadius:9, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={!date} style={{
            flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px',
            borderRadius:9, border:'none',
            background:saved?'#10B981':date?'#5B3FC8':'rgba(91,63,200,0.3)',
            color:'#fff', fontSize:12, fontWeight:600, cursor:date?'pointer':'not-allowed',
            fontFamily:'inherit', transition:'all 0.2s',
          }}>
            {saved ? <><CheckCircle2 size={13}/> Scheduled!</> : <><Calendar size={13}/> Schedule Follow Up</>}
          </button>
        </div>
      </div>
    </>
  );
}
