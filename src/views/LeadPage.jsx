import { useState, useRef, useCallback } from 'react';
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Zap, Copy,
  ExternalLink, Send, MoreHorizontal, CheckCircle2, Circle,
  Brain, FileText, Activity, Clock, Star, ChevronRight,
  Calendar, Plus, X, Upload, Mic, MessageSquare, Link2,
  Flame, TrendingUp, Target, Eye, Lightbulb, Edit3,
  PhoneCall, Video, AlignLeft, Paperclip, ChevronDown,
  AlertCircle, ThumbsUp, Sparkles, GitBranch
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { STAGES_ALL, STAGE_STYLE } from '../constants/stages';
import { ACTIVITY_TYPES, ACTIVITY_OUTCOMES, createActivity, isConfirmed } from '../data/schema';
import { SEQ_PLAN } from '../constants/cadencePlan';
import { getPendingSteps, isDayComplete, isCadenceComplete, nextCadenceDay, getCadenceProgress } from '../utils/cadenceUtils';
import { deriveSignals, deriveActivityIntelligence } from '../utils/intelligenceEngine';
import ActionCenter from '../components/ActionCenter';
import NextBestStep from '../components/NextBestStep';
import FollowUpModal from '../components/FollowUpModal';
import RecordingUpload from '../components/RecordingUpload';
import AccountKnowledgeTab, { countPendingAK, countConflicts } from '../components/AccountKnowledgeTab';
import { getAgeBand, formatAgeLabel } from '../utils/accountKnowledgeUtils';
import { buildAENotesPrompt, buildCadenceStepPrompt } from '../services/prompts';
import { SheetsAdapter } from '../services/sheetsAdapter';
import { useTheme } from '../hooks/useTheme';

/* ─── Shared score ring ─────────────────────────────── */
function ScoreRing({ score, size=52 }) {
  const color = score>=80?'#10B981':score>=65?'#F59E0B':'#EF4444';
  const r=(size/2)-4, circ=2*Math.PI*r, cx=size/2;
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ position:'absolute', inset:0 }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--b1)" strokeWidth="3"/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${(score/100)*circ} ${circ}`}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}/>
      </svg>
      <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:size>40?13:10, fontWeight:700, color }}>{score}</span>
    </div>
  );
}

/* ─── Temperature badge ─────────────────────────────── */
function TempBadge({ temp }) {
  const map = {
    'Hot':       { color:'#EF4444', icon:'🔥', glow:'rgba(239,68,68,0.2)'  },
    'On Fire':   { color:'#F97316', icon:'🔥', glow:'rgba(249,115,22,0.2)' },
    'Warm':      { color:'#F59E0B', icon:'🌤', glow:'rgba(245,158,11,0.15)' },
    'Cold':      { color:'#60A5FA', icon:'❄️', glow:'rgba(96,165,250,0.1)'  },
    'Ice Cold':  { color:'#93C5FD', icon:'🧊', glow:'rgba(147,197,253,0.1)' },
  };
  const m = map[temp] || map['Cold'];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:28 }}>{m.icon}</span>
      <span style={{ fontSize:18, fontWeight:700, color:m.color,
        textShadow:`0 0 20px ${m.glow}` }}>{temp}</span>
    </div>
  );
}

/* ─── Meeting probability gauge ─────────────────────── */
function ProbGauge({ pct }) {
  const color = pct>=70?'#10B981':pct>=40?'#F59E0B':'#EF4444';
  const r=38, circ=2*Math.PI*r, half=circ/2;
  const dash = (pct/100)*half;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
      <div style={{ position:'relative', width:96, height:52 }}>
        <svg width="96" height="52" viewBox="0 0 96 52">
          <path d="M 8 48 A 40 40 0 0 1 88 48" fill="none" stroke="var(--b1)" strokeWidth="7" strokeLinecap="round"/>
          <path d="M 8 48 A 40 40 0 0 1 88 48" fill="none" stroke={color} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={`${dash} ${half}`}/>
        </svg>
        <div style={{ position:'absolute', bottom:2, left:0, right:0, textAlign:'center' }}>
          <span style={{ fontSize:20, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace' }}>{pct}%</span>
        </div>
      </div>
      <span style={{ fontSize:10, color:'var(--t2)', fontWeight:600 }}>{pct>=70?'High':pct>=40?'Medium':'Low'}</span>
    </div>
  );
}

/* ─── Activity icon helper ──────────────────────────── */
function ActivityIcon({ type, outcome }) {
  const map = {
    'Call':          { icon:PhoneCall,    color:'#10B981', bg:'rgba(16,185,129,0.1)'  },
    'Email':         { icon:Mail,         color:'#7C5CE8', bg:'rgba(91,63,200,0.1)'   },
    'SMS':           { icon:MessageSquare,color:'#3B82F6', bg:'rgba(59,130,246,0.1)'  },
    'LinkedIn':      { icon:Link2,        color:'#0A66C2', bg:'rgba(10,102,194,0.1)'  },
    'Voicemail':     { icon:Mic,          color:'#F59E0B', bg:'rgba(245,158,11,0.1)'  },
    'Meeting':       { icon:Video,        color:'#EC4899', bg:'rgba(236,72,153,0.1)'  },
    'Note':          { icon:FileText,     color:'var(--t2)', bg:'var(--s3)'           },
    'Follow Up':     { icon:Calendar,     color:'#7C5CE8', bg:'rgba(91,63,200,0.1)'   },
    'Status Change': { icon:TrendingUp,   color:'#F59E0B', bg:'rgba(245,158,11,0.1)'  },
    'AI Generation': { icon:Sparkles,     color:'#7C5CE8', bg:'rgba(91,63,200,0.1)'   },
  };
  const m = map[type] || map['Note'];
  const Icon = m.icon;
  return (
    <div style={{ width:30, height:30, borderRadius:8, background:m.bg,
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Icon size={14} color={m.color}/>
    </div>
  );
}

function outcomeColor(outcome) {
  const map = {
    'Positive':'#10B981', 'Replied':'#10B981', 'Connected':'#10B981',
    'Sent':'#3B82F6',     'Neutral':'#8B949E',
    'No Answer':'#F59E0B','Negative':'#EF4444', 'Bounced':'#EF4444',
  };
  return map[outcome] || 'var(--t2)';
}

/* ═══════════════════════════════════════════════════════════════
   CALL NOTES MODAL
═══════════════════════════════════════════════════════════════ */
function CallNotesModal({ lead, onClose }) {
  const { addActivity, updateIntelligence, updateAccountKnowledge, updateLead } = useApp();
  const [outcome,   setOutcome]  = useState('Connected');
  const [notes,     setNotes]    = useState('');
  const [nextStep,  setNextStep] = useState('');
  const [duration,  setDuration] = useState('');
  const [sentiment, setSentiment]= useState('Neutral');
  const [saved,     setSaved]    = useState(false);

  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const inp = { style:{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'var(--s2)', color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s' }, onFocus:e=>e.target.style.borderColor='#5B3FC8', onBlur:e=>e.target.style.borderColor=B1 };

  const OUTCOMES  = ['Connected','No Answer','Left Voicemail','Callback Requested','Not Interested'];
  const SENTIMENTS= ['Positive','Neutral','Negative','Very Positive','Very Negative'];

  const handleSave = () => {
    const summary = `Call ${outcome} — ${duration ? duration+'min' : ''} — ${sentiment}`;
    // Capture returned entry so we have the activityId for accountKnowledge provenance
    const entry = addActivity(lead.id, 'Call', summary, { outcome, notes, nextStep, duration, sentiment, content: notes });

    if (notes) {
      // ── intelligence patch — scoring/signal fields only ──
      const intelPatch = {};
      if (notes.toLowerCase().includes('objection')) {
        const obj = notes.match(/objection[:\s]+([^\n.]+)/i)?.[1]?.trim();
        if (obj) intelPatch.objections = [...(lead.intelligence?.objections||[]), obj].filter(Boolean);
      }
      if (notes.toLowerCase().includes('interested') || sentiment==='Positive' || sentiment==='Very Positive') {
        intelPatch.buyingSignals = [...(lead.intelligence?.buyingSignals||[]),
          `${outcome} on ${new Date().toLocaleDateString()}`];
      }
      if (nextStep) intelPatch.nextBestAction = nextStep;
      if (notes)    intelPatch.lastConversation = notes;
      if (Object.keys(intelPatch).length) updateIntelligence(lead.id, intelPatch);

      // ── accountKnowledge patch — account fact fields (Phase 7B) ──
      // Phase 7C-1: source === 'call_note' → reviewStatus: 'confirmed' (SDR-authored
      // text — trusted immediately, no review gate required).
      const akPatch = {};
      if (notes.toLowerCase().includes('competitor')) {
        const comp = notes.match(/competitor[:\s]+([^\n.]+)/i)?.[1]?.trim();
        if (comp) akPatch.competitors = [{
          name: comp, strength: 'unknown', context: '',
          source: 'call_note', sourceDate: new Date().toISOString(),
          reviewStatus: 'confirmed',
          reviewedAt:   new Date().toISOString(),
        }];
      }
      if (notes.toLowerCase().includes('budget')) {
        const budgetText = notes.match(/budget[:\s]+([^\n.]+)/i)?.[1]?.trim();
        if (budgetText) akPatch.budget = {
          status: 'exploring', amount: budgetText, approvedBy: '',
          notes: '', source: 'call_note', sourceDate: new Date().toISOString(),
          reviewStatus: 'confirmed',
          reviewedAt:   new Date().toISOString(),
        };
      }
      if (Object.keys(akPatch).length) {
        // Revision 1: use activityId from returned entry for complete provenance
        akPatch.lastExtractedFrom = entry.activityId;
        updateAccountKnowledge(lead.id, akPatch);
      }
    }

    if (nextStep) updateLead(lead.id, { nextAction: nextStep });
    setSaved(true);
    setTimeout(onClose, 1000);
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:299, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}/>
      <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:500, zIndex:300, borderRadius:16, background:'var(--s1)', border:'1px solid var(--b1)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)', fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--b1)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <PhoneCall size={15} color="#10B981"/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Add Call Notes</div>
              <div style={{ fontSize:11, color:T2 }}>{lead.business}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={15}/></button>
        </div>
        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 100px', gap:10 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Outcome</div>
              <select value={outcome} onChange={e=>setOutcome(e.target.value)} style={{ ...inp.style, appearance:'none' }}>
                {OUTCOMES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Sentiment</div>
              <select value={sentiment} onChange={e=>setSentiment(e.target.value)} style={{ ...inp.style, appearance:'none' }}>
                {SENTIMENTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Duration</div>
              <input placeholder="mins" value={duration} onChange={e=>setDuration(e.target.value)} {...inp}/>
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Call Notes</div>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={5}
              placeholder="What was discussed? Pain points, objections, competitors, buying signals, anything important…"
              style={{ ...inp.style, resize:'none', lineHeight:1.7 }} onFocus={inp.onFocus} onBlur={inp.onBlur}/>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>Next Step</div>
            <input value={nextStep} onChange={e=>setNextStep(e.target.value)} placeholder="e.g. Send competitor comparison, Schedule demo…" {...inp}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, padding:'14px 20px', borderTop:'1px solid var(--b1)', background:'rgba(0,0,0,0.15)' }}>
          <button onClick={onClose} style={{ flex:1, padding:'9px', borderRadius:9, border:'1px solid var(--b1)', background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleSave} style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px', borderRadius:9, border:'none', background:saved?'#10B981':'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'background 0.2s' }}>
            {saved ? <><CheckCircle2 size={13}/> Saved & Updated!</> : <><PhoneCall size={13}/> Save Call Notes</>}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PREPARE FOR CALL DRAWER
═══════════════════════════════════════════════════════════════ */

/**
 * describePendingItems — Phase 7C-2E
 * Returns a human-readable summary of what is pending review in accountKnowledge.
 * Used by the pending banner in PrepareCallDrawer.
 * Pure function. Does not import from AccountKnowledgeTab — reads ak fields directly.
 *
 * Example: "2 competitors, 1 decision maker, budget"
 */
function describePendingItems(ak) {
  if (!ak) return '';
  const parts = [];
  const count = (field, singular, plural) => {
    const n = (ak[field] || []).filter(i => i.reviewStatus === 'pending').length;
    if (n > 0) parts.push(n === 1 ? `1 ${singular}` : `${n} ${plural}`);
  };
  count('competitors',         'competitor',     'competitors');
  count('decisionMakers',      'decision maker', 'decision makers');
  count('currentTools',        'tool',           'tools');
  count('businessGoals',       'goal',           'goals');
  count('recurringObjections', 'objection',      'objections');
  if (ak.budget?.reviewStatus          === 'pending') parts.push('budget');
  if (ak.purchaseTimeline?.reviewStatus === 'pending') parts.push('timeline');
  return parts.join(', ');
}

function PrepareCallDrawer({ lead, onClose, onTabChange }) {
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const intel = lead.intelligence || {};
  const ak    = lead.accountKnowledge;

  // Phase 7C-2C: confirmed competitors from accountKnowledge
  const confirmedCompetitors = (ak?.competitors || []).filter(isConfirmed);
  const topCompetitor = confirmedCompetitors[0]?.name || lead.competitor || null;

  // Phase 7C-2E: decision makers + AK compact section data
  const confirmedDMs       = (ak?.decisionMakers || []).filter(isConfirmed);
  const confirmedGoals      = (ak?.businessGoals || []).filter(isConfirmed).slice(0, 3);
  const confirmedObjections = (ak?.recurringObjections || []).filter(isConfirmed).slice(0, 3);
  const confirmedBudget     = ak?.budget && isConfirmed(ak.budget) ? ak.budget : null;
  const confirmedTimeline   = ak?.purchaseTimeline && isConfirmed(ak.purchaseTimeline) ? ak.purchaseTimeline : null;
  const hasAKCompact        = !!(confirmedBudget || confirmedTimeline || confirmedGoals.length || confirmedObjections.length);

  // Phase 7C-2E: pending banner data
  const pendingDesc = describePendingItems(ak);
  const hasPending  = pendingDesc.length > 0;

  const questions = [
    `What's holding you back from solving your ${(lead.intent||'AI visibility').toLowerCase()} issue today?`,
    `Who else is involved in this decision at ${lead.business}?`,
    topCompetitor
      ? `I saw you're competing with ${topCompetitor} — how do you typically differentiate?`
      : `Who do you see as your biggest competitor right now?`,
    `If we could solve your ${(lead.intent||'review').toLowerCase()} problem in 30 days, what would that mean for your business?`,
    `What's your timeline for making a decision?`,
  ];

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:199, background:'rgba(0,0,0,0.4)' }}/>
      <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, zIndex:200, background:'var(--s1)', borderLeft:'1px solid var(--b1)', boxShadow:'-8px 0 40px rgba(0,0,0,0.4)', overflow:'auto', fontFamily:'Inter,system-ui,sans-serif' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:`1px solid ${B1}`, background:'rgba(91,63,200,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'rgba(91,63,200,0.18)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Sparkles size={16} color="#7C5CE8"/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Prepare For Call</div>
              <div style={{ fontSize:11, color:T2 }}>{lead.business}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={15}/></button>
        </div>

        <div style={{ padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>
          {/* Phase 7C-2E: Pending knowledge banner — shown when pending AK facts exist */}
          {hasPending && (
            <div style={{
              display:'flex', alignItems:'flex-start', gap:10,
              padding:'10px 12px', borderRadius:9,
              border:'1px solid rgba(245,158,11,0.35)',
              background:'rgba(245,158,11,0.06)',
            }}>
              <AlertCircle size={13} color="#F59E0B" style={{ flexShrink:0, marginTop:1 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#F59E0B', marginBottom:2 }}>
                  Facts pending review — not in call context yet
                </div>
                <div style={{ fontSize:11, color:T2, marginBottom:6 }}>
                  Extracted from transcript: {pendingDesc}
                </div>
                {onTabChange && (
                  <button
                    onClick={() => { onClose(); onTabChange('account_knowledge'); }}
                    style={{ fontSize:11, fontWeight:600, color:'#F59E0B', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0, textDecoration:'underline' }}
                  >
                    → Review in Account Knowledge tab
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Last conversation */}
          {intel.lastConversation && (
            <Section title="Last Conversation" icon={Clock} color="#7C5CE8">
              <p style={{ fontSize:12, color:T1, lineHeight:1.7, margin:0 }}>{intel.lastConversation}</p>
            </Section>
          )}

          {/* Pain points */}
          <Section title="Pain Points" icon={AlertCircle} color="#EF4444">
            {intel.painPoints?.length
              ? intel.painPoints.map((p,i)=><Bullet key={i} text={p}/>)
              : <span style={{ fontSize:12, color:T2 }}>None recorded yet</span>}
          </Section>

          {/* Competitors — Phase 7C-2C: reads confirmed accountKnowledge, not deprecated intel field */}
          <Section title="Competitors" icon={Target} color="#F59E0B">
            {confirmedCompetitors.length
              ? confirmedCompetitors.map((c,i)=><Bullet key={i} text={c.name}/>)
              : <span style={{ fontSize:12, color:T2 }}>None recorded yet</span>}
          </Section>

          {/* Decision Makers — Phase 7C-2E: confirmed accountKnowledge.decisionMakers */}
          <Section title="Decision Makers" icon={Brain} color="#7C5CE8">
            {confirmedDMs.length
              ? confirmedDMs.map((d,i)=>(
                  <Bullet key={i} text={d.role ? `${d.name} · ${d.role}` : d.name}/>
                ))
              : <span style={{ fontSize:12, color:T2 }}>None recorded yet</span>}
          </Section>

          {/* Objections */}
          <Section title="Objections" icon={X} color="#F472B6">
            {intel.objections?.length
              ? intel.objections.map((o,i)=><Bullet key={i} text={o}/>)
              : <span style={{ fontSize:12, color:T2 }}>None recorded yet</span>}
          </Section>

          {/* Buying signals */}
          <Section title="Buying Signals" icon={ThumbsUp} color="#10B981">
            {intel.buyingSignals?.length
              ? intel.buyingSignals.map((b,i)=><Bullet key={i} text={b} positive/>)
              : <span style={{ fontSize:12, color:T2 }}>None recorded yet</span>}
          </Section>

          {/* Goal + CTA */}
          <Section title="Recommended CTA" icon={Zap} color="#7C5CE8">
            <p style={{ fontSize:12, color:T1, lineHeight:1.6, margin:0, fontWeight:500 }}>
              {intel.nextBestAction || lead.nextAction || 'Schedule a demo or send competitor comparison'}
            </p>
          </Section>

          {/* Phase 7C-2E: Account Knowledge compact section — budget, timeline, goals, objections */}
          {hasAKCompact && (
            <Section title="Account Knowledge" icon={Brain} color="#38BDF8">
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {confirmedBudget && (
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:T2, width:70, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em', paddingTop:1 }}>Budget</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, color:T1 }}>
                        {[confirmedBudget.status !== 'unknown' ? confirmedBudget.status : null, confirmedBudget.amount || null].filter(Boolean).join(' — ') || confirmedBudget.notes || '—'}
                      </span>
                      {/* Phase 7D-D: freshness label for aging/old facts */}
                      {(() => { const lbl = formatAgeLabel(confirmedBudget); return lbl ? <span style={{ fontSize:10, color: getAgeBand(confirmedBudget) === 'old' ? '#F87171' : '#F59E0B', marginLeft:6 }}>{lbl}</span> : null; })()}
                    </div>
                  </div>
                )}
                {confirmedTimeline && (
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:T2, width:70, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em', paddingTop:1 }}>Timeline</span>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, color:T1 }}>
                        {[confirmedTimeline.urgency !== 'unknown' ? confirmedTimeline.urgency : null, confirmedTimeline.targetDate || null].filter(Boolean).join(' — ') || confirmedTimeline.notes || '—'}
                      </span>
                      {/* Phase 7D-D: freshness label for aging/old facts */}
                      {(() => { const lbl = formatAgeLabel(confirmedTimeline); return lbl ? <span style={{ fontSize:10, color: getAgeBand(confirmedTimeline) === 'old' ? '#F87171' : '#F59E0B', marginLeft:6 }}>{lbl}</span> : null; })()}
                    </div>
                  </div>
                )}
                {confirmedGoals.length > 0 && (
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:T2, width:70, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em', paddingTop:1 }}>Goals</span>
                    <div style={{ flex:1 }}>
                      {confirmedGoals.map((g, i) => (
                        <div key={i} style={{ fontSize:12, color:T1, marginBottom: i < confirmedGoals.length - 1 ? 3 : 0 }}>
                          {g.goal.length > 60 ? g.goal.slice(0, 60) + '…' : g.goal}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {confirmedObjections.length > 0 && (
                  <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:T2, width:70, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em', paddingTop:1 }}>Objections</span>
                    <div style={{ flex:1 }}>
                      {confirmedObjections.map((o, i) => (
                        <div key={i} style={{ fontSize:12, color:T1, marginBottom: i < confirmedObjections.length - 1 ? 3 : 0 }}>
                          {o.objection.length > 60 ? o.objection.slice(0, 60) + '…' : o.objection}
                          {o.occurrences > 1 && <span style={{ fontSize:10, color:T2, marginLeft:5 }}>({o.occurrences}×)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Suggested questions */}
          <Section title="Suggested Questions" icon={Brain} color="#3B82F6">
            {questions.map((q,i)=>(
              <div key={i} style={{ display:'flex', gap:8, padding:'8px 10px', borderRadius:8, background:'var(--bg)', border:'1px solid var(--b1)', marginBottom:6 }}>
                <span style={{ fontSize:11, color:'#7C5CE8', fontWeight:700, flexShrink:0, marginTop:1 }}>Q{i+1}</span>
                <span style={{ fontSize:12, color:T1, lineHeight:1.5 }}>{q}</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, icon:Icon, color, children }) {
  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--b1)', borderRadius:10, padding:'12px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
        <Icon size={13} color={color}/>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--t1)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Bullet({ text, positive }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:7, marginBottom:5 }}>
      <div style={{ width:5, height:5, borderRadius:'50%', background:positive?'#10B981':'var(--t2)', flexShrink:0, marginTop:5 }}/>
      <span style={{ fontSize:12, color:'var(--t1)', lineHeight:1.5 }}>{text}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LEAD TABS
═══════════════════════════════════════════════════════════════ */
const TABS = [
  { id:'overview',         label:'Overview'          },
  { id:'ae_notes',         label:'AE Notes'          },
  { id:'ai_intelligence',  label:'AI Intelligence'   },
  { id:'account_knowledge',label:'Account Knowledge' },
  { id:'timeline',         label:'Timeline'          },
  { id:'activities',       label:'Activities'        },
  { id:'emails',           label:'Emails'            },
  { id:'sms',              label:'SMS'               },
  { id:'linkedin',         label:'LinkedIn'          },
  { id:'voicemails',       label:'Voicemails'        },
  { id:'followups',        label:'Follow Ups'        },
  { id:'memory',           label:'AI Memory'         },
  { id:'cadence',          label:'Cadence'           },
];

/* ─── Tab: Overview ─── */
function OverviewTab({ lead, onCallNotes, onPrepareCall, onFollowUp, onRecording, onTabChange }) {
  const { openCopilot } = useApp();
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const intel    = lead.intelligence || {};
  const derived  = deriveSignals(lead);
  const actIntel = deriveActivityIntelligence(lead);
  const recentActivities = (lead.activities || []).slice(0, 4);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14 }}>

      {/* AI Summary + Key Intelligence — spans 2 cols */}
      <div style={{ gridColumn:'span 2', display:'flex', flexDirection:'column', gap:12 }}>

        {/* AI Summary */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>AI Summary</div>
          <p style={{ fontSize:12, color:T1, lineHeight:1.8, margin:0 }}>
            {intel.summary || `${lead.business} is a ${lead.industry||'healthcare'} business in ${lead.city||'your area'}. Primary intent is ${lead.intent||'AI Visibility'}. AI Score: ${lead.aiScore}.`}
          </p>
          {intel.lastConversation && (
            <>
              <div style={{ fontSize:11, fontWeight:600, color:T2, marginTop:12, marginBottom:4 }}>Last Conversation:</div>
              <p style={{ fontSize:12, color:T1, lineHeight:1.7, margin:0 }}>{intel.lastConversation}</p>
            </>
          )}
          <div style={{ fontSize:11, fontWeight:600, color:T2, marginTop:12, marginBottom:4 }}>Next Best Action:</div>
          <p style={{ fontSize:12, color:'#7C5CE8', lineHeight:1.6, margin:'0 0 12px' }}>{intel.nextBestAction || lead.nextAction || '—'}</p>
          <button onClick={onPrepareCall} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8,
            border:'none', background:'#5B3FC8', color:'#fff',
            fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
            boxShadow:'0 4px 12px rgba(91,63,200,0.35)', transition:'background 0.15s',
          }}
            onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
            onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
            <Sparkles size={12}/> Prepare For Call
          </button>

          {/* AI Recommendation chip — shown when a situational analysis has been saved */}
          {intel.aiRecommendation && (
            <div style={{ marginTop:10, padding:'10px 12px', borderRadius:9, background:'rgba(91,63,200,0.06)', border:'1px solid rgba(91,63,200,0.2)' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: recommendationOpen ? 8 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Sparkles size={11} color="#7C5CE8"/>
                  <span style={{ fontSize:11, fontWeight:600, color:'#7C5CE8' }}>AI Recommendation Available</span>
                  {intel.lastAiUpdate && (
                    <span style={{ fontSize:10, color:T2 }}>
                      · {new Date(intel.lastAiUpdate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setRecommendationOpen(v => !v)}
                  style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, border:'none', background:'rgba(91,63,200,0.15)', color:'#7C5CE8', cursor:'pointer', fontFamily:'inherit' }}>
                  {recommendationOpen ? 'Hide' : 'View'}
                </button>
              </div>
              {recommendationOpen && (
                <p style={{ fontSize:12, color:T1, lineHeight:1.7, margin:0, whiteSpace:'pre-wrap' }}>
                  {intel.aiRecommendation}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Key Intelligence */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Key Intelligence</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {(() => {
              // Phase 7C-2C: confirmed competitors from accountKnowledge (authoritative).
              // Fallback to deprecated intelligence.competitors for pre-7B leads.
              const akComps = (lead.accountKnowledge?.competitors || []).filter(isConfirmed);
              const competitorItems = akComps.length
                ? akComps.map(c => c.name)
                : (intel.competitors || []);
              return [
                { label:'Pain Points',    items:intel.painPoints,     color:'#F87171' },
                { label:'Competitors',    items:competitorItems,      color:'#F59E0B' },
                { label:'Objections',     items:intel.objections,     color:'#F472B6' },
                { label:'Buying Signals', items:intel.buyingSignals,  color:'#34D399' },
              ];
            })().map(({ label, items, color })=>(
              <div key={label}>
                <div style={{ fontSize:11, fontWeight:600, color:T2, marginBottom:6 }}>{label}</div>
                {(items||[]).length===0
                  ? <span style={{ fontSize:11, color:'var(--t3)', fontStyle:'italic' }}>None logged</span>
                  : (items||[]).slice(0,3).map((item,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:4 }}>
                      <div style={{ width:5, height:5, borderRadius:'50%', background:color, flexShrink:0, marginTop:5 }}/>
                      <span style={{ fontSize:11, color:T1, lineHeight:1.5 }}>{item}</span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activities — 1 col */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px', flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:11, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Recent Activities</span>
            <button style={{ fontSize:10, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>View All</button>
          </div>

          {/* Relationship Summary — derived from activity intelligence */}
          <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
            <span style={{
              fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600,
              background: actIntel.daysSinceLastContact === null  ? 'rgba(139,148,158,0.12)'
                        : actIntel.daysSinceLastContact > 7       ? 'rgba(239,68,68,0.1)'
                        : actIntel.daysSinceLastContact > 3       ? 'rgba(245,158,11,0.1)'
                        : 'rgba(16,185,129,0.1)',
              color: actIntel.daysSinceLastContact === null  ? '#8B949E'
                   : actIntel.daysSinceLastContact > 7       ? '#F87171'
                   : actIntel.daysSinceLastContact > 3       ? '#FCD34D'
                   : '#34D399',
            }}>
              {actIntel.daysSinceLastContact === null ? 'Never contacted'
               : actIntel.daysSinceLastContact === 0 ? 'Contacted today'
               : `${actIntel.daysSinceLastContact}d since contact`}
            </span>
            {actIntel.hasReplied && (
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(16,185,129,0.1)', color:'#34D399', fontWeight:600 }}>
                ✓ Has replied
              </span>
            )}
            {actIntel.consecutiveFailures >= 2 && (
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#F87171', fontWeight:600 }}>
                ⚠ {actIntel.consecutiveFailures}× no answer
              </span>
            )}
            {actIntel.totalOutreach > 0 && (
              <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(139,148,158,0.1)', color:'var(--t2)' }}>
                {actIntel.totalOutreach} outreach
              </span>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {recentActivities.length===0 ? (
              <span style={{ fontSize:11, color:T2, fontStyle:'italic' }}>No activities yet</span>
            ) : recentActivities.map((a,i)=>(
              <div key={a.activityId||i} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <ActivityIcon type={a.type} outcome={a.outcome}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.summary}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                    <span style={{ fontSize:10, color:T2 }}>{new Date(a.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
                    {a.outcome && <span style={{ fontSize:10, fontWeight:600, color:outcomeColor(a.outcome) }}>{a.outcome}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Next follow up */}
        {(lead.followUps||[]).filter(f=>!f.done)[0] && (() => {
          const fu = lead.followUps.filter(f=>!f.done)[0];
          return (
            <div style={{ background:'var(--bg)', border:'1px solid rgba(91,63,200,0.25)', borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Next Follow Up</div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--t1)', marginBottom:2 }}>{fu.display}</div>
              {fu.notes && <div style={{ fontSize:11, color:T2 }}>{fu.notes}</div>}
              <button onClick={()=>{}} style={{ marginTop:8, fontSize:10, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0 }}>View in Cadence</button>
            </div>
          );
        })()}
      </div>

      {/* Metrics col — Meeting probability, Temperature, Pipeline stage */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

        {/* Pipeline stage */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Pipeline Stage</div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', gap:2 }}>
              {['New','Working','Hot','Demo','Closed'].map((s,i)=>{
                const stageIdx = ['New','Contacted','Hot','Demo Booked','Converted'].indexOf(lead.stage);
                const filled = i <= (stageIdx<0?0:stageIdx);
                return <div key={s} style={{ flex:1, height:5, borderRadius:99, background:filled?'#5B3FC8':'var(--b1)', transition:'background 0.3s' }}/>;
              })}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              {['New','Working','Hot','Demo','Closed'].map(s=>(
                <span key={s} style={{ fontSize:9, color:s===lead.stage||s==='Working'&&lead.stage==='Contacted'?'#7C5CE8':'var(--t3)', fontWeight:s===lead.stage?700:400 }}>{s}</span>
              ))}
            </div>
          </div>
          <div style={{ marginTop:10, display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:99, background:'rgba(91,63,200,0.15)', border:'1px solid rgba(91,63,200,0.3)' }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#7C5CE8' }}>{lead.stage}</span>
          </div>
        </div>

        {/* Buying Intent */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10, alignSelf:'flex-start' }}>Buying Intent</div>
          <ProbGauge pct={derived.buyingIntentScore}/>
        </div>

        {/* Lead temperature — untouched, displays intel.leadTemperature as before */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', alignSelf:'flex-start' }}>Lead Temperature</div>
          <TempBadge temp={intel.leadTemperature || 'Cold'}/>
        </div>

        {/* Urgency badge — derived signal */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'12px 14px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Urgency</div>
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:99, border:'1px solid', ...({
            Critical:{ background:'rgba(239,68,68,0.12)',   borderColor:'rgba(239,68,68,0.3)',   color:'#F87171'  },
            High:    { background:'rgba(245,158,11,0.12)',  borderColor:'rgba(245,158,11,0.3)',  color:'#FCD34D'  },
            Medium:  { background:'rgba(56,189,248,0.12)',  borderColor:'rgba(56,189,248,0.3)',  color:'#38BDF8'  },
            Low:     { background:'rgba(139,148,158,0.12)', borderColor:'rgba(139,148,158,0.3)', color:'#8B949E'  },
          }[derived.urgency] || { background:'rgba(139,148,158,0.12)', borderColor:'rgba(139,148,158,0.3)', color:'#8B949E' }) }}>
            <span style={{ fontSize:11, fontWeight:700 }}>{derived.urgency}</span>
          </div>
        </div>

        {/* Risk badge — derived signal, only shown for Medium or High */}
        {derived.riskLevel !== 'Low' && (
          <div style={{ background:'var(--bg)', border:`1px solid ${derived.riskLevel==='High'?'rgba(239,68,68,0.3)':'rgba(245,158,11,0.3)'}`, borderRadius:12, padding:'12px 14px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Risk Level</div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:99, background:derived.riskLevel==='High'?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)', border:`1px solid ${derived.riskLevel==='High'?'rgba(239,68,68,0.3)':'rgba(245,158,11,0.3)'}` }}>
              <span style={{ fontSize:10 }}>⚠</span>
              <span style={{ fontSize:11, fontWeight:700, color:derived.riskLevel==='High'?'#F87171':'#FCD34D' }}>{derived.riskLevel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Next Best Steps — full card */}
      <div style={{ gridColumn:'span 4' }}>
        <NextBestStep lead={lead}/>
      </div>

      {/* Bottom row — Quick Actions, AI Copilot, Lead Memory, Files */}
      <div style={{ gridColumn:'span 4', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:14 }}>

        {/* Action Center — replaces static Quick Actions card */}
        <ActionCenter
          lead={lead}
          onCallNotes={onCallNotes}
          onFollowUp={onFollowUp}
          onRecording={onRecording}
          onTabChange={onTabChange}
        />

        {/* AI Copilot */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>AI Copilot</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {[
              { label:'Generate Follow Up Email', mode:'email'       },
              { label:'GMB Visibility Summary',    mode:'situational' },
              { label:'Objection Handling',         mode:'situational' },
              { label:'Competitor Email',           mode:'email'       },
              { label:'Voicemail Script',           mode:'voicemail'   },
            ].map(({ label, mode })=>(
              <button key={label} onClick={()=>openCopilot(mode,lead)} style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 10px', borderRadius:7, border:'1px solid rgba(91,63,200,0.2)', background:'rgba(91,63,200,0.04)', cursor:'pointer', color:'var(--t1)', fontSize:11, fontFamily:'inherit', transition:'all 0.12s', textAlign:'left' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,63,200,0.12)'; e.currentTarget.style.borderColor='rgba(91,63,200,0.4)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(91,63,200,0.04)'; e.currentTarget.style.borderColor='rgba(91,63,200,0.2)';}}>
                <Sparkles size={11} color="#7C5CE8"/>{label}
              </button>
            ))}
          </div>
        </div>

        {/* Lead Memory */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Lead Memory</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
            {(lead.memory||[]).length===0
              ? <span style={{ fontSize:11, color:T2, fontStyle:'italic' }}>No memory entries yet</span>
              : (lead.memory||[]).slice(0,5).map((m,i)=>(
                <div key={m.id||i} style={{ padding:'5px 8px', borderRadius:6, background:'var(--s3)', border:'1px solid var(--b1)' }}>
                  <span style={{ fontSize:11, color:'var(--t1)' }}>{m.text}</span>
                  {m.tag && <span style={{ marginLeft:6, fontSize:9, color:'#7C5CE8', fontWeight:600 }}>{m.tag}</span>}
                </div>
              ))
            }
          </div>
          <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0 }}>
            <Plus size={10}/> Add Memory
          </button>
        </div>

        {/* Files & Links */}
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:12, padding:'14px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Files &amp; Links</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
            {(lead.files||[]).length===0 ? (
              ['SEO Report.pdf','GMB Screenshot.png','Competitors Analysis.xlsx'].map(f=>(
                <div key={f} style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 8px', borderRadius:6, background:'var(--s3)', border:'1px solid var(--b1)', cursor:'pointer' }}>
                  <Paperclip size={11} color="#7C5CE8"/>
                  <span style={{ fontSize:11, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f}</span>
                </div>
              ))
            ) : (lead.files||[]).map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 8px', borderRadius:6, background:'var(--s3)', border:'1px solid var(--b1)', cursor:'pointer' }}>
                <Paperclip size={11} color="#7C5CE8"/>
                <span style={{ fontSize:11, color:'var(--t1)' }}>{f.name||f}</span>
              </div>
            ))}
          </div>
          <button style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0 }}>
            <Upload size={10}/> Upload File
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: AE Notes ─── */
function AENotesTab({ lead }) {
  const { updateLead } = useApp();
  const { T1, T2, B1, S1, S2 } = useTheme();
  const [localNotes,   setLocalNotes]   = useState(lead.aeNotes || '');
  const [promptCopied, setPromptCopied] = useState(false);
  const [pastedResult, setPastedResult] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [saved,        setSaved]        = useState(false);
  const debRef = useRef(null);

  const handleNotesChange = (val) => {
    setLocalNotes(val);
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => updateLead(lead.id, { aeNotes: val }), 400);
  };

  const handleGeneratePrompt = () => {
    const prompt = buildAENotesPrompt(lead);
    navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setShowPasteBox(true);
    setTimeout(() => setPromptCopied(false), 2500);
  };

  const handleSaveAENotes = () => {
    if (!pastedResult.trim()) return;
    const cleaned = pastedResult
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/---+/g, '')
      .replace(/\*/g, '')
      .trim();
    // Phase 8B-2: write generated output to aeNotesGenerated, never to aeNotes.
    // aeNotes remains the raw SDR research scratchpad — authoritative AI input.
    // aeNotesGenerated is the structured output — SDR-facing artifact only.
    updateLead(lead.id, { aeNotesGenerated: cleaned });
    // Do NOT call setLocalNotes(cleaned) — localNotes tracks lead.aeNotes (raw),
    // which must not be overwritten with the generated output.
    setShowPasteBox(false);
    setPastedResult('');
    // Sheet export: inline aeNotes: cleaned so the sheet column receives the
    // generated output as before. lead.aeNotes (raw research) is not sent.
    SheetsAdapter.pushAENotes({ ...lead, aeNotes: cleaned }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1, padding:'8px 12px', borderRadius:9, background:'rgba(91,63,200,0.06)', border:'1px solid rgba(91,63,200,0.2)' }}>
          <span style={{ fontSize:11, color:T2, lineHeight:1.6 }}>
            AE Notes are your <strong style={{ color:T1 }}>static research layer</strong> — GMB, competitors, keywords, SEO scans.
          </span>
        </div>
        <button onClick={handleGeneratePrompt} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
          borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff',
          fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
          boxShadow:'0 4px 12px rgba(91,63,200,0.3)', whiteSpace:'nowrap',
          transition:'background 0.15s',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
          onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}>
          {promptCopied ? '✓ Prompt Copied!' : '⚡ Generate AE Notes'}
        </button>
      </div>

      {showPasteBox && (
        <div style={{ background:'var(--bg)', border:'1px solid rgba(91,63,200,0.3)', borderRadius:12, padding:'14px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:12, fontWeight:600, color:T1 }}>
            Prompt copied — paste in Claude.ai, then paste response below:
          </div>
          <textarea
            value={pastedResult}
            onChange={e=>setPastedResult(e.target.value)}
            rows={8}
            placeholder="Paste Claude's AE Notes response here…"
            style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.7, resize:'vertical', outline:'none' }}
          />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ setShowPasteBox(false); setPastedResult(''); }} style={{ flex:1, padding:'8px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              Cancel
            </button>
            <button onClick={handleSaveAENotes} disabled={!pastedResult.trim()} style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px', borderRadius:8, border:'none', background:pastedResult.trim()?'#5B3FC8':'rgba(91,63,200,0.3)', color:'#fff', fontSize:12, fontWeight:600, cursor:pastedResult.trim()?'pointer':'not-allowed', fontFamily:'inherit' }}>
              💾 Save + Push to Sheet
            </button>
          </div>
        </div>
      )}

      {saved && (
        <div style={{ padding:'10px 12px', borderRadius:9, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', fontSize:12, fontWeight:600, color:'#10B981' }}>
          ✓ AE Notes saved and pushed to Google Sheet!
        </div>
      )}

      {/* Phase 8B-2: Generated AE Notes display block.
          Read-only — rendered only when lead.aeNotesGenerated is populated.
          Visually distinct from the raw notes textarea below.
          Not editable in-place — re-generate is the workflow. */}
      {lead.aeNotesGenerated && (
        <div style={{ border:`1px solid rgba(91,63,200,0.25)`, borderRadius:10, overflow:'hidden' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'rgba(91,63,200,0.06)', borderBottom:`1px solid rgba(91,63,200,0.15)` }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Sparkles size={12} color="#7C5CE8"/>
              <span style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Generated AE Notes</span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(lead.aeNotesGenerated).catch(() => {})}
              style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:6, border:`1px solid rgba(91,63,200,0.25)`, background:'transparent', color:'#7C5CE8', fontSize:10, cursor:'pointer', fontFamily:'inherit', fontWeight:500, transition:'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(91,63,200,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; }}>
              <Copy size={11}/> Copy
            </button>
          </div>
          <pre style={{ margin:0, padding:'12px 14px', fontSize:11, color:T1, fontFamily:'JetBrains Mono,monospace', lineHeight:1.8, whiteSpace:'pre-wrap', wordBreak:'break-word', background:'var(--bg)', maxHeight:320, overflowY:'auto' }}>
            {lead.aeNotesGenerated}
          </pre>
        </div>
      )}

      <textarea
        value={localNotes}
        onChange={e=>handleNotesChange(e.target.value)}
        rows={18}
        placeholder="Paste research here: competitor review counts, GMB URL, Salesloft URL, keywords, SEO scan…"
        style={{ width:'100%', padding:'14px', borderRadius:10, border:`1px solid ${B1}`, background:'var(--bg)', color:T1, fontSize:12, fontFamily:'JetBrains Mono,monospace', lineHeight:1.8, resize:'vertical', outline:'none', transition:'border-color 0.15s' }}
        onFocus={e=>e.target.style.borderColor='#5B3FC8'}
        onBlur={e=>e.target.style.borderColor=B1}
      />
    </div>
  );
}

/* ─── Tab: AI Intelligence ─── */
function AIIntelTab({ lead }) {
  const { updateIntelligence } = useApp();
  const intel = lead.intelligence || {};
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';

  const ListEditor = ({ label, field, color }) => {
    const [input, setInput] = useState('');
    const items = intel[field] || [];
    const add = () => {
      if (!input.trim()) return;
      updateIntelligence(lead.id, { [field]: [...items, input.trim()] });
      setInput('');
    };
    return (
      <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{label}</div>
        <div style={{ display:'flex', flexDirection:'column', gap:5, marginBottom:8 }}>
          {items.length===0 ? <span style={{ fontSize:11, color:'var(--t3)', fontStyle:'italic' }}>None logged yet</span>
            : items.map((item,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:7 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:color, flexShrink:0 }}/>
                <span style={{ fontSize:12, color:T1, flex:1 }}>{item}</span>
                <button onClick={()=>updateIntelligence(lead.id,{[field]:items.filter((_,j)=>j!==i)})} style={{ padding:2, border:'none', background:'transparent', cursor:'pointer', color:'var(--t3)', opacity:0.5 }}
                  onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.5'}>
                  <X size={11}/>
                </button>
              </div>
            ))}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder={`Add ${label.toLowerCase()}…`}
            style={{ flex:1, padding:'6px 9px', borderRadius:7, border:`1px solid ${B1}`, background:'var(--s2)', color:T1, fontSize:11, fontFamily:'inherit', outline:'none' }}/>
          <button onClick={add} style={{ padding:'6px 10px', borderRadius:7, border:'none', background:'rgba(91,63,200,0.15)', color:'#7C5CE8', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>+</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      {/* Summary */}
      <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'14px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>AI Summary</div>
        <textarea value={intel.summary||''} onChange={e=>updateIntelligence(lead.id,{summary:e.target.value})} rows={3}
          placeholder="AI-generated summary of this lead…"
          style={{ width:'100%', padding:'9px 10px', borderRadius:8, border:`1px solid ${B1}`, background:'var(--s2)', color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.7, resize:'none', outline:'none' }}/>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <ListEditor label="Pain Points"    field="painPoints"    color="#F87171"/>
        <ListEditor label="Competitors"    field="competitors"   color="#F59E0B"/>
        <ListEditor label="Objections"     field="objections"    color="#F472B6"/>
        <ListEditor label="Buying Signals" field="buyingSignals" color="#34D399"/>
        <ListEditor label="Decision Makers"field="decisionMakers"color="#7C5CE8"/>
      </div>

      {/* Scalars */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        {[
          { label:'Budget',   field:'budget'   },
          { label:'Timeline', field:'timeline' },
          { label:'Preferred Communication', field:'preferredCommunicationStyle' },
        ].map(({ label, field })=>(
          <div key={field} style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 }}>{label}</div>
            <input value={intel[field]||''} onChange={e=>updateIntelligence(lead.id,{[field]:e.target.value})}
              placeholder={`Enter ${label.toLowerCase()}…`}
              style={{ width:'100%', padding:'6px 8px', borderRadius:7, border:`1px solid ${B1}`, background:'var(--s2)', color:T1, fontSize:12, fontFamily:'inherit', outline:'none' }}/>
          </div>
        ))}
      </div>

      {/* Temperature + Probability */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Lead Temperature</div>
          <div style={{ display:'flex', gap:6 }}>
            {['Ice Cold','Cold','Warm','Hot','On Fire'].map(t=>(
              <button key={t} onClick={()=>updateIntelligence(lead.id,{leadTemperature:t})} style={{ flex:1, padding:'5px', borderRadius:7, border:`1px solid ${intel.leadTemperature===t?'#7C5CE8':'var(--b1)'}`, background:intel.leadTemperature===t?'rgba(91,63,200,0.15)':'transparent', color:intel.leadTemperature===t?'#7C5CE8':'var(--t2)', fontSize:9, fontWeight:intel.leadTemperature===t?700:400, cursor:'pointer', fontFamily:'inherit' }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
          <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Meeting Probability: {intel.meetingProbability||0}%</div>
          <input type="range" min={0} max={100} value={intel.meetingProbability||0} onChange={e=>updateIntelligence(lead.id,{meetingProbability:+e.target.value})}
            style={{ width:'100%', accentColor:'#5B3FC8' }}/>
        </div>
      </div>

      {/* AI Recommendation metadata — read-only, shown when any insight has been generated */}
      {(intel.insightVersion > 0 || intel.lastAiUpdate) && (
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', padding:'10px 12px', borderRadius:9, background:'var(--bg)', border:`1px solid ${B1}`, fontSize:11, color:T2 }}>
          <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', alignSelf:'center' }}>AI Insights</span>
          {intel.insightVersion > 0 && (
            <span style={{ padding:'2px 8px', borderRadius:99, background:'rgba(91,63,200,0.1)', color:'#7C5CE8', fontSize:10, fontWeight:600 }}>
              v{intel.insightVersion}
            </span>
          )}
          {intel.lastAiUpdate && (
            <span style={{ fontSize:10 }}>
              Last updated: {new Date(intel.lastAiUpdate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Timeline ─── */
function TimelineTab({ lead }) {
  const [channelFilter, setChannelFilter] = useState('all');
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';

  const actIntel = deriveActivityIntelligence(lead);

  const CHANNEL_FILTERS = [
    { id:'all',     label:'All'     },
    { id:'Call',    label:'Calls'   },
    { id:'Email',   label:'Emails'  },
    { id:'SMS',     label:'SMS'     },
    { id:'ai',      label:'AI'      },
    { id:'cadence', label:'Cadence' },
  ];

  const allActivities = lead.activities || [];
  const visibleActivities = channelFilter === 'all'
    ? allActivities
    : channelFilter === 'ai'
      ? allActivities.filter(a => ['AI Generation','Transcript'].includes(a.type))
      : channelFilter === 'cadence'
        ? allActivities.filter(a => a.type === 'Cadence Update')
        : allActivities.filter(a => a.type === channelFilter);

  const sorted  = [...visibleActivities].sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
  const grouped = sorted.reduce((acc, a) => {
    const d = new Date(a.timestamp).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    if (!acc[d]) acc[d]=[];
    acc[d].push(a);
    return acc;
  }, {});

  // Memory entries — included in the timeline as chips (read-only)
  const memoryEntries = lead.memory || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>

      {/* Relationship Summary header */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${B1}` }}>
        <span style={{
          fontSize:10, padding:'2px 7px', borderRadius:99, fontWeight:600,
          background: actIntel.daysSinceLastContact === null  ? 'rgba(139,148,158,0.12)'
                    : actIntel.daysSinceLastContact > 7       ? 'rgba(239,68,68,0.1)'
                    : actIntel.daysSinceLastContact > 3       ? 'rgba(245,158,11,0.1)'
                    : 'rgba(16,185,129,0.1)',
          color: actIntel.daysSinceLastContact === null  ? '#8B949E'
               : actIntel.daysSinceLastContact > 7       ? '#F87171'
               : actIntel.daysSinceLastContact > 3       ? '#FCD34D'
               : '#34D399',
        }}>
          {actIntel.daysSinceLastContact === null ? 'Never contacted'
           : actIntel.daysSinceLastContact === 0 ? 'Contacted today'
           : `${actIntel.daysSinceLastContact}d since contact`}
        </span>
        {actIntel.hasReplied && (
          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(16,185,129,0.1)', color:'#34D399', fontWeight:600 }}>✓ Has replied</span>
        )}
        {actIntel.consecutiveFailures >= 2 && (
          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(239,68,68,0.1)', color:'#F87171', fontWeight:600 }}>
            ⚠ {actIntel.consecutiveFailures}× no answer
          </span>
        )}
        {actIntel.totalOutreach > 0 && (
          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:99, background:'rgba(139,148,158,0.1)', color:T2 }}>
            {actIntel.totalOutreach} outreach logged
          </span>
        )}
      </div>

      {/* Channel filter bar */}
      <div style={{ display:'flex', gap:4, marginBottom:14 }}>
        {CHANNEL_FILTERS.map(f => {
          const active = channelFilter === f.id;
          return (
            <button key={f.id} onClick={() => setChannelFilter(f.id)} style={{
              padding:'4px 10px', borderRadius:99, border:'none', cursor:'pointer',
              background: active ? 'var(--p)' : 'var(--s3)',
              color: active ? '#fff' : T2,
              fontSize:10, fontWeight: active ? 600 : 400,
              fontFamily:'inherit', transition:'all 0.12s',
            }}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Timeline entries */}
      {Object.keys(grouped).length===0 && memoryEntries.length===0 ? (
        <div style={{ textAlign:'center', padding:'48px', color:T2 }}>
          {channelFilter === 'all'
            ? 'No timeline entries yet. Add call notes or log activities to build the history.'
            : `No ${CHANNEL_FILTERS.find(f=>f.id===channelFilter)?.label || channelFilter} entries yet.`}
        </div>
      ) : (
        <>
          {Object.entries(grouped).map(([date, items])=>(
            <div key={date}>
              <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', padding:'14px 0 8px', borderBottom:`1px solid ${B1}`, marginBottom:12 }}>{date}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20, position:'relative', paddingLeft:40 }}>
                <div style={{ position:'absolute', left:14, top:0, bottom:-20, width:2, background:B1 }}/>
                {items.map((a,i)=>(
                  <div key={a.activityId||i} style={{ display:'flex', alignItems:'flex-start', gap:12, position:'relative' }}>
                    <div style={{ position:'absolute', left:-26, zIndex:1 }}>
                      <ActivityIcon type={a.type} outcome={a.outcome}/>
                    </div>
                    <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'10px 14px', flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:a.details?.content?6:0 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{a.summary}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          {a.outcome && <span style={{ fontSize:10, fontWeight:600, color:outcomeColor(a.outcome) }}>{a.outcome}</span>}
                          <span style={{ fontSize:10, color:T2 }}>{new Date(a.timestamp).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>
                        </div>
                      </div>
                      {a.details?.content && <p style={{ fontSize:11, color:T2, lineHeight:1.6, margin:0 }}>{a.details.content}</p>}
                      {a.details?.nextStep && <p style={{ fontSize:11, color:'#7C5CE8', margin:'4px 0 0', fontWeight:500 }}>→ {a.details.nextStep}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Memory entries — shown at bottom of timeline when filter is 'all', read-only chips */}
          {channelFilter === 'all' && memoryEntries.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', padding:'14px 0 8px', borderBottom:`1px solid ${B1}`, marginBottom:12 }}>
                Memory &amp; Context
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {memoryEntries.map(m => (
                  <div key={m.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', borderRadius:8, background:'var(--s2)', border:`1px solid ${B1}` }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:'#7C5CE8', flexShrink:0, marginTop:5 }}/>
                    <span style={{ fontSize:11, color:T1, flex:1, lineHeight:1.5 }}>{m.text}</span>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {m.tag && <span style={{ fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:'rgba(91,63,200,0.12)', color:'#7C5CE8' }}>{m.tag}</span>}
                      <span style={{ fontSize:9, color:T2 }}>{m.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Tab: Activities ─── */
function ActivitiesTab({ lead }) {
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const acts = (lead.activities||[]);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {acts.length===0 ? (
        <div style={{ textAlign:'center', padding:'48px', color:T2 }}>No activities logged yet.</div>
      ) : acts.map((a,i)=>(
        <div key={a.activityId||i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10 }}>
          <ActivityIcon type={a.type} outcome={a.outcome}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{a.summary}</div>
            {a.details?.content && <p style={{ fontSize:11, color:T2, lineHeight:1.5, margin:'3px 0 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.details.content}</p>}
          </div>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3, flexShrink:0 }}>
            <span style={{ fontSize:10, color:T2 }}>{new Date(a.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            {a.outcome && <span style={{ fontSize:10, fontWeight:600, color:outcomeColor(a.outcome) }}>{a.outcome}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: Email / SMS / LinkedIn / Voicemail (channel tabs) ─── */
function ChannelTab({ lead, channel }) {
  const { openCopilot } = useApp();
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const mode = channel.toLowerCase().replace(' ','');
  const items = (lead.activities||[]).filter(a=>a.type===channel);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={()=>openCopilot(mode,lead)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)' }}>
          <Sparkles size={12}/> Generate {channel}
        </button>
      </div>
      {items.length===0 ? (
        <div style={{ textAlign:'center', padding:'48px', color:T2 }}>No {channel.toLowerCase()} history yet.</div>
      ) : items.map((a,i)=>(
        <div key={a.activityId||i} style={{ padding:'12px 14px', background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{a.summary}</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {a.outcome && <span style={{ fontSize:10, fontWeight:600, color:outcomeColor(a.outcome) }}>{a.outcome}</span>}
              <span style={{ fontSize:10, color:T2 }}>{new Date(a.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
            </div>
          </div>
          {a.details?.subject && <div style={{ fontSize:11, color:T2, marginBottom:4 }}>Subject: {a.details.subject}</div>}
          {a.details?.content && <p style={{ fontSize:12, color:T1, lineHeight:1.7, margin:0 }}>{a.details.content}</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: Follow Ups ─── */
function FollowUpsTab({ lead, onSchedule }) {
  const { updateLead } = useApp();
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const followUps = lead.followUps||[];
  const TYPE_COLORS = { email:'#7C5CE8', call:'#10B981', sms:'#3B82F6', linkedin:'#0A66C2', demo:'#F59E0B' };

  const markDone = (id) => updateLead(lead.id, { followUps: followUps.map(f=>f.id===id?{...f,done:true}:f) });
  const remove   = (id) => updateLead(lead.id, { followUps: followUps.filter(f=>f.id!==id) });

  const upcoming  = followUps.filter(f=>!f.done);
  const completed = followUps.filter(f=>f.done);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button onClick={onSchedule} style={{ display:'flex', alignItems:'center', gap:5, padding:'8px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)' }}>
          <Calendar size={12}/> Schedule Follow Up
        </button>
      </div>
      {followUps.length===0 && (
        <div style={{ textAlign:'center', padding:'48px', color:T2 }}>No follow-ups scheduled. Click the button above to schedule one.</div>
      )}
      {upcoming.length>0 && <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Upcoming</div>}
      {upcoming.map(fu=>(
        <div key={fu.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:'var(--bg)', border:`1px solid ${TYPE_COLORS[fu.type]||'var(--b1)'}30`, borderRadius:10 }}>
          <Calendar size={14} color={TYPE_COLORS[fu.type]||'#7C5CE8'} style={{ flexShrink:0, marginTop:2 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{fu.type?.charAt(0).toUpperCase()+fu.type?.slice(1)} Follow Up</div>
            <div style={{ fontSize:11, color:T2, marginTop:2 }}>{fu.display}</div>
            {fu.notes && <p style={{ fontSize:11, color:T1, lineHeight:1.5, margin:'5px 0 0', borderLeft:`2px solid ${TYPE_COLORS[fu.type]||'#7C5CE8'}`, paddingLeft:7 }}>{fu.notes}</p>}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={()=>markDone(fu.id)} style={{ padding:5, borderRadius:6, border:'1px solid var(--b1)', background:'transparent', cursor:'pointer', color:'var(--t2)', display:'flex' }}
              onMouseEnter={e=>{e.currentTarget.style.color='#10B981'; e.currentTarget.style.borderColor='rgba(16,185,129,0.4)'}}
              onMouseLeave={e=>{e.currentTarget.style.color='var(--t2)'; e.currentTarget.style.borderColor='var(--b1)'}}><CheckCircle2 size={13}/></button>
            <button onClick={()=>remove(fu.id)} style={{ padding:5, borderRadius:6, border:'1px solid var(--b1)', background:'transparent', cursor:'pointer', color:'var(--t2)', display:'flex' }}
              onMouseEnter={e=>{e.currentTarget.style.color='#EF4444'; e.currentTarget.style.borderColor='rgba(239,68,68,0.4)'}}
              onMouseLeave={e=>{e.currentTarget.style.color='var(--t2)'; e.currentTarget.style.borderColor='var(--b1)'}}><X size={13}/></button>
          </div>
        </div>
      ))}
      {completed.length>0 && <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>Completed</div>}
      {completed.map(fu=>(
        <div key={fu.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--b1)', borderRadius:10, opacity:0.55 }}>
          <CheckCircle2 size={14} color="#10B981" style={{ flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <span style={{ fontSize:12, color:T1, textDecoration:'line-through' }}>{fu.type?.charAt(0).toUpperCase()+fu.type?.slice(1)} · {fu.display}</span>
          </div>
          <button onClick={()=>remove(fu.id)} style={{ padding:4, border:'none', background:'transparent', cursor:'pointer', color:'var(--t2)' }}><X size={12}/></button>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: AI Memory ─── */
function MemoryTab({ lead }) {
  const { addMemoryEntry, removeMemoryEntry } = useApp();
  const [input, setInput] = useState('');
  const [tag,   setTag]   = useState('Context');
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const TAGS = ['Context','Pain Point','Objection','Competitor','Win Signal','Decision Maker','Budget','Timeline'];
  const TAG_COLORS = { 'Context':'#60A5FA','Pain Point':'#F472B6','Objection':'#F87171','Competitor':'#FCD34D','Win Signal':'#34D399','Decision Maker':'#7C5CE8','Budget':'#FCD34D','Timeline':'#38BDF8' };
  const add = () => { if (!input.trim()) return; addMemoryEntry(lead.id, { text:input.trim(), tag, date:'Today' }); setInput(''); };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', gap:8 }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}
          placeholder="Add a memory entry for this lead…"
          style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1px solid var(--b1)', background:'var(--bg)', color:T1, fontSize:12, fontFamily:'inherit', outline:'none' }}/>
        <select value={tag} onChange={e=>setTag(e.target.value)}
          style={{ padding:'9px 10px', borderRadius:8, border:'1px solid var(--b1)', background:'var(--s2)', color:T1, fontSize:11, fontFamily:'inherit', outline:'none' }}>
          {TAGS.map(t=><option key={t}>{t}</option>)}
        </select>
        <button onClick={add} style={{ padding:'9px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Add</button>
      </div>
      {(lead.memory||[]).length===0 ? (
        <div style={{ textAlign:'center', padding:'40px', color:T2 }}>No memory entries yet. Add context above.</div>
      ) : (lead.memory||[]).map(m=>(
        <div key={m.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--b1)', borderRadius:10 }}>
          <Brain size={13} color="#7C5CE8" style={{ flexShrink:0, marginTop:2 }}/>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:12, color:T1, lineHeight:1.6, margin:0 }}>{m.text}</p>
            <div style={{ display:'flex', gap:6, marginTop:5 }}>
              {m.tag && <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99, background:`${TAG_COLORS[m.tag]||'#60A5FA'}18`, color:TAG_COLORS[m.tag]||'#60A5FA' }}>{m.tag}</span>}
              <span style={{ fontSize:10, color:T2 }}>{m.date}</span>
            </div>
          </div>
          <button onClick={()=>removeMemoryEntry(lead.id,m.id)} style={{ padding:4, border:'none', background:'transparent', cursor:'pointer', color:'var(--t3)', opacity:0.5, transition:'opacity 0.12s' }}
            onMouseEnter={e=>{e.currentTarget.style.opacity='1'; e.currentTarget.style.color='#EF4444';}}
            onMouseLeave={e=>{e.currentTarget.style.opacity='0.5'; e.currentTarget.style.color='var(--t3)';}}>
            <X size={12}/>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Tab: Cadence ─── */
function CadenceTab({ lead }) {
  const { markStepComplete, advanceCadenceDay, openCopilot, addActivity, updateLead } = useApp();
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const CHANNEL_TO_COPILOT_MODE = { Email:'email', SMS:'sms', VM:'voicemail', LinkedIn:'linkedin' };

  const [activeStepGen, setActiveStepGen] = useState(null);
  const [stepCopied,    setStepCopied]    = useState(null);
  const [stepPaste,     setStepPaste]     = useState('');
  const [stepSaved,     setStepSaved]     = useState(null);

  const currentDay = lead.cadenceDay || 0;

  // Phase 9A-1: use the lead's active plan (cadenceSteps || SEQ_PLAN).
  // totalDays falls back to activePlan.length so custom cadences show
  // the correct total rather than always showing 7.
  const activePlan     = (lead.cadenceSteps?.length ? lead.cadenceSteps : SEQ_PLAN);
  const totalDays      = lead.cadenceTotal || activePlan.length || 7;
  const pendingToday   = getPendingSteps(lead);
  const dayDone        = isDayComplete(lead);
  const cadDone        = isCadenceComplete(lead);
  const stepsInCadence = activePlan.filter(s => s.day <= totalDays).sort((a, b) => a.day - b.day);

  // Phase 9A-1: pass activePlan to nextCadenceDay so custom cadence day
  // advancement resolves correctly against the assigned plan, not SEQ_PLAN.
  const nextDay = nextCadenceDay(currentDay, activePlan);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Progress header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          <span style={{ fontSize:13, fontWeight:600, color:T1 }}>
            {cadDone ? 'Cadence Complete ✓' : currentDay === 0 ? (lead.cadenceName || 'Cadence Assigned') : `Day ${currentDay} of ${totalDays}`}
          </span>
          {lead.cadenceName && (
            <span style={{ fontSize:10, color:T2 }}>{lead.cadenceName}</span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Phase 9A-1: Start Cadence button — shown when a cadence is assigned
              but not yet started (cadenceDay === 0). Sets cadenceDay to 1 so
              CadenceTab renders the first day's steps as pending. */}
          {currentDay === 0 && stepsInCadence.length > 0 && (
            <button
              onClick={() => {
                updateLead(lead.id, { cadenceDay: 1 });
                addActivity(lead.id, 'Cadence Update', `Cadence started: Day 1${lead.cadenceName ? ' — ' + lead.cadenceName : ''}`, { source: 'cadence', cadenceDay: 1 });
              }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='#4828B5'}
              onMouseLeave={e => e.currentTarget.style.background='#5B3FC8'}>
              ▶ Start Cadence
            </button>
          )}
          {!cadDone && dayDone && currentDay > 0 && (
            <button
              onClick={() => advanceCadenceDay(lead.id)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='#4828B5'}
              onMouseLeave={e => e.currentTarget.style.background='#5B3FC8'}>
              Advance to Day {nextDay} →
            </button>
          )}
          {!cadDone && !dayDone && currentDay > 0 && (
            <span style={{ fontSize:11, color:T2 }}>
              {pendingToday.length} step{pendingToday.length !== 1 ? 's' : ''} remaining today
            </span>
          )}
        </div>
      </div>

      {/* Step list */}
      <div style={{ position:'relative', paddingLeft:40 }}>
        <div style={{ position:'absolute', left:14, top:20, bottom:0, width:2, background:B1 }}/>

        {stepsInCadence.map(step => {
          const done    = !!(lead.seqLog?.[step.key] === true ||
                            (typeof lead.seqLog?.[step.key] === 'object' && lead.seqLog[step.key]?.completed));
          const isCur   = step.day === currentDay;
          const isPast  = step.day < currentDay;
          const isFut   = step.day > currentDay;
          const pending = isCur && !done;

          return (
            <div key={step.key}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: activeStepGen===step.day ? 0 : 18, position:'relative' }}>
              {/* Timeline dot */}
              <div style={{
                position:'absolute', left:-26, width:14, height:14, borderRadius:'50%', zIndex:1,
                background: done ? '#10B981' : pending ? '#5B3FC8' : 'var(--bg)',
                border: `2px solid ${done ? '#10B981' : pending ? '#5B3FC8' : B1}`,
                boxShadow: pending ? '0 0 10px rgba(91,63,200,0.4)' : 'none',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                {done && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </div>

              {/* Day label */}
              <span style={{ fontSize:10, fontFamily:'JetBrains Mono,monospace', color:T2, width:36, flexShrink:0 }}>
                Day {step.day}
              </span>

              {/* Step info */}
              <div style={{ flex:1 }}>
                <span style={{ fontSize:12, fontWeight:isCur ? 600 : 400, color: done ? T2 : pending ? '#7C5CE8' : isFut ? T2 : T1 }}>
                  {step.label}
                </span>
                <span style={{ fontSize:10, color:T2, marginLeft:8 }}>{step.channel}</span>
              </div>

              {/* Actions / status badges */}
              {pending && (
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button
                    onClick={() => openCopilot(CHANNEL_TO_COPILOT_MODE[step.channel] || 'email', lead)}
                    title={`Generate ${step.channel} in AI Copilot`}
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'1px solid rgba(91,63,200,0.4)', background:'rgba(91,63,200,0.1)', color:'#7C5CE8', cursor:'pointer', fontFamily:'inherit', fontWeight:600, transition:'all 0.12s', flexShrink:0 }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(91,63,200,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(91,63,200,0.1)'; }}>
                    Generate ✨
                  </button>
                  <button
                    onClick={() => {
                      const prompt = buildCadenceStepPrompt(lead, step);
                      navigator.clipboard.writeText(prompt);
                      setActiveStepGen(step.day);
                      setStepCopied(step.day);
                      setTimeout(() => setStepCopied(null), 2500);
                    }}
                    title="Copy Claude prompt for this step"
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'1px solid rgba(56,189,248,0.4)', background: stepCopied===step.day ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.1)', color: stepCopied===step.day ? '#10B981' : '#38BDF8', cursor:'pointer', fontFamily:'inherit', fontWeight:600, transition:'all 0.12s', flexShrink:0 }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(56,189,248,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background= stepCopied===step.day ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.1)'; }}>
                    {stepCopied===step.day ? '✓ Copied!' : '📋 Copy Prompt'}
                  </button>
                  <button
                    onClick={() => markStepComplete(lead.id, step.key, currentDay)}
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'1px solid rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.1)', color:'#10B981', cursor:'pointer', fontFamily:'inherit', fontWeight:600, transition:'all 0.12s', flexShrink:0 }}
                    onMouseEnter={e => { e.currentTarget.style.background='rgba(16,185,129,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background='rgba(16,185,129,0.1)'; }}>
                    Mark Done
                  </button>
                </div>
              )}
              {done && <span style={{ fontSize:10, color:'#10B981', fontWeight:600, flexShrink:0 }}>✓ Done</span>}
              {isCur && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:99, background: pending ? 'rgba(91,63,200,0.15)' : 'rgba(16,185,129,0.12)', color: pending ? '#7C5CE8' : '#10B981', flexShrink:0 }}>
                  {pending ? 'Today' : 'Complete'}
                </span>
              )}
            </div>

            {/* Paste panel — shown after copying step prompt */}
            {activeStepGen === step.day && (
              <div style={{ marginLeft:40, marginTop:8, marginBottom:18, background:'var(--bg)', border:'1px solid rgba(56,189,248,0.3)', borderRadius:10, padding:'12px', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:11, fontWeight:600, color:T1 }}>
                  Prompt copied — paste Claude's {step.channel} response below:
                </div>
                {stepSaved === step.day ? (
                  <div style={{ fontSize:11, fontWeight:600, color:'#10B981' }}>✓ Saved to activity log!</div>
                ) : (
                  <>
                    <textarea
                      value={stepPaste}
                      onChange={e => setStepPaste(e.target.value)}
                      rows={5}
                      placeholder={`Paste Claude's Day ${step.day} ${step.channel} here…`}
                      style={{ width:'100%', padding:'9px 11px', borderRadius:8, border:`1px solid ${B1}`, background:'var(--s2)', color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.7, resize:'vertical', outline:'none' }}
                    />
                    <div style={{ display:'flex', gap:8 }}>
                      <button
                        onClick={() => { setActiveStepGen(null); setStepPaste(''); }}
                        style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!stepPaste.trim()) return;
                          addActivity(lead.id, 'Email', `Cadence Day ${step.day} ${step.channel} generated`, { content: stepPaste, subject: '', source: 'copilot' });
                          // Phase 8D-1: pushGeneratedContent removed.
                          // Previously appended a full duplicate lead row per cadence step paste.
                          // Cadence step content is stored as an activity — no sheet push needed.
                          setStepSaved(step.day);
                          setTimeout(() => { setStepPaste(''); setActiveStepGen(null); setStepSaved(null); }, 1500);
                        }}
                        disabled={!stepPaste.trim()}
                        style={{ flex:2, padding:'7px', borderRadius:8, border:'none', background: stepPaste.trim() ? '#5B3FC8' : 'rgba(91,63,200,0.3)', color:'#fff', fontSize:11, fontWeight:600, cursor: stepPaste.trim() ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
                        💾 Save to Activity Log
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Cadence complete state */}
      {cadDone && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', borderRadius:10, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)' }}>
          <span style={{ fontSize:13 }}>🎉</span>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'#10B981' }}>Cadence Complete</div>
            <div style={{ fontSize:11, color:T2 }}>All {totalDays} days finished. Consider enrolling in a new cadence.</div>
          </div>
        </div>
      )}

      {/* Not started state */}
      {currentDay === 0 && (
        <div style={{ textAlign:'center', padding:'32px', color:T2, fontSize:12 }}>
          {stepsInCadence.length > 0
            ? <><strong style={{ color:T1 }}>{lead.cadenceName || 'Cadence'}</strong> is assigned. Click <strong style={{ color:'#7C5CE8' }}>▶ Start Cadence</strong> above to begin Day 1.</>
            : <>No cadence assigned. Apply one from the <strong style={{ color:T1 }}>Cadences</strong> view.</>
          }
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN LEAD PAGE
═══════════════════════════════════════════════════════════════ */
export default function LeadPage() {
  const { activeLead, closeLead, updateLead, openCopilot } = useApp();
  const [tab,           setTab]           = useState('overview');
  const [followUpOpen,  setFollowUpOpen]  = useState(false);
  const [callNotesOpen, setCallNotesOpen] = useState(false);
  const [prepareOpen,   setPrepareOpen]   = useState(false);
  const [recordingOpen, setRecordingOpen] = useState(false);

  if (!activeLead) return null;
  const lead = activeLead;
  const initials = lead.business.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const stageStyle = STAGE_STYLE[lead.stage] || STAGE_STYLE['New'];
  const intel = lead.intelligence || {};
  const cadProgress = getCadenceProgress(lead);

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:0 }}>

      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <button onClick={closeLead} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, cursor:'pointer', fontSize:12, fontFamily:'inherit', transition:'all 0.15s' }}
          onMouseEnter={e=>{ e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)'; }}
          onMouseLeave={e=>{ e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1; }}>
          <ArrowLeft size={13}/> Back
        </button>
        <ChevronRight size={12} color="var(--t3)"/>
        <span style={{ fontSize:12, color:T1, fontWeight:500 }}>{lead.business}</span>
      </div>

      {/* ── Header ── */}
      <div style={{ background:'var(--s1)', border:`1px solid ${B1}`, borderRadius:14, padding:'20px 24px', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>

          {/* Left: avatar + info */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>
            <div style={{ width:52, height:52, borderRadius:14, flexShrink:0, background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'#fff', boxShadow:'0 6px 20px rgba(91,63,200,0.35)' }}>
              {initials}
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:5 }}>
                <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>{lead.business}</h1>
                <span style={{ ...stageStyle, fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:99 }}>🔥 {lead.stage}</span>
                <Star size={15} color="var(--t3)" style={{ cursor:'pointer' }}/>
              </div>
              {lead.contact && <div style={{ fontSize:12, color:T2, marginBottom:5 }}>{lead.contact} · Owner</div>}
              <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                {lead.salesloftUrl && <a href={lead.salesloftUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4, textDecoration:'none' }}><span style={{ fontSize:10, fontWeight:600, padding:'1px 5px', borderRadius:3, background:'rgba(91,63,200,0.15)', color:'#7C5CE8' }}>SL</span> Salesloft</a>}
                {lead.website && <a href={`https://${lead.website}`} target="_blank" rel="noreferrer" style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4, textDecoration:'none' }}><Globe size={11}/> Website</a>}
                {lead.gmbUrl && <a href={lead.gmbUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4, textDecoration:'none' }}><MapPin size={11}/> GMB</a>}
                <span style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4 }}><Phone size={11}/>{lead.phone}</span>
                <span style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4 }}><Mail size={11}/>{lead.email}</span>
                <span style={{ fontSize:11, color:T2, display:'flex', alignItems:'center', gap:4 }}><MapPin size={11}/>{lead.city}</span>
              </div>
            </div>
          </div>

          {/* Right: metrics + action buttons */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'flex-end' }}>
            {/* Salesloft + Copy buttons */}
            <div style={{ display:'flex', gap:8 }}>
              {lead.salesloftUrl && (
                <a href={lead.salesloftUrl} target="_blank" rel="noreferrer" style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, textDecoration:'none', fontFamily:'inherit', transition:'all 0.15s' }}>
                  <ExternalLink size={12}/> Open in Salesloft
                </a>
              )}
              <button onClick={()=>{ const s=`${lead.business} | ${lead.contact||''} | ${lead.email||''} | ${lead.stage} | ${intel.nextBestAction||lead.nextAction||''}`; navigator.clipboard.writeText(s); }} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)';}}
                onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1;}}>
                <Copy size={12}/> Copy Summary
              </button>
              <button style={{ padding:'7px 8px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, cursor:'pointer', display:'flex' }}>
                <MoreHorizontal size={14}/>
              </button>
            </div>

            {/* Key metrics row */}
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2 }}>AI Score</div>
                <ScoreRing score={lead.aiScore} size={44}/>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Lead Score</div>
                <div style={{ fontSize:20, fontWeight:700, color:'#7C5CE8', fontFamily:'JetBrains Mono,monospace' }}>{lead.aiScore}</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Last Touch</div>
                <div style={{ fontSize:13, fontWeight:600, color:T1 }}>{lead.lastTouch||'Never'}</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Next Best Action</div>
                <div style={{ fontSize:12, fontWeight:600, color:'#7C5CE8', maxWidth:120, textAlign:'right' }}>{intel.nextBestAction||lead.nextAction||'—'}</div>
              </div>
              {cadProgress.name && (
                <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'flex-end' }}>
                  <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>Cadence</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 9px', borderRadius:8, background:'rgba(91,63,200,0.08)', border:'1px solid rgba(91,63,200,0.2)' }}>
                    <GitBranch size={10} color="#7C5CE8"/>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}>
                      <span style={{ fontSize:10, fontWeight:600, color:'#7C5CE8', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cadProgress.name}</span>
                      <span style={{ fontSize:9, color:'var(--t2)' }}>
                        {cadProgress.isComplete ? `✓ Done · ${cadProgress.pct}%` : cadProgress.isStarted ? `Day ${cadProgress.day}/${cadProgress.total} · ${cadProgress.pct}%` : 'Assigned · Not started'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stage pills */}
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {STAGES_ALL.map(s=>{
                const active=lead.stage===s, st=STAGE_STYLE[s]||STAGE_STYLE['New'];
                return (
                  <button key={s} onClick={()=>updateLead(lead.id,{stage:s})} style={{ fontSize:10, fontWeight:600, padding:'3px 10px', borderRadius:99, border:active?`1px solid ${st.border}`:`1px solid ${B1}`, background:active?st.bg:'transparent', color:active?st.color:T2, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}>
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Schedule Follow Up */}
            <button onClick={()=>setFollowUpOpen(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(91,63,200,0.35)', background:'rgba(91,63,200,0.08)', color:'#7C5CE8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(91,63,200,0.15)';}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(91,63,200,0.08)';}}>
              <Calendar size={12}/> Schedule Follow Up
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', overflowX:'auto', borderBottom:`1px solid ${B1}`, background:'var(--s1)', borderRadius:'12px 12px 0 0', padding:'0 4px' }}>
        {TABS.map(({ id, label })=>{
          const active=tab===id;
          // Phase 7C-2D: account_knowledge badge shows pending AK fact count (amber)
          // Phase 7D-A: badge also includes conflict count (⚡ indicator when conflicts exist)
          // activities / followups badges use existing blue pill style
          const isAKTab   = id === 'account_knowledge';
          const akPending  = isAKTab ? countPendingAK(lead.accountKnowledge) : 0;
          const akConflict = isAKTab ? countConflicts(lead.accountKnowledge) : 0;
          const badge = id==='activities' ? (lead.activities||[]).length : id==='followups' ? (lead.followUps||[]).filter(f=>!f.done).length : 0;
          return (
            <button key={id} onClick={()=>setTab(id)} style={{ padding:'11px 14px', border:'none', background:'transparent', borderBottom:active?'2px solid var(--p)':'2px solid transparent', color:active?'var(--p-glow)':T2, fontSize:11, fontWeight:active?600:400, cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', transition:'color 0.12s', marginBottom:'-1px', display:'flex', alignItems:'center', gap:5 }}>
              {label}
              {badge>0 && <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:99, background:'rgba(91,63,200,0.2)', color:'#7C5CE8' }}>{badge}</span>}
              {isAKTab && akPending>0 && <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:99, background:'rgba(245,158,11,0.2)', color:'#F59E0B' }}>{akPending}</span>}
              {isAKTab && akConflict>0 && <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:99, background:'rgba(239,68,68,0.18)', color:'#F87171' }}>⚡{akConflict}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div style={{ background:'var(--s1)', border:`1px solid ${B1}`, borderTop:'none', borderRadius:'0 0 12px 12px', padding:'20px', minHeight:400 }}>
        {tab==='overview'        && <OverviewTab    lead={lead} onCallNotes={()=>setCallNotesOpen(true)} onPrepareCall={()=>setPrepareOpen(true)} onFollowUp={()=>setFollowUpOpen(true)} onRecording={()=>setRecordingOpen(true)} onTabChange={setTab}/>}
        {tab==='ae_notes'        && <AENotesTab     lead={lead}/>}
        {tab==='ai_intelligence' && <AIIntelTab     lead={lead}/>}
        {tab==='account_knowledge' && <AccountKnowledgeTab lead={lead}/>}
        {tab==='timeline'        && <TimelineTab    lead={lead}/>}
        {tab==='activities'      && <ActivitiesTab  lead={lead}/>}
        {tab==='emails'          && <ChannelTab     lead={lead} channel="Email"/>}
        {tab==='sms'             && <ChannelTab     lead={lead} channel="SMS"/>}
        {tab==='linkedin'        && <ChannelTab     lead={lead} channel="LinkedIn"/>}
        {tab==='voicemails'      && <ChannelTab     lead={lead} channel="Voicemail"/>}
        {tab==='followups'       && <FollowUpsTab   lead={lead} onSchedule={()=>setFollowUpOpen(true)}/>}
        {tab==='memory'          && <MemoryTab      lead={lead}/>}
        {tab==='cadence'         && <CadenceTab     lead={lead}/>}
      </div>

      {/* Modals */}
      {followUpOpen  && <FollowUpModal    lead={lead} onClose={()=>setFollowUpOpen(false)}/>}
      {callNotesOpen && <CallNotesModal   lead={lead} onClose={()=>setCallNotesOpen(false)}/>}
      {prepareOpen   && <PrepareCallDrawer lead={lead} onClose={()=>setPrepareOpen(false)} onTabChange={setTab}/>}
      {recordingOpen && <RecordingUpload    lead={lead} onClose={()=>setRecordingOpen(false)}/>}
    </div>
  );
}
