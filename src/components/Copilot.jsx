import { useState } from 'react';
import { X, Zap, Copy, ExternalLink, CheckCircle2, ArrowRight,
         Sparkles, Mail, MessageSquare, Mic, Search,
         Brain, GitBranch, FileText, AlignLeft, Smile, Plus,
         ChevronRight, Link2, Loader } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildPrompt, buildTouchHistory, normalizeGeneratedContent, buildCadenceStepPrompt } from '../services/prompts';
import callAI from '../services/aiProvider';

const SHORTCUTS = [
  { id:'email',       icon:Mail,          label:'Generate Email',    desc:'Hyper-personalised outreach email',  color:'#7C5CE8', bg:'rgba(91,63,200,0.12)'  },
  { id:'sms',         icon:MessageSquare, label:'Generate SMS',      desc:'Short, casual text message',         color:'#3B82F6', bg:'rgba(59,130,246,0.12)' },
  { id:'voicemail',   icon:Mic,           label:'Voicemail Script',  desc:'30-second VM script',                color:'#F59E0B', bg:'rgba(245,158,11,0.12)' },
  { id:'linkedin',    icon:Link2,         label:'LinkedIn Message',  desc:'Connection + follow-ups',            color:'#0A66C2', bg:'rgba(10,102,194,0.12)' },
  { id:'search',      icon:Search,        label:'Find a Lead',       desc:'Search & open any lead',             color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  { id:'situational', icon:Brain,         label:'Situational',       desc:'Best move right now',                color:'#EC4899', bg:'rgba(236,72,153,0.12)' },
  { id:'cadence',     icon:GitBranch,     label:'Build Cadence',     desc:'AI-generate a full sequence',        color:'#7C5CE8', bg:'rgba(124,92,232,0.12)' },
  { id:'notes',       icon:FileText,      label:'Generate AE Notes', desc:'Summarise & structure lead context', color:'#38BDF8', bg:'rgba(56,189,248,0.12)' },
];

const WIZARD_STEPS = ['Analyze Profile', 'Generate', 'Review & Save'];

// ── Static preview for Claude copy-paste mode ─────────────────────────────────
function buildPreview(mode, lead) {
  if (!lead) return { subject:'No lead selected', body:'Open a lead first, then launch Copilot.' };
  const name = lead.contact?.split(' ')[0] || lead.business?.split(' ')[0] || 'there';
  const comp = lead.competitor ? ` (${lead.competitor})` : '';
  const gap  = lead.aiVisibility ?? 0;
  const previews = {
    email: {
      subject: `${lead.intent} — ${lead.business}`,
      body: `Hi ${name},\n\nNoticed ${lead.business} has ${lead.reviews||0} reviews while competitors in ${lead.city||'your area'}${comp} are dominating AI search with a ${gap}% visibility gap.\n\nBirdeye helps ${lead.industry||'businesses'} like yours close that gap in 30 days — typically 3× more reviews and appearing in AI recommendations.\n\nWould a 15-min call this week make sense?\n\nBest,\nPaul | Senior SDR, Birdeye`,
    },
    sms: {
      subject: 'SMS',
      body: `Hey ${name}! Paul from Birdeye — noticed ${lead.business} has a ${gap}% AI visibility gap vs competitors${comp}. Quick 15-min call this week? 📈`,
    },
    voicemail: {
      subject: '30-sec Voicemail Script',
      body: `[INTRO] "Hi ${name}, this is Paul from Birdeye."\n\n[HOOK] "I was looking at ${lead.business} and noticed you have ${lead.reviews||0} reviews while your competitors${comp} are getting significantly more calls from AI search."\n\n[CTA] "Give me a call back at [your number] or I'll shoot you a quick email. Thanks!"`,
    },
    linkedin: {
      subject: 'LinkedIn Connection',
      body: `Hi ${name},\n\nCame across ${lead.business} while researching ${lead.industry||'businesses'} in ${lead.city||'your area'} — impressive work.\n\nI help businesses with ${(lead.intent||'AI visibility').toLowerCase()}. Thought it might be relevant.\n\nWould you be open to connecting?`,
    },
    cadencestep: {
      subject: 'Cadence Step — context-specific prompt',
      body: 'This prompt uses your exact cadence step context (channel, day, angle). The full prompt is shown below.',
    },
  };
  return previews[mode] || previews.email;
}

// ── Launcher ──────────────────────────────────────────────────────────────────
function Launcher({ theme, onSelect }) {
  const { activeLead, settings } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const isGemini = settings?.aiProvider === 'gemini';

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      {/* Provider pill */}
      <div style={{ padding:'8px 20px 10px', borderBottom:`1px solid ${B1}`, display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 8px', borderRadius:99, background:isGemini?'rgba(59,130,246,0.12)':'rgba(91,63,200,0.12)', border:`1px solid ${isGemini?'rgba(59,130,246,0.3)':'rgba(91,63,200,0.3)'}` }}>
          <span style={{ fontSize:11 }}>{isGemini?'✨':'🤖'}</span>
          <span style={{ fontSize:10, fontWeight:700, color:isGemini?'#60A5FA':'#7C5CE8' }}>{isGemini?'Gemini — Direct Generation':'Claude — Copy & Paste'}</span>
        </div>
        {isGemini && !settings?.geminiKey && (
          <span style={{ fontSize:10, color:'#F59E0B' }}>⚠ Add Gemini key in Settings</span>
        )}
      </div>

      {/* Active lead context */}
      <div style={{ padding:'8px 20px 12px', borderBottom:`1px solid ${B1}` }}>
        {activeLead ? (
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, background:dark?'rgba(91,63,200,0.08)':'rgba(91,63,200,0.05)', border:'1px solid rgba(91,63,200,0.2)' }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:'#10B981', flexShrink:0 }}/>
            <span style={{ fontSize:12, color:'#7C5CE8', fontWeight:500 }}>Active:</span>
            <span style={{ fontSize:12, color:T1, fontWeight:600 }}>{activeLead.business}</span>
            <span style={{ fontSize:11, color:T2, marginLeft:'auto' }}>{activeLead.intent} · {activeLead.stage}</span>
          </div>
        ) : (
          <div style={{ padding:'7px 10px', borderRadius:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
            <span style={{ fontSize:12, color:'#F59E0B' }}>⚠ Open a lead first for personalised outreach</span>
          </div>
        )}
      </div>

      {/* Shortcuts grid */}
      <div style={{ padding:'14px 20px', display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {SHORTCUTS.map(({ id, icon:Icon, label, desc, color, bg }) => (
          <button key={id} onClick={()=>onSelect(id)} style={{
            display:'flex', flexDirection:'column', alignItems:'flex-start', gap:7,
            padding:'12px', borderRadius:10, border:`1px solid ${B1}`,
            background:dark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)',
            cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.15s',
          }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=color; e.currentTarget.style.background=bg; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=B1; e.currentTarget.style.background=dark?'rgba(255,255,255,0.02)':'rgba(0,0,0,0.02)'; }}>
            <div style={{ width:28, height:28, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Icon size={14} color={color}/>
            </div>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{label}</div>
              <div style={{ fontSize:10, color:T2, marginTop:1, lineHeight:1.4 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── extractNotesJSON — pure, never throws ─────────────────────────────────────
// Strips markdown code fences, finds the outermost JSON object, and parses it.
// Returns the parsed object on success, null on any failure.
// Used by handleSave() in notes mode to apply extracted intelligence.
function extractNotesJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  try {
    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    let text = rawText
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();
    // Find outermost JSON object boundaries
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── Wizard ────────────────────────────────────────────────────────────────────
function Wizard({ mode, theme, onBack }) {
  const { activeLead, copilot, closeCopilot, addTouchEntry, addActivityEntry, updateIntelligence, updateAccountKnowledge, settings } = useApp();
  const [step,        setStep]       = useState(0);
  const [copied,      setCopied]     = useState(false);
  const [saved,       setSaved]      = useState(false);
  const [generating,  setGenerating] = useState(false);
  const [aiOutput,    setAiOutput]   = useState(''); // Gemini result or pasted result
  const [error,       setError]      = useState('');

  const dark      = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S2=dark?'#0D1117':'#F8F9FA';

  const isGemini  = settings?.aiProvider === 'gemini';
  const hasGemKey = isGemini && settings?.geminiKey && !settings.geminiKey.includes('•');

  // copilot.lead is set by openCopilot(mode, lead) from any view.
  // activeLead is the fallback for launches from LeadPage itself.
  // This order ensures Copilot always has context regardless of launch origin.
  const safeLead  = copilot.lead || activeLead || null;

  // Phase 10B-2: cadenceStep mode uses buildCadenceStepPrompt(lead, step).
  // All other modes use buildPrompt(mode, lead) as before.
  const cadenceStep = (mode === 'cadencestep') ? copilot.step || {} : null;
  const rawPrompt = safeLead
    ? (cadenceStep !== null
        ? buildCadenceStepPrompt(safeLead, cadenceStep)
        : buildPrompt(mode, safeLead))
    : 'Open a lead first.';

  // Cadence-specific header label: "Day 5 — LinkedIn" or step label if present.
  // Falls back to shortcut from SHORTCUTS array for non-cadenceStep modes.
  const cadenceStepLabel = cadenceStep !== null
    ? (cadenceStep.day && cadenceStep.channel
        ? `Day ${cadenceStep.day} — ${cadenceStep.channel}`
        : cadenceStep.label || cadenceStep.name || 'Cadence Step')
    : null;

  const preview   = buildPreview(mode, safeLead);
  const pct       = step===0?33:step===1?66:100;
  const shortcut  = SHORTCUTS.find(s=>s.id===mode) || SHORTCUTS[0];

  // For cadenceStep: synthesize a shortcut-like object with step-specific label.
  const displayShortcut = cadenceStepLabel
    ? { ...shortcut, label: cadenceStepLabel, icon: GitBranch, color: '#7C5CE8', bg: 'rgba(91,63,200,0.12)' }
    : shortcut;

  // ── Gemini: generate directly ──
  const handleGenerate = async () => {
    if (!safeLead) { setError('Open a lead first.'); return; }
    setGenerating(true);
    setError('');
    setAiOutput('');
    try {
      const result = await callAI(rawPrompt, settings);
      if (result) {
        setAiOutput(result);
        setStep(2); // skip straight to review
      } else {
        // No key configured — fall back to copy-paste
        setStep(1);
      }
    } catch (e) {
      setError(e.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(rawPrompt);
    setCopied(true);
    setTimeout(()=>setCopied(false), 2500);
  };

  const handleOpenClaude = () => {
    navigator.clipboard.writeText(rawPrompt);
    window.open('https://claude.ai','_blank');
  };

  const handleSave = () => {
    const rawContent = aiOutput || preview.body;
    // normalizeGeneratedContent is the canonical normalizer — never stores raw scaffolding.
    // Empty rawContent returns { subject:'', body:'' } — safe to proceed with empty content.
    const parsed  = normalizeGeneratedContent(mode, rawContent);
    const content = parsed.body || rawContent.trim();  // trim-only fallback if body empty after normalization

    if (safeLead) {
      // Phase 10B-2: cadenceStep uses the step's channel as the activity type
      // (e.g. 'Email', 'SMS', 'LinkedIn') instead of the literal string 'Cadencestep'.
      const activityType = (cadenceStep !== null && cadenceStep.channel)
        ? cadenceStep.channel
        : mode.charAt(0).toUpperCase() + mode.slice(1);

      // Phase 10B-3: addTouchEntry now returns the created activity entry.
      // Capture it so notes mode can use activityId for AK provenance.
      const entry = addTouchEntry(safeLead.id, {
        type:    activityType,
        channel: activityType,
        content,
        subject: parsed.subject,
        date:    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
      addActivityEntry(safeLead.id, `${displayShortcut.label} generated via AI Copilot (${isGemini ? 'Gemini' : 'Claude'})`);

      // Persist AI recommendation for situational analysis only.
      // Email / SMS / VM / LinkedIn / cadence outputs are ephemeral drafts.
      if (mode === 'situational' && content) {
        updateIntelligence(safeLead.id, {
          aiRecommendation: content,
          insightVersion:   (safeLead.intelligence?.insightVersion || 0) + 1,
          lastAiUpdate:     new Date().toISOString(),
        });
      }

      // ── Phase 10B-3: Notes mode — JSON extraction → intelligence ingestion ──
      //
      // buildNotesPrompt asks Claude to return a JSON object with fields:
      //   summary, painPoints, objections, competitors, buyingSignals,
      //   nextBestAction, leadTemperature, sentiment
      //
      // After saving the raw content as an activity (above), attempt to parse
      // the JSON and apply it to the appropriate destinations:
      //
      //   Intelligence (direct, no review gate — scoring signals):
      //     summary, painPoints, objections, buyingSignals, nextBestAction,
      //     leadTemperature (+ sentiment fallback)
      //
      //   Account Knowledge (pending review — account facts):
      //     competitors → mergeAccountKnowledge with reviewStatus:'pending'
      //     The SDR reviews via Account Knowledge tab before they enter prompts.
      //
      // String arrays are deduplicated case-insensitively against existing values
      // to prevent duplicate entries on re-runs.
      //
      // extractNotesJSON never throws — returns null on any parse failure.
      // All downstream guards check `if (notesData)` before proceeding.
      if (mode === 'notes' && safeLead && content) {
        const notesData = extractNotesJSON(content);
        if (notesData) {
          const now    = new Date().toISOString();
          const intel  = safeLead.intelligence || {};

          // ── String dedup helper ─────────────────────────────────────────────
          // Merges new string items into an existing array, skipping case-insensitive
          // duplicates. Accepts both plain strings and objects with a .name property
          // (normalises to string before comparison).
          const dedupeStrings = (existing, incoming) => {
            if (!Array.isArray(incoming) || incoming.length === 0) return null;
            const existingLC = (existing || []).map(s =>
              (typeof s === 'string' ? s : s?.name || '').toLowerCase().trim()
            );
            const newItems = incoming
              .map(s => typeof s === 'string' ? s.trim() : s?.name || String(s))
              .filter(s => s && !existingLC.includes(s.toLowerCase().trim()));
            return newItems.length > 0 ? [...(existing || []), ...newItems] : null;
          };

          // ── Intelligence patch (scoring signals) ────────────────────────────
          const intelPatch = {};
          if (notesData.summary)        intelPatch.summary        = notesData.summary;
          if (notesData.nextBestAction) intelPatch.nextBestAction = notesData.nextBestAction;

          // Validate leadTemperature against known values
          const validTemps = ['Ice Cold', 'Cold', 'Warm', 'Hot', 'On Fire'];
          if (notesData.leadTemperature && validTemps.includes(notesData.leadTemperature)) {
            intelPatch.leadTemperature = notesData.leadTemperature;
          } else if (!notesData.leadTemperature && notesData.sentiment) {
            // Fallback: map sentiment to temperature when leadTemperature absent
            const sentimentMap = {
              'Very Positive': 'Hot', 'Positive': 'Warm',
              'Neutral': 'Cold', 'Negative': 'Cold', 'Very Negative': 'Ice Cold',
            };
            if (sentimentMap[notesData.sentiment]) {
              intelPatch.leadTemperature = sentimentMap[notesData.sentiment];
            }
          }

          const mergedPainPoints    = dedupeStrings(intel.painPoints,    notesData.painPoints);
          const mergedObjections    = dedupeStrings(intel.objections,    notesData.objections);
          const mergedBuyingSignals = dedupeStrings(intel.buyingSignals, notesData.buyingSignals);
          if (mergedPainPoints)    intelPatch.painPoints    = mergedPainPoints;
          if (mergedObjections)    intelPatch.objections    = mergedObjections;
          if (mergedBuyingSignals) intelPatch.buyingSignals = mergedBuyingSignals;

          if (Object.keys(intelPatch).length > 0) {
            updateIntelligence(safeLead.id, intelPatch);
          }

          // ── Account Knowledge: competitors (pending review) ─────────────────
          // competitors is in INTELLIGENCE_REJECTED_FIELDS — must use updateAccountKnowledge.
          // reviewStatus:'pending' routes them through the AK review flow.
          // The SDR confirms or dismisses before they enter prompt context.
          if (Array.isArray(notesData.competitors) && notesData.competitors.length > 0) {
            const competitorItems = notesData.competitors
              .map(c => typeof c === 'string' ? c.trim() : c?.name || String(c))
              .filter(Boolean)
              .map(name => ({
                name,
                strength:    'unknown',
                context:     '',
                source:      'copilot-notes',
                sourceDate:  now,
                reviewStatus:'pending',
              }));
            if (competitorItems.length > 0) {
              updateAccountKnowledge(safeLead.id, {
                competitors:       competitorItems,
                lastExtractedFrom: entry?.activityId || null,
                lastUpdated:       now,
              });
            }
          }
        }
      }
      // Phase 8D-1: pushGeneratedContent() removed.
      // Each call appended a full new lead row to the sheet per generation event,
      // creating duplicate rows (email1=email body, email2=voicemail, email3=LinkedIn).
      // Generated content is ephemeral SDR drafting output — it does not belong
      // in the lead profile sheet. The SDR copies content manually when needed.
    }

    setSaved(true);
    setTimeout(() => closeCopilot(), 1200);
  };

  const displayContent = aiOutput || preview.body;

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>

      {/* Progress bar */}
      <div style={{ padding:'10px 20px 14px', borderBottom:`1px solid ${B1}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <button onClick={onBack} style={{ padding:'3px 8px', borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:T2, fontSize:11, fontFamily:'inherit' }}>← Back</button>
          <ChevronRight size={11} color={dark?'#484F58':'#D1D5DB'}/>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:20, height:20, borderRadius:5, background:displayShortcut.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <displayShortcut.icon size={11} color={displayShortcut.color}/>
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{displayShortcut.label}</span>
          </div>
          {/* Provider badge */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:99, background:isGemini?'rgba(59,130,246,0.1)':'rgba(91,63,200,0.1)', border:`1px solid ${isGemini?'rgba(59,130,246,0.25)':'rgba(91,63,200,0.25)'}` }}>
            <span style={{ fontSize:9 }}>{isGemini?'✨':'🤖'}</span>
            <span style={{ fontSize:10, fontWeight:600, color:isGemini?'#60A5FA':'#7C5CE8' }}>{isGemini?'Gemini':'Claude'}</span>
          </div>
        </div>
        <div style={{ height:2, background:dark?'#21262D':'#F3F4F5', borderRadius:99, overflow:'hidden', marginBottom:6 }}>
          <div style={{ height:2, width:`${pct}%`, background:'linear-gradient(90deg,#5B3FC8,#7C5CE8)', borderRadius:99, transition:'width 0.4s ease' }}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr' }}>
          {WIZARD_STEPS.map((s,i)=>(
            <div key={s} style={{ textAlign:i===0?'left':i===1?'center':'right' }}>
              <span style={{ fontSize:10, fontWeight:step===i?600:400, color:i<step?'#10B981':step===i?'#7C5CE8':T2 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 20px', display:'flex', flexDirection:'column', gap:12 }}>

        {/* ── Step 0: Profile analysis ── */}
        {step===0 && (
          <>
            <div style={{ background:dark?'rgba(91,63,200,0.08)':'rgba(91,63,200,0.05)', border:'1px solid rgba(91,63,200,0.2)', borderRadius:10, padding:'12px 14px', display:'flex', gap:10 }}>
              <Sparkles size={14} color="#7C5CE8" style={{ flexShrink:0, marginTop:1 }}/>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#7C5CE8', marginBottom:3 }}>Profile Analysis</div>
                <p style={{ fontSize:11, color:T2, lineHeight:1.6, margin:0 }}>
                  {safeLead
                    ? `${safeLead.reviews||0} reviews · ${safeLead.aiVisibility||0}% AI visibility · ${buildTouchHistory(safeLead).length} previous touches · Competitor: ${safeLead.intelligence?.competitors?.[0]||safeLead.competitor||'unknown'} · Intent: ${safeLead.intent}`
                    : 'No lead open — open a lead for personalised output'}
                </p>
              </div>
            </div>
            {safeLead && (
              <div style={{ background:S2, border:`1px solid ${B1}`, borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10 }}>Lead Profile</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    ['Business',   safeLead.business],
                    ['Intent',     safeLead.intent],
                    ['Stage',      safeLead.stage],
                    ['Reviews',    safeLead.reviews||0],
                    ['Competitor', safeLead.intelligence?.competitors?.[0]||safeLead.competitor||'—'],
                    ['AI Score',   safeLead.aiScore],
                    ['Last Touch', safeLead.lastTouch||'Never'],
                    ['AI Visibility', `${safeLead.aiVisibility||0}%`],
                  ].map(([k,v])=>(
                    <div key={k}>
                      <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>{k}</div>
                      <div style={{ fontSize:12, fontWeight:500, color:T1, marginTop:1 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isGemini && !hasGemKey && (
              <div style={{ padding:'10px 12px', borderRadius:9, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)' }}>
                <span style={{ fontSize:12, color:'#F59E0B' }}>⚠ Add your Gemini API key in Settings → AI & Copilot to enable direct generation.</span>
              </div>
            )}
          </>
        )}

        {/* ── Step 1: Claude copy-paste mode ── */}
        {step===1 && (
          <>
            {/* Preview */}
            <div style={{ border:`1px solid ${B1}`, borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', borderBottom:`1px solid ${B1}`, background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize:9, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>Subject / Type</div>
                <div style={{ fontSize:13, color:T1, fontWeight:500 }}>{preview.subject}</div>
              </div>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ fontSize:9, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Personalised Preview</div>
                <pre style={{ fontSize:12, color:T1, lineHeight:1.8, whiteSpace:'pre-wrap', fontFamily:'inherit', margin:0 }}>{preview.body}</pre>
              </div>
            </div>

            {/* Copy prompt box */}
            <div style={{ background:S2, border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em' }}>Full Claude Prompt</span>
                <button onClick={handleCopyPrompt} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:6, border:`1px solid ${B1}`, background:copied?'rgba(16,185,129,0.1)':'transparent', color:copied?'#10B981':'#7C5CE8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {copied?<><CheckCircle2 size={11}/> Copied!</>:<><Copy size={11}/> Copy Prompt</>}
                </button>
              </div>
              <pre style={{ fontSize:10, color:T2, lineHeight:1.6, whiteSpace:'pre-wrap', fontFamily:'JetBrains Mono,monospace', margin:0, maxHeight:120, overflow:'auto' }}>{rawPrompt.slice(0,500)}…</pre>
            </div>

            {/* Paste result back */}
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Paste Claude's Response Here</div>
              <textarea value={aiOutput} onChange={e=>setAiOutput(e.target.value)} rows={5}
                placeholder="Copy prompt → paste in Claude.ai → copy Claude's response → paste here…"
                style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1px solid ${B1}`, background:'var(--bg)', color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.7, resize:'vertical', outline:'none', transition:'border-color 0.15s' }}
                onFocus={e=>e.target.style.borderColor='#5B3FC8'} onBlur={e=>e.target.style.borderColor=B1}/>
            </div>

            {/* Open Claude */}
            <button onClick={handleOpenClaude} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px', borderRadius:8, border:'none', cursor:'pointer', background:'rgba(91,63,200,0.12)', color:'#7C5CE8', fontSize:12, fontWeight:600, fontFamily:'inherit', transition:'background 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(91,63,200,0.2)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(91,63,200,0.12)'}>
              <ExternalLink size={13}/> Copy Prompt &amp; Open Claude.ai
            </button>
          </>
        )}

        {/* ── Step 2: Review & save (Gemini output or pasted result) ── */}
        {step===2 && (
          <>
            {aiOutput ? (
              <div style={{ background:'rgba(16,185,129,0.06)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, padding:'10px 12px', display:'flex', gap:8, alignItems:'center' }}>
                <CheckCircle2 size={13} color="#10B981" style={{ flexShrink:0 }}/>
                <span style={{ fontSize:12, color:'#10B981', fontWeight:500 }}>
                  {isGemini ? 'Generated by Gemini ✨' : 'Response pasted — review before saving'}
                </span>
              </div>
            ) : null}

            {error && (
              <div style={{ padding:'10px 12px', borderRadius:9, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
                <span style={{ fontSize:12, color:'#F87171' }}>⚠ {error}</span>
              </div>
            )}

            {/* Editable output */}
            <div>
              <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>
                {isGemini && aiOutput ? 'Gemini Output — edit before saving' : 'Review & Edit'}
              </div>
              <textarea value={displayContent} onChange={e=>setAiOutput(e.target.value)} rows={10}
                style={{ width:'100%', padding:'12px', borderRadius:9, border:`1px solid ${B1}`, background:'var(--bg)', color:T1, fontSize:12, fontFamily:'inherit', lineHeight:1.8, resize:'vertical', outline:'none', transition:'border-color 0.15s' }}
                onFocus={e=>e.target.style.borderColor='#5B3FC8'} onBlur={e=>e.target.style.borderColor=B1}/>
            </div>
          </>
        )}

        {/* Generating state overlay */}
        {generating && (
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px', borderRadius:10, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid rgba(96,165,250,0.3)', borderTopColor:'#60A5FA', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>
            <span style={{ fontSize:12, color:'#60A5FA', fontWeight:500 }}>Gemini is generating…</span>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderTop:`1px solid ${B1}`, background:dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.02)', flexShrink:0 }}>
        <button onClick={()=>step>0?setStep(s=>s-1):onBack()} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
          {step===0?'Cancel':'← Back'}
        </button>

        <div style={{ display:'flex', gap:8 }}>
          {/* Step 0: Generate (Gemini) or Next (Claude) */}
          {step===0 && (
            isGemini && hasGemKey ? (
              <button onClick={handleGenerate} disabled={generating||!safeLead} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:safeLead?'#3B82F6':'rgba(59,130,246,0.3)', color:'#fff', fontSize:12, fontWeight:600, cursor:safeLead?'pointer':'not-allowed', fontFamily:'inherit', transition:'background 0.15s' }}>
                {generating ? <><Loader size={12} style={{ animation:'spin 0.8s linear infinite' }}/> Generating…</> : <>✨ Generate with Gemini <ArrowRight size={13}/></>}
              </button>
            ) : (
              <button onClick={()=>setStep(1)} disabled={!safeLead} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:safeLead?'#5B3FC8':'rgba(91,63,200,0.3)', color:'#fff', fontSize:12, fontWeight:600, cursor:safeLead?'pointer':'not-allowed', fontFamily:'inherit', transition:'background 0.15s' }}>
                Build Prompt <ArrowRight size={13}/>
              </button>
            )
          )}

          {/* Step 1 (Claude): Save draft or go to review */}
          {step===1 && (
            <>
              <button onClick={handleCopyPrompt} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T1, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
                {copied?'Copied!':'Copy Prompt'}
              </button>
              <button onClick={()=>setStep(2)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                Review & Save <ArrowRight size={13}/>
              </button>
            </>
          )}

          {/* Step 2: Save */}
          {step===2 && (
            <button onClick={()=>handleSave()} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', borderRadius:8, border:'none', background:saved?'#10B981':'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'background 0.2s' }}>
              {saved?<><CheckCircle2 size={13}/> Saved!</>:<><CheckCircle2 size={13}/> Save to Touch Log</>}
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function Copilot() {
  const { theme, copilot, closeCopilot } = useApp();
  const [selectedMode, setSelectedMode] = useState(null);
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';

  if (!copilot.open) return null;

  const activeMode = selectedMode || copilot.mode;
  const showWizard = !!activeMode && activeMode !== 'search';

  return (
    <>
      <div onClick={closeCopilot} style={{ position:'fixed', inset:0, zIndex:99, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:560, maxHeight:'84vh', zIndex:100, borderRadius:16,
        background:dark?'#161B22':'#FFFFFF', border:`1px solid ${B1}`,
        boxShadow:dark?'0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(91,63,200,0.2)':'0 24px 64px rgba(0,0,0,0.15)',
        display:'flex', flexDirection:'column', fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${B1}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'#5B3FC8', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 12px rgba(91,63,200,0.4)' }}>
              <Sparkles size={17} color="#fff"/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Birdeye AI Copilot</div>
              <div style={{ fontSize:11, color:T2, marginTop:1 }}>
                {showWizard ? 'Generating personalised outreach' : 'What would you like to do?'}
              </div>
            </div>
          </div>
          <button onClick={closeCopilot} style={{ padding:5, borderRadius:8, border:'none', background:'transparent', cursor:'pointer', color:T2 }}
            onMouseEnter={e=>e.currentTarget.style.color=T1} onMouseLeave={e=>e.currentTarget.style.color=T2}>
            <X size={16}/>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          {showWizard
            ? <Wizard mode={activeMode} theme={theme} onBack={()=>setSelectedMode(null)}/>
            : <Launcher theme={theme} onSelect={id=>{ if(id!=='search') setSelectedMode(id); }}/>
          }
        </div>
      </div>
    </>
  );
}
