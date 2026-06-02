import { useState, useEffect, useRef } from 'react';
import { Code, Lock, Unlock, Save, CheckCircle2, RotateCcw } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

// ─── Constants ────────────────────────────────────────────────────────────────
const PROMPT_ACTIONS = [
  { mode: 'email',       label: 'Generate Email',      desc: 'Personalized cold outreach based on lead data',       status: 'active' },
  { mode: 'aeNotes',     label: 'Generate AE Notes',   desc: 'Handoff summary for Account Executives',              status: 'active' },
  { mode: 'sms',         label: 'SMS Hook',             desc: 'Brief mobile-first conversation starters',           status: 'active' },
  { mode: 'reEngage',    label: 'Re-engage',            desc: 'Wake up dormant leads with value propositions',      status: 'active' },
  { mode: 'linkedin',    label: 'LinkedIn DM',          desc: 'Social-selling scripts for InMail',                  status: 'draft'  },
  { mode: 'voicemail',   label: 'Voicemail Script',     desc: 'High-conversion voicemail patterns',                 status: 'active' },
  { mode: 'situational', label: 'Situational',          desc: 'Context-aware outreach for specific triggers',       status: 'draft'  },
  { mode: 'cadence',     label: 'Cadence Briefing',     desc: 'Next step recommendations in active sequence',       status: 'draft'  },
  { mode: 'notes',       label: 'Call Notes AI',        desc: 'Intelligence extraction from call notes',            status: 'active' },
];

const TEMPLATE_TAGS = [
  '{{first_name}}', '{{biz_name}}', '{{industry}}', '{{ai_score}}',
  '{{competitor_1}}', '{{city}}', '{{pain_point_1}}', '{{last_touch}}',
  '{{objection_1}}', '{{reviews}}', '{{ai_visibility}}',
];


const DEFAULT_PROMPTS = {
  email: `You are a world-class SDR at Birdeye. Write a high-converting cold outreach email to {{first_name}} at {{biz_name}}.

Context:
- Location: {{city}}
- Industry: {{industry}}
- AI Score: {{ai_score}}
- Reviews: {{reviews}}
- AI Visibility: {{ai_visibility}}
- Top Competitor: {{competitor_1}}
- Main Pain Point: {{pain_point_1}}
- Last Touch: {{last_touch}}

Rules:
1. Subject line must be under 6 words.
2. Email body must be under 80 words.
3. Reference {{competitor_1}} and the pain point.
4. End with a soft question CTA — not a meeting request.
5. Sign off: [Your Name] | SDR, Birdeye

Output JSON only with keys: subject, body`,

  aeNotes: `You are preparing AE handoff notes for {{biz_name}}.

Lead: {{first_name}} | {{industry}} | {{city}}
AI Score: {{ai_score}} | Reviews: {{reviews}} | AI Visibility: {{ai_visibility}}
Pain Point: {{pain_point_1}} | Competitor: {{competitor_1}}
Last Touch: {{last_touch}} | Objection: {{objection_1}}

Generate structured AE notes covering:
1. Business Overview
2. Why They Need Birdeye
3. Pain Points Identified
4. Competitors in Play
5. Objections to Address
6. Recommended Next Step`,

  sms: `Write a short SMS for {{first_name}} at {{biz_name}}.
Pain: {{pain_point_1}} | Competitor: {{competitor_1}} | Score: {{ai_score}}

Rules:
- Under 160 characters
- Casual, human tone
- End with a question
- No links`,

  reEngage: `{{biz_name}} has gone cold. Re-engage {{first_name}}.

Last Touch: {{last_touch}} | Pain: {{pain_point_1}} | Score: {{ai_score}}

Write a re-engagement message that:
1. Acknowledges the silence without being awkward
2. Leads with a new angle or insight
3. References {{competitor_1}} if relevant
4. Ends with an easy yes/no question`,

  linkedin: `Write a LinkedIn DM for {{first_name}} at {{biz_name}}.

Context: {{industry}} | {{city}} | Score: {{ai_score}} | Pain: {{pain_point_1}}

Rules:
- Under 300 characters
- No buzzwords
- Reference something specific about their business
- Soft CTA only`,

  voicemail: `Write a voicemail script for {{first_name}} at {{biz_name}}.

Pain: {{pain_point_1}} | Competitor: {{competitor_1}} | Score: {{ai_score}}

Rules:
- Under 25 seconds when read aloud (approx 60 words)
- State your name and company immediately
- One specific value hook
- Clear callback ask with your number placeholder`,

  situational: `Situational outreach for {{first_name}} at {{biz_name}}.

Trigger context: [describe the trigger]
Score: {{ai_score}} | Industry: {{industry}} | Pain: {{pain_point_1}}

Write an outreach message that references the specific trigger event and connects it to a Birdeye value prop.`,

  cadence: `Cadence next step recommendation for {{biz_name}}.

Current stage: {{last_touch}} | Score: {{ai_score}} | Pain: {{pain_point_1}}
Objection on file: {{objection_1}}

Recommend:
1. Best next action (Call / Email / SMS / LinkedIn)
2. Suggested message angle
3. Timing recommendation
4. What to say if they push back`,

  notes: `Extract intelligence from these call notes for {{biz_name}}.

Notes: [paste call notes here]

Extract and return JSON with:
- summary (2 sentences)
- painPoints (array of strings)
- objections (array of strings)
- competitors (array of strings)
- buyingSignals (array of strings)
- nextBestAction (string)
- leadTemperature (Cold / Warm / Hot)
- sentiment (Positive / Neutral / Negative)`,
};


// ─── LocalStorage helpers ─────────────────────────────────────────────────────
const LS_OVERRIDES = 'birdeye_prompt_overrides';
const LS_LIBRARY   = 'birdeye_prompt_library';
function loadLS(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function saveLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── SegmentedControl — pure presentational, no hooks ────────────────────────
function SegmentedControl({ options, value, onChange, disabled, T1, T2, S2, S3, B1 }) {
  return (
    <div style={{ display:'flex', background:S2, borderRadius:8, padding:3, border:`1px solid ${B1}`, opacity:disabled?0.5:1, pointerEvents:disabled?'none':'auto' }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button key={opt.value} onClick={() => onChange(opt.value)} style={{
            flex:1, padding:'5px 0', borderRadius:6,
            border: active ? `1px solid ${B1}` : '1px solid transparent',
            background: active ? S3 : 'transparent',
            color: active ? T1 : T2,
            fontWeight: active ? 600 : 400,
            fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.12s',
          }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}


// ─── Main export ──────────────────────────────────────────────────────────────
export default function PromptBuilder() {
  const { T1, T2, T3, B1, B2, S1, S2, S3, BG } = useTheme();

  const [selectedMode,  setSelectedMode]  = useState('email');
  const [overrides,     setOverrides]     = useState(() => loadLS(LS_OVERRIDES));
  const [library,       setLibrary]       = useState(() => loadLS(LS_LIBRARY));
  const [toneProfile,   setToneProfile]   = useState({});
  const [maxLength,     setMaxLength]     = useState({});
  const [editText,      setEditText]      = useState(DEFAULT_PROMPTS['email'] || '');
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockNote,      setLockNote]      = useState('');
  const [savedToast,    setSavedToast]    = useState(false);

  // Ref map for tag pill flash — avoids any state inside map()
  const tagRefs = useRef({});

  // Derived
  const isLocked      = !!library[selectedMode];
  const lockedVersion = library[selectedMode]?.lockedVersion || 0;
  const lockedAt      = library[selectedMode]?.lockedAt      || null;
  const lockedNote    = library[selectedMode]?.notes         || '';
  const currentAction = PROMPT_ACTIONS.find(a => a.mode === selectedMode) || PROMPT_ACTIONS[0];

  // Sync editor when mode switches
  useEffect(() => {
    setEditText(
      library[selectedMode]?.promptText  ||
      overrides[selectedMode]?.promptText ||
      DEFAULT_PROMPTS[selectedMode]       ||
      ''
    );
    setLockNote('');
  }, [selectedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action handlers ──
  const showToast = () => { setSavedToast(true); setTimeout(() => setSavedToast(false), 2500); };

  const handleSaveDraft = () => {
    const updated = { ...overrides, [selectedMode]: { promptText: editText, toneProfile: toneProfile[selectedMode]||'professional', maxLength: maxLength[selectedMode]||'medium', updatedAt: new Date().toISOString() } };
    setOverrides(updated); saveLS(LS_OVERRIDES, updated); showToast();
  };

  const handleLockConfirm = () => {
    const newVersion = (library[selectedMode]?.lockedVersion || 0) + 1;
    const updated = { ...library, [selectedMode]: { promptText: editText, toneProfile: toneProfile[selectedMode]||'professional', maxLength: maxLength[selectedMode]||'medium', lockedAt: new Date().toISOString(), lockedVersion: newVersion, notes: lockNote } };
    setLibrary(updated); saveLS(LS_LIBRARY, updated); setShowLockModal(false); setLockNote(''); showToast();
  };

  const handleUnlock = () => {
    const updated = { ...library }; delete updated[selectedMode];
    setLibrary(updated); saveLS(LS_LIBRARY, updated);
  };

  const handleRestoreDefault = () => {
    const updOv = { ...overrides }; delete updOv[selectedMode];
    const updLi = { ...library  }; delete updLi[selectedMode];
    setOverrides(updOv); setLibrary(updLi);
    saveLS(LS_OVERRIDES, updOv); saveLS(LS_LIBRARY, updLi);
    setEditText(DEFAULT_PROMPTS[selectedMode] || '');
  };

  const handleTagClick = (tag) => {
    navigator.clipboard.writeText(tag).catch(() => {});
    const el = tagRefs.current[tag];
    if (el) { el.style.background = 'rgba(91,63,200,0.25)'; setTimeout(() => { if (el) el.style.background = BG; }, 200); }
  };

  // ── Style helpers ──
  const inp = (extra = {}) => ({ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s', boxSizing:'border-box', ...extra });
  const ghost = { display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' };

  const getStatusLine = (mode) => {
    const lib = library[mode]; const ov = overrides[mode];
    if (lib) return `🔒 Locked v${lib.lockedVersion} · ${fmtDate(lib.lockedAt)}`;
    if (ov)  return `Draft · saved ${relativeTime(ov.updatedAt)}`;
    return 'Using default';
  };


  return (
    <>
      {/* ═══ Page shell ═══ */}
      <div style={{ display:'flex', height:'calc(100vh - 56px)', overflow:'hidden', fontFamily:'Inter,system-ui,sans-serif' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width:260, flexShrink:0, borderRight:`1px solid ${B1}`, overflowY:'auto', display:'flex', flexDirection:'column', background:S1 }}>
          <div style={{ padding:'14px 14px 10px', borderBottom:`1px solid ${B1}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Prompt Actions</span>
              <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99, background:S3, color:T2 }}>{PROMPT_ACTIONS.length}</span>
            </div>
          </div>
          <div style={{ flex:1, padding:'6px 8px' }}>
            {PROMPT_ACTIONS.map(action => {
              const isSel = selectedMode === action.mode;
              const isLib = !!library[action.mode];
              return (
                <button key={action.mode} onClick={() => setSelectedMode(action.mode)} style={{
                  width:'100%', display:'flex', flexDirection:'column', gap:2,
                  padding:'9px 10px 9px', paddingLeft: isSel ? 10 : 13,
                  borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', textAlign:'left', marginBottom:2,
                  borderLeft: isSel ? '3px solid #5B3FC8' : '3px solid transparent',
                  background: isSel ? 'rgba(91,63,200,0.07)' : 'transparent', transition:'all 0.12s',
                }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = S3; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:T1, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{action.label}</span>
                    {isLib
                      ? <span style={{ fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:S3, color:T2, flexShrink:0 }}>🔒 v{library[action.mode]?.lockedVersion}</span>
                      : action.status === 'active'
                        ? <span style={{ fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:'rgba(16,185,129,0.12)', color:'#10B981', flexShrink:0 }}>Active</span>
                        : <span style={{ fontSize:9, fontWeight:600, padding:'1px 6px', borderRadius:99, background:S3, color:T3, flexShrink:0 }}>Draft</span>
                    }
                  </div>
                  <span style={{ fontSize:11, color:T2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'block' }}>{action.desc}</span>
                  <span style={{ fontSize:10, color:T3 }}>{getStatusLine(action.mode)}</span>
                </button>
              );
            })}
          </div>
        </div>


        {/* ── RIGHT PANEL ── */}
        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', background:BG }}>

          {/* Sticky header */}
          <div style={{ position:'sticky', top:0, zIndex:10, height:56, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', borderBottom:`1px solid ${B1}`, background:S1, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(91,63,200,0.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Code size={16} color="#7C5CE8"/>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:T1, lineHeight:1.2 }}>{currentAction.label}</div>
                <div style={{ fontSize:11, color:T2, marginTop:2 }}>{currentAction.desc}</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={handleRestoreDefault} disabled={isLocked}
                style={{ ...ghost, opacity:isLocked?0.4:1, cursor:isLocked?'not-allowed':'pointer' }}
                onMouseEnter={e => { if (!isLocked) { e.currentTarget.style.color=T1; e.currentTarget.style.borderColor=B2; } }}
                onMouseLeave={e => { e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1; }}>
                <RotateCcw size={13}/> Restore Default
              </button>
              {isLocked ? (
                <button onClick={handleUnlock} style={{ ...ghost }}
                  onMouseEnter={e => { e.currentTarget.style.color=T1; e.currentTarget.style.borderColor=B2; }}
                  onMouseLeave={e => { e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1; }}>
                  <Unlock size={13}/> Unlock to Edit
                </button>
              ) : (
                <button onClick={handleSaveDraft} style={{ ...ghost, background:S2, color:T1 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=B2; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=B1; }}>
                  <Save size={13}/> Save Draft
                </button>
              )}
              {!isLocked && (
                <button onClick={() => setShowLockModal(true)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)', transition:'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background='#4828B5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='#5B3FC8'; }}>
                  <Lock size={13}/> Lock &amp; Save Permanently
                </button>
              )}
            </div>
          </div>


          {/* Content + sidebar row */}
          <div style={{ display:'flex', gap:20, padding:24, alignItems:'flex-start' }}>

            {/* ── Cards column ── */}
            <div style={{ flex:1, maxWidth:860, display:'flex', flexDirection:'column', gap:16 }}>

              {/* CARD 1 — Identity */}
              <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>Identity</div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Internal Name</div>
                  <input key={`n-${selectedMode}`} defaultValue={currentAction.label} disabled={isLocked}
                    style={{ ...inp(), opacity:isLocked?0.6:1 }}
                    onFocus={e => { if (!isLocked) e.target.style.borderColor='#5B3FC8'; }}
                    onBlur={e => { e.target.style.borderColor=B1; }}/>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Description</div>
                  <textarea key={`d-${selectedMode}`} defaultValue={currentAction.desc} disabled={isLocked} rows={2}
                    style={{ ...inp({ resize:'none', lineHeight:1.6 }), opacity:isLocked?0.6:1 }}
                    onFocus={e => { if (!isLocked) e.target.style.borderColor='#5B3FC8'; }}
                    onBlur={e => { e.target.style.borderColor=B1; }}/>
                </div>
              </div>

              {/* CARD 2 — System Instructions */}
              <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>&lt;/&gt; System Instructions</span>
                  <span style={{ fontSize:10, fontStyle:'italic', color:T2 }}>Markdown and liquid tags supported</span>
                </div>
                {isLocked && (
                  <div style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:8, padding:'10px 14px', color:'#10B981', fontSize:12 }}>
                    🔒 Locked v{lockedVersion} · {lockedNote || 'No label'} · {fmtDate(lockedAt)}
                  </div>
                )}
                <textarea value={editText} onChange={e => setEditText(e.target.value)} readOnly={isLocked}
                  style={{ width:'100%', height:320, padding:14, borderRadius:8, border:`1px solid ${B1}`, background:isLocked?S1:S2, color:T1, fontSize:12, fontFamily:'JetBrains Mono,monospace', lineHeight:1.7, resize:'vertical', outline:'none', opacity:isLocked?0.75:1, transition:'border-color 0.15s', boxSizing:'border-box' }}
                  onFocus={e => { if (!isLocked) e.target.style.borderColor='#5B3FC8'; }}
                  onBlur={e => { e.target.style.borderColor=B1; }}/>
                {!isLocked && <div style={{ fontSize:11, color:T2, fontStyle:'italic' }}>Draft — not yet locked. Lock to make this version permanent.</div>}
              </div>

              {/* CARD 3 — Constraints */}
              <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Tone Profile</div>
                  <SegmentedControl options={[{value:'professional',label:'Professional'},{value:'casual',label:'Casual'}]} value={toneProfile[selectedMode]||'professional'} onChange={v => setToneProfile(p => ({...p,[selectedMode]:v}))} disabled={isLocked} T1={T1} T2={T2} S2={S2} S3={S3} B1={B1}/>
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Max Length</div>
                  <SegmentedControl options={[{value:'short',label:'Short'},{value:'medium',label:'Medium'},{value:'long',label:'Long'}]} value={maxLength[selectedMode]||'medium'} onChange={v => setMaxLength(p => ({...p,[selectedMode]:v}))} disabled={isLocked} T1={T1} T2={T2} S2={S2} S3={S3} B1={B1}/>
                </div>
              </div>
            </div>


            {/* ── Right sidebar ── */}
            <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:14, position:'sticky', top:76 }}>

              {/* Panel A — Template Tags */}
              <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.06em', padding:'12px 14px', borderBottom:`1px solid ${B1}`, background:S2 }}>Template Tags</div>
                <div style={{ padding:14, display:'flex', flexWrap:'wrap', gap:7 }}>
                  {TEMPLATE_TAGS.map(tag => (
                    <button key={tag} ref={el => { tagRefs.current[tag] = el; }} onClick={() => handleTagClick(tag)}
                      style={{ background:BG, border:`1px solid ${B1}`, borderRadius:6, padding:'4px 8px', fontSize:11, fontFamily:'JetBrains Mono,monospace', color:'#7C5CE8', cursor:'pointer', transition:'background 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background='rgba(91,63,200,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background=BG; }}>
                      {tag}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:10, fontStyle:'italic', color:T2, padding:'10px 14px', borderTop:`1px solid ${B1}` }}>Click any tag to copy to clipboard</div>
              </div>

              {/* Panel B — Lock Status */}
              {isLocked ? (
                <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#10B981', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>🔒 Locked</div>
                  <div style={{ fontSize:20, fontWeight:700, color:T1, marginBottom:4 }}>Version {lockedVersion}</div>
                  {lockedNote && <div style={{ fontSize:12, color:T2, fontStyle:'italic', marginBottom:4 }}>{lockedNote}</div>}
                  <div style={{ fontSize:11, color:T2, marginBottom:12 }}>{fmtDate(lockedAt)}</div>
                  <button onClick={handleUnlock} style={{ background:'none', border:'none', padding:0, fontSize:11, color:'#7C5CE8', cursor:'pointer', fontFamily:'inherit' }}>Unlock to Edit</button>
                </div>
              ) : (
                <div style={{ background:'rgba(91,63,200,0.05)', border:'1px solid rgba(91,63,200,0.15)', borderRadius:12, padding:16 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Draft</div>
                  <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:6 }}>Not yet locked</div>
                  <div style={{ fontSize:12, color:T2, lineHeight:1.6, marginBottom:12 }}>Edit, test, and lock when you&apos;re happy with the output.</div>
                  <button onClick={() => setShowLockModal(true)} style={{ background:'none', border:'none', padding:0, fontSize:11, color:'#5B3FC8', cursor:'pointer', fontFamily:'inherit' }}>Lock &amp; Save Permanently →</button>
                </div>
              )}
            </div>
          </div>{/* end content + sidebar row */}
        </div>{/* end right panel */}
      </div>{/* end page shell */}


      {/* ═══ Lock Modal ═══ */}
      {showLockModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => { setShowLockModal(false); setLockNote(''); }}>
          <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:28, width:420, maxWidth:'calc(100vw - 40px)', display:'flex', flexDirection:'column', gap:18 }}
            onClick={e => e.stopPropagation()}>
            {/* Title */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Lock size={18} color="#5B3FC8"/>
              <span style={{ fontSize:16, fontWeight:700, color:T1 }}>Lock this prompt?</span>
            </div>
            {/* Body */}
            <div style={{ fontSize:13, color:T2, lineHeight:1.6 }}>
              This will freeze the current version and make it the permanent prompt used by AI Copilot for this action.
            </div>
            {/* Label input */}
            <div>
              <div style={{ fontSize:11, color:T2, marginBottom:6 }}>Add a label for this version (optional)</div>
              <input value={lockNote} onChange={e => setLockNote(e.target.value)}
                placeholder="e.g. Best performer June 2025"
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' }}
                onFocus={e => { e.target.style.borderColor='#5B3FC8'; }}
                onBlur={e => { e.target.style.borderColor=B1; }}/>
            </div>
            {/* Buttons */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setShowLockModal(false); setLockNote(''); }}
                style={{ padding:'8px 18px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                Cancel
              </button>
              <button onClick={handleLockConfirm}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)' }}>
                <Lock size={13}/> Confirm Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Saved Toast ═══ */}
      {savedToast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:200, background:S1, border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 4px 20px rgba(0,0,0,0.3)', transition:'opacity 0.2s, transform 0.2s', opacity:1 }}>
          <CheckCircle2 size={16} color="#10B981"/>
          <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Changes saved ✓</span>
        </div>
      )}
    </>
  );
}
