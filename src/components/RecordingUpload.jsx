import { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, Mic, FileText, Brain, Loader,
         ChevronDown, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { transcribeWithGemini, parseTranscriptIntelligence } from '../services/aiProvider';

export default function RecordingUpload({ lead, onClose }) {
  const { addActivity, updateIntelligence, updateAccountKnowledge, updateLead, settings } = useApp();
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S2='var(--s2)';
  const fileRef = useRef();

  const [file,        setFile]        = useState(null);
  const [stage,       setStage]       = useState('idle'); // idle|uploading|transcribing|done|error
  const [progress,    setProgress]    = useState(0);
  const [transcript,  setTranscript]  = useState('');
  const [intel,       setIntel]       = useState(null);
  const [error,       setError]       = useState('');
  const [saved,       setSaved]       = useState(false);
  const [activeTab,   setActiveTab]   = useState('summary');

  const hasGemini = settings?.geminiKey && !settings.geminiKey.includes('•');

  const handleFile = async (f) => {
    if (!f) return;
    const allowed = ['audio/mpeg','audio/wav','audio/x-m4a','audio/mp4','audio/ogg','audio/webm','audio/mp3'];
    if (!allowed.includes(f.type) && !f.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)) {
      setError('Unsupported format. Use MP3, WAV, M4A, or OGG.'); return;
    }
    setFile(f);
    setError('');

    if (!hasGemini) {
      // No Gemini key — just mark as uploaded, let user type transcript manually
      setStage('done');
      setTranscript('');
      return;
    }

    setStage('transcribing');
    setProgress(0);

    // Animate progress
    const prog = setInterval(() => setProgress(p => Math.min(p + Math.random()*8+2, 90)), 400);

    try {
      // Read file as base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
      });

      const mimeType = f.type || 'audio/mpeg';
      const raw = await transcribeWithGemini(base64, mimeType, settings.geminiKey);

      clearInterval(prog);
      setProgress(100);

      const parsed = parseTranscriptIntelligence(raw);
      setTranscript(parsed.transcript || raw);
      setIntel(parsed);
      setStage('done');
    } catch (e) {
      clearInterval(prog);
      setError(e.message || 'Transcription failed');
      setStage('error');
    }
  };

  const handleSave = () => {
    // Capture returned entry for activityId provenance (Revision 1)
    const entry = addActivity(lead.id, 'Transcript', `Call recording: ${file?.name || 'recording'}`, {
      content: transcript,
      fileName: file?.name,
      outcome: intel?.sentiment || 'Neutral',
      source: 'recording',
    });

    // Update intelligence with parsed data — scoring/signal fields only (Phase 7B)
    if (intel) {
      const existing = lead.intelligence || {};
      const merge = (a, b) => [...new Set([...(a||[]), ...(b||[])])].filter(Boolean);
      // Phase 7A Fix 1: actionItems extracted from transcript are joined into
      // nextBestAction using semicolons to avoid information loss while
      // preserving the existing single-string schema field.
      // Priority: actionItems[] (most specific) → intel.nextBestAction (AI field)
      // → existing.nextBestAction (previously stored value)
      const resolvedNextBestAction =
        intel.actionItems?.length
          ? intel.actionItems.join('; ')
          : intel.nextBestAction || existing.nextBestAction;

      // Phase 7B: competitors and decisionMakers removed from intelligence patch
      // — they are now written exclusively to accountKnowledge below.
      updateIntelligence(lead.id, {
        summary:           intel.summary  || existing.summary,
        painPoints:        merge(existing.painPoints,   intel.painPoints),
        objections:        merge(existing.objections,   intel.objections),
        buyingSignals:     merge(existing.buyingSignals,intel.buyingSignals),
        lastConversation:  intel.summary || existing.lastConversation,
        nextBestAction:    resolvedNextBestAction,
      });

      // Phase 7B: route competitors and decisionMakers to accountKnowledge
      const akPatch = {};
      if (intel.competitors?.length) {
        akPatch.competitors = intel.competitors.map(name => ({
          name, strength: 'unknown', context: '',
          source: 'transcript', sourceDate: new Date().toISOString(),
        }));
      }
      if (intel.decisionMakers?.length) {
        akPatch.decisionMakers = intel.decisionMakers.map(name => ({
          name, role: '', authority: 'unknown', notes: '',
          source: 'transcript', sourceDate: new Date().toISOString(),
        }));
      }
      if (Object.keys(akPatch).length) {
        // Revision 1: use activityId from returned entry for complete provenance
        akPatch.lastExtractedFrom = entry.activityId;
        updateAccountKnowledge(lead.id, akPatch);
      }

      // Sync nextAction on the lead root so WorkQueue / NextBestStep see it immediately
      if (resolvedNextBestAction) updateLead(lead.id, { nextAction: resolvedNextBestAction });
    }

    setSaved(true);
    setTimeout(onClose, 1200);
  };

  const STAGES = {
    idle:         { label:'Ready to upload',      color:'var(--t2)'  },
    transcribing: { label:'Transcribing with Gemini…', color:'#60A5FA' },
    done:         { label:'Transcription complete', color:'#10B981'  },
    error:        { label:'Error',                 color:'#EF4444'  },
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:299, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        width:600, maxHeight:'85vh', zIndex:300, borderRadius:16,
        background:'var(--s1)', border:`1px solid ${B1}`,
        boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
        fontFamily:'Inter,system-ui,sans-serif', overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${B1}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(236,72,153,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Mic size={15} color="#EC4899"/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T1 }}>Upload Recording</div>
              <div style={{ fontSize:11, color:T2 }}>{lead.business} · Gemini transcription + intelligence update</div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={15}/></button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:16 }}>

          {/* No Gemini key warning */}
          {!hasGemini && (
            <div style={{ padding:'10px 14px', borderRadius:9, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', display:'flex', gap:8, alignItems:'flex-start' }}>
              <AlertCircle size={14} color="#F59E0B" style={{ flexShrink:0, marginTop:1 }}/>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#F59E0B', marginBottom:2 }}>Gemini key not configured</div>
                <div style={{ fontSize:11, color:T2 }}>Add your Gemini API key in Settings → AI & Copilot to enable automatic transcription. You can still upload and type the transcript manually.</div>
              </div>
            </div>
          )}

          {/* Drop zone */}
          {!file ? (
            <div
              onClick={()=>fileRef.current?.click()}
              onDrop={e=>{ e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e=>e.preventDefault()}
              style={{ border:`2px dashed rgba(236,72,153,0.4)`, borderRadius:12, padding:'40px 24px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', background:'rgba(236,72,153,0.03)' }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor='rgba(236,72,153,0.7)'; e.currentTarget.style.background='rgba(236,72,153,0.06)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor='rgba(236,72,153,0.4)'; e.currentTarget.style.background='rgba(236,72,153,0.03)'; }}>
              <div style={{ width:52, height:52, borderRadius:14, background:'rgba(236,72,153,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Upload size={22} color="#EC4899"/>
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:5 }}>Drop recording here</div>
              <div style={{ fontSize:12, color:T2 }}>Supports MP3, WAV, M4A, OGG — max 25MB</div>
              {hasGemini && <div style={{ fontSize:11, color:'#60A5FA', marginTop:8 }}>✨ Gemini will auto-transcribe and update lead intelligence</div>}
            </div>
          ) : (
            /* File + progress */
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`1px solid ${stage==='done'?'rgba(16,185,129,0.3)':stage==='error'?'rgba(239,68,68,0.3)':B1}`, background: stage==='done'?'rgba(16,185,129,0.05)':stage==='error'?'rgba(239,68,68,0.05)':S2 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:'rgba(236,72,153,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Mic size={16} color="#EC4899"/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{file.name}</div>
                  <div style={{ fontSize:11, color:STAGES[stage]?.color || T2, marginTop:1, display:'flex', alignItems:'center', gap:6 }}>
                    {stage==='transcribing' && <div style={{ width:12, height:12, borderRadius:'50%', border:'2px solid rgba(96,165,250,0.3)', borderTopColor:'#60A5FA', animation:'spin 0.8s linear infinite', flexShrink:0 }}/>}
                    {stage==='done' && <CheckCircle2 size={12} color="#10B981"/>}
                    {STAGES[stage]?.label}
                  </div>
                </div>
                {stage!=='transcribing' && (
                  <button onClick={()=>{setFile(null);setStage('idle');setTranscript('');setIntel(null);setError('');}} style={{ padding:4, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={13}/></button>
                )}
              </div>

              {stage==='transcribing' && (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:11, color:T2 }}>Gemini transcribing…</span>
                    <span style={{ fontSize:11, fontWeight:600, color:'#60A5FA', fontFamily:'JetBrains Mono,monospace' }}>{progress}%</span>
                  </div>
                  <div style={{ height:4, background:'var(--s3)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:4, width:`${progress}%`, background:'linear-gradient(90deg,#60A5FA,#4edea3)', borderRadius:99, transition:'width 0.3s ease' }}/>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ padding:'10px 12px', borderRadius:9, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ fontSize:12, color:'#F87171' }}>⚠ {error}</span>
            </div>
          )}

          {/* Results — tabs */}
          {stage==='done' && (
            <>
              {/* Tab bar */}
              <div style={{ display:'flex', gap:2, background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:9, padding:3 }}>
                {[{id:'summary',label:'Summary'},{id:'transcript',label:'Transcript'},{id:'intelligence',label:'Intelligence Update'}].map(t=>(
                  <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{ flex:1, padding:'5px', borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:activeTab===t.id?600:400, background:activeTab===t.id?'var(--p)':'transparent', color:activeTab===t.id?'#fff':T2, transition:'all 0.15s' }}>{t.label}</button>
                ))}
              </div>

              {activeTab==='summary' && intel && (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {intel.summary && (
                    <div style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Summary</div>
                      <p style={{ fontSize:12, color:T1, lineHeight:1.7, margin:0 }}>{intel.summary}</p>
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { label:'Pain Points',    items:intel.painPoints,     color:'#F87171' },
                      { label:'Competitors',    items:intel.competitors,    color:'#F59E0B' },
                      { label:'Objections',     items:intel.objections,     color:'#F472B6' },
                      { label:'Buying Signals', items:intel.buyingSignals,  color:'#34D399' },
                    ].map(({ label, items, color }) => (items?.length > 0) && (
                      <div key={label} style={{ background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{label}</div>
                        {items.map((item,i)=>(
                          <div key={i} style={{ display:'flex', gap:6, marginBottom:4 }}>
                            <div style={{ width:5, height:5, borderRadius:'50%', background:color, flexShrink:0, marginTop:5 }}/>
                            <span style={{ fontSize:11, color:T1 }}>{item}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {intel.nextBestAction && (
                    <div style={{ padding:'10px 12px', borderRadius:9, background:'rgba(91,63,200,0.08)', border:'1px solid rgba(91,63,200,0.2)' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#7C5CE8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>Recommended Next Action</div>
                      <div style={{ fontSize:12, color:T1, fontWeight:500 }}>{intel.nextBestAction}</div>
                    </div>
                  )}
                </div>
              )}

              {activeTab==='transcript' && (
                <div>
                  <div style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>
                    {hasGemini ? 'Gemini Transcript' : 'Transcript (type or paste)'}
                  </div>
                  <textarea value={transcript} onChange={e=>setTranscript(e.target.value)} rows={12}
                    placeholder={hasGemini ? 'Transcript will appear here…' : 'Paste or type the transcript here…'}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:`1px solid ${B1}`, background:'var(--bg)', color:T1, fontSize:11, fontFamily:'JetBrains Mono,monospace', lineHeight:1.8, resize:'vertical', outline:'none', transition:'border-color 0.15s' }}
                    onFocus={e=>e.target.style.borderColor='#5B3FC8'} onBlur={e=>e.target.style.borderColor=B1}/>
                </div>
              )}

              {activeTab==='intelligence' && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:11, color:T2, marginBottom:4 }}>These fields will be merged into this lead's intelligence:</div>
                  {[
                    { label:'Pain Points',     items:intel?.painPoints    },
                    { label:'Competitors',     items:intel?.competitors   },
                    { label:'Objections',      items:intel?.objections    },
                    { label:'Buying Signals',  items:intel?.buyingSignals },
                    { label:'Decision Makers', items:intel?.decisionMakers},
                    { label:'Action Items',    items:intel?.actionItems   },
                  ].filter(r => r.items?.length).map(({ label, items })=>(
                    <div key={label} style={{ display:'flex', gap:10, padding:'8px 12px', background:'var(--bg)', border:`1px solid ${B1}`, borderRadius:8 }}>
                      <span style={{ fontSize:11, fontWeight:600, color:T2, width:110, flexShrink:0 }}>{label}</span>
                      <span style={{ fontSize:11, color:T1 }}>{items.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display:'flex', gap:10, padding:'14px 20px', borderTop:`1px solid ${B1}`, background:'rgba(0,0,0,0.15)' }}>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0])}/>
          {!file && (
            <button onClick={()=>fileRef.current?.click()} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px', borderRadius:9, border:'none', background:'rgba(236,72,153,0.12)', color:'#EC4899', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              <Upload size={13}/> Browse File
            </button>
          )}
          <button onClick={onClose} style={{ flex:1, padding:'9px', borderRadius:9, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          {stage==='done' && (
            <button onClick={handleSave} style={{ flex:2, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px', borderRadius:9, border:'none', background:saved?'#10B981':'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'background 0.2s' }}>
              {saved?<><CheckCircle2 size={13}/> Saved!</>:<><Brain size={13}/> Save Transcript + Update Intelligence</>}
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
