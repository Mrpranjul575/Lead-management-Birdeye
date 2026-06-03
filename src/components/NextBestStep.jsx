import { Zap, ArrowRight, Mail, MessageSquare, Mic, Link2, Clock, TrendingUp, GitBranch } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPendingSteps, getCadenceProgress } from '../utils/cadenceUtils';

const SUGGESTIONS = {
  'Hot': [
    { action:'Send Competitor Proof Email', channel:'Email', reason:'High-intent lead — 92% score. Strike while hot.', urgency:'high', icon:Mail, color:'#EF4444' },
    { action:'Follow-up SMS',               channel:'SMS',   reason:'Last email was 2h ago — SMS has 3× open rate.',  urgency:'med',  icon:MessageSquare, color:'#3B82F6' },
  ],
  'New': [
    { action:'Send AI Visibility Audit',    channel:'Email', reason:'First touch — AI audit converts 34% of cold leads.',  urgency:'med',  icon:Mail,   color:'#7C5CE8' },
    { action:'LinkedIn Connection',         channel:'LinkedIn', reason:'Build trust before pitching.',                       urgency:'low',  icon:Link2,  color:'#0A66C2' },
  ],
  'Follow Up': [
    { action:'Follow-up Email #2',          channel:'Email', reason:'No reply in 3 days — send value-add content.',    urgency:'high', icon:Mail,           color:'#F59E0B' },
    { action:'Leave Voicemail',             channel:'VM',    reason:'Phone touch has 67% listen rate at day 4.',       urgency:'med',  icon:Mic,            color:'#10B981' },
  ],
  'Contacted': [
    { action:'Send Case Study',             channel:'Email', reason:'Replied to intro — nurture with social proof.',   urgency:'med',  icon:Mail,           color:'#7C5CE8' },
    { action:'Book Demo Link',              channel:'Email', reason:'Warm lead — send booking link now.',              urgency:'high', icon:Mail,           color:'#EF4444' },
  ],
  'Demo Booked': [
    { action:'Send Pre-Demo Brief',         channel:'Email', reason:'Demo tomorrow — send agenda + expectations.',    urgency:'high', icon:Mail,           color:'#EF4444' },
    { action:'Confirm via SMS',             channel:'SMS',   reason:'SMS confirmation reduces no-shows by 40%.',      urgency:'med',  icon:MessageSquare,  color:'#3B82F6' },
  ],
  'Nurturing': [
    { action:'Monthly Value Email',         channel:'Email', reason:'Stay top-of-mind — send industry insight.',      urgency:'low',  icon:Mail,           color:'#7C5CE8' },
    { action:'LinkedIn Engagement',         channel:'LinkedIn', reason:'Like/comment on their recent post.',           urgency:'low',  icon:Link2,          color:'#0A66C2' },
  ],
  'Re-engage': [
    { action:'Break-up Email',              channel:'Email', reason:'Cold 8+ days — send a break-up email.',          urgency:'high', icon:Mail,           color:'#EF4444' },
    { action:'One Last SMS',                channel:'SMS',   reason:'Simple yes/no — last attempt.',                  urgency:'high', icon:MessageSquare,  color:'#EF4444' },
  ],
};

const URGENCY_STYLE = {
  high: { bg:'rgba(239,68,68,0.12)',  color:'#F87171',  label:'Do now'    },
  med:  { bg:'rgba(245,158,11,0.12)', color:'#FCD34D',  label:'Today'     },
  low:  { bg:'rgba(59,130,246,0.12)', color:'#60A5FA',  label:'This week' },
};

const CHANNEL_TO_MODE = { Email:'email', SMS:'sms', VM:'voicemail', LinkedIn:'linkedin' };
const CHANNEL_TO_ICON = { Email:Mail, SMS:MessageSquare, VM:Mic, LinkedIn:Link2 };

/** Converts a SEQ_PLAN step into the same suggestion shape as SUGGESTIONS */
function buildCadenceSuggestion(step, cadenceDay) {
  const icon  = CHANNEL_TO_ICON[step.channel] || Mail;
  return {
    action:  `${step.label} — Day ${cadenceDay}`,
    channel: CHANNEL_TO_MODE[step.channel] || 'email',
    reason:  `Active cadence step: ${step.channel} outreach due on Day ${cadenceDay}`,
    urgency: 'high',
    icon,
    color:   '#5B3FC8',
  };
}

/**
 * deriveNextBestSuggestions — single source of truth for action recommendations.
 * Used by both NextBestStep (display) and ActionCenter (execution).
 * Priority: Demo Booked → Active cadence steps → Stage fallback.
 */
export function deriveNextBestSuggestions(lead) {
  const pendingCadenceSteps = (lead.cadenceDay > 0) ? getPendingSteps(lead) : [];
  const hasCadence = pendingCadenceSteps.length > 0;
  const isDemo     = lead.stage === 'Demo Booked';
  return isDemo
    ? (SUGGESTIONS['Demo Booked'] || SUGGESTIONS['New'])
    : hasCadence
      ? pendingCadenceSteps.slice(0, 2).map(s => buildCadenceSuggestion(s, lead.cadenceDay))
      : (SUGGESTIONS[lead.stage] || SUGGESTIONS['New']);
}

export default function NextBestStep({ lead, compact=false }) {
  const { theme, openCopilot } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  // ── Priority hierarchy ───────────────────────────────────────────────────
  // 1. Demo Booked → always pre-demo prep (critical lifecycle, never overridden)
  // 2. Active cadence steps on current day → cadence actions
  // 3. Stage-based fallback → generic stage actions
  const pendingCadenceSteps = (lead.cadenceDay > 0) ? getPendingSteps(lead) : [];
  const hasCadence  = pendingCadenceSteps.length > 0;
  const isDemo      = lead.stage === 'Demo Booked';

  const suggestions = deriveNextBestSuggestions(lead);
  const top = suggestions[0];
  const Icon = top.icon;
  const urg  = URGENCY_STYLE[top.urgency];
  const cadProgress = getCadenceProgress(lead);

  if (compact) {
    // Inline chip for Work Queue rows — shows top action + cadence day context when active
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:99, background:urg.bg, border:`1px solid ${urg.color}30` }}>
          <Icon size={10} color={urg.color}/>
          <span style={{ fontSize:10, fontWeight:600, color:urg.color }}>{top.action}</span>
        </div>
        {cadProgress.isStarted && cadProgress.name && (
          <span style={{ fontSize:9, color:'var(--t2)', paddingLeft:2 }}>
            {cadProgress.name} · Day {cadProgress.day}/{cadProgress.total}
          </span>
        )}
      </div>
    );
  }

  // Full card for Lead Page
  return (
    <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:`1px solid ${B1}`, background: dark?'rgba(91,63,200,0.06)':'rgba(91,63,200,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <Zap size={13} color="#7C5CE8" style={{ animation:'glow-pulse 2.5s ease-in-out infinite' }}/>
          <span style={{ fontSize:12, fontWeight:600, color:'#7C5CE8' }}>Next Best Steps</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:1 }}>
          <span style={{ fontSize:10, color:T2 }}>
            {hasCadence && !isDemo ? `Day ${lead.cadenceDay}/${cadProgress.total} cadence step` : `Based on stage: ${lead.stage}`}
          </span>
          {hasCadence && !isDemo && cadProgress.totalSteps > 0 && (
            <span style={{ fontSize:10, color:'#7C5CE8', fontWeight:600 }}>
              {cadProgress.pct}% complete · {cadProgress.completedSteps}/{cadProgress.totalSteps} steps
            </span>
          )}
        </div>
      </div>

      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {suggestions.map((s, i)=>{
          const SIcon = s.icon;
          const su = URGENCY_STYLE[s.urgency];
          return (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
              borderRadius:9, border:`1px solid ${i===0?`${s.color}30`:B1}`,
              background: i===0 ? (dark?`rgba(${s.color.replace('#','').match(/.{2}/g).map(h=>parseInt(h,16)).join(',')},0.06)`:`rgba(0,0,0,0.02)`) : S2,
              cursor:'pointer', transition:'all 0.15s',
            }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=`${s.color}50`; e.currentTarget.style.background=dark?'rgba(91,63,200,0.08)':'rgba(91,63,200,0.04)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=i===0?`${s.color}30`:B1; e.currentTarget.style.background=i===0?(dark?'rgba(0,0,0,0.1)':'rgba(0,0,0,0.01)'):S2; }}
              onClick={()=>openCopilot(s.channel==='Email'?'email':s.channel==='SMS'?'sms':s.channel==='VM'?'voicemail':'linkedin', lead)}>
              <div style={{ width:30, height:30, borderRadius:7, background:`${s.color}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <SIcon size={13} color={s.color}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{s.action}</div>
                <div style={{ fontSize:10, color:T2, marginTop:1 }}>{s.reason}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:99, background:su.bg, color:su.color }}>{su.label}</span>
                <ArrowRight size={12} color={T2}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
