import { useState, useRef } from 'react';
import { Key, User, Bell, Palette, Shield, Save, Eye, EyeOff,
         CheckCircle2, Copy, ExternalLink, Plus, Trash2, Link2,
         Upload, Camera, Zap, Brain, Database, TestTube,
         ChevronDown, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SheetsAdapter } from '../services/sheetsAdapter';

const SECTIONS = [
  { id:'profile',       label:'Profile',          icon:User     },
  { id:'ai',            label:'AI & Copilot',      icon:Brain    },
  { id:'sheets',        label:'Google Sheets',     icon:Database },
  { id:'notifications', label:'Notifications',     icon:Bell     },
  { id:'appearance',    label:'Appearance',        icon:Palette  },
  { id:'security',      label:'Security',          icon:Shield   },
];

function Toggle({ on, onChange }) {
  return (
    <button onClick={()=>onChange(!on)} style={{
      width:40, height:22, borderRadius:99, border:'none', cursor:'pointer',
      background:on?'#5B3FC8':'rgba(128,128,128,0.25)', position:'relative',
      transition:'background 0.2s', padding:0, flexShrink:0,
    }}>
      <div style={{ width:16, height:16, borderRadius:'50%', background:'#fff',
        position:'absolute', top:3, left:on?21:3, transition:'left 0.2s',
        boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }}/>
    </button>
  );
}

export default function Settings() {
  const { theme, toggleTheme, settings, updateSettings } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  const [section, setSection]       = useState('profile');
  const [saved,   setSaved]         = useState(false);
  const avatarRef                   = useRef();

  // Profile
  const [name,       setName]       = useState(settings.name       || 'Paul');
  const [title,      setTitle]      = useState(settings.title      || 'Senior SDR');
  const [email,      setEmail]      = useState(settings.email      || 'paul@birdeye.com');
  const [avatar,     setAvatar]     = useState(settings.avatar     || null);
  const [scriptUrl,  setScriptUrl]  = useState(settings.scriptUrl  || '');
  const [calLinks,   setCalLinks]   = useState(settings.calLinks   || [
    { id:1, label:'Discovery Call', url:'cal.com/paulwalker/discovery' },
    { id:2, label:'Demo',           url:'cal.com/paulwalker/demo'      },
  ]);

  // AI
  const [aiProvider,   setAiProvider]   = useState(settings.aiProvider   || 'claude');
  const [claudeKey,    setClaudeKey]    = useState(settings.claudeKey    || '');
  const [geminiKey,    setGeminiKey]    = useState(settings.geminiKey    || '');
  const [showClaude,   setShowClaude]   = useState(false);
  const [showGemini,   setShowGemini]   = useState(false);
  const [copilotPrefs, setCopilotPrefs] = useState(settings.copilotPrefs || {
    injectTouches:true, showScore:true, includeNotes:true, suggestFollowup:false,
  });

  // Sheets
  const [sheetsId,    setSheetsId]    = useState(settings.sheetsId    || '');
  const [sheetsToken, setSheetsToken] = useState(settings.sheetsToken || '');
  const [testResult,  setTestResult]  = useState(null);
  const [testing,     setTesting]     = useState(false);

  // Notifications
  const [notifs, setNotifs] = useState(settings.notifs || {
    hotLeads:true, replies:true, demos:true, daily:false, weekly:true,
  });

  const handleSave = () => {
    updateSettings({
      name, title, email, avatar, scriptUrl, calLinks,
      aiProvider, claudeKey, geminiKey, copilotPrefs,
      sheetsId, sheetsToken, notifs,
    });
    setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatar(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleTestSheets = async () => {
    setTesting(true); setTestResult(null);
    const result = await SheetsAdapter.test();
    setTestResult(result);
    setTesting(false);
  };

  const addCalLink = () => setCalLinks(ls=>[...ls,{ id:Date.now(), label:'New Link', url:'' }]);
  const updateCal  = (id, patch) => setCalLinks(ls=>ls.map(l=>l.id===id?{...l,...patch}:l));
  const deleteCal  = (id) => setCalLinks(ls=>ls.filter(l=>l.id!==id));

  const inp = (val, onChange, ph='', mono=false) => ({
    value:val, onChange:e=>onChange(e.target.value), placeholder:ph,
    style:{ width:'100%', padding:'9px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, color:T1, fontSize:12, fontFamily:mono?'JetBrains Mono,monospace':'inherit', outline:'none', transition:'border-color 0.15s' },
    onFocus:e=>e.target.style.borderColor='#5B3FC8', onBlur:e=>e.target.style.borderColor=B1,
  });

  const FieldLabel = ({ text, sub }) => (
    <div style={{ marginBottom:5 }}>
      <div style={{ fontSize:11, fontWeight:600, color:T2 }}>{text}</div>
      {sub && <div style={{ fontSize:10, color:'var(--t3)', marginTop:1 }}>{sub}</div>}
    </div>
  );

  const Row = ({ label, sub, children }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:`1px solid ${dark?'#21262D':'#F3F4F5'}` }}>
      <div>
        <div style={{ fontSize:12, color:T1, fontWeight:500 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:T2, marginTop:1 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );

  const SectionLabel = ({ text }) => (
    <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14, paddingBottom:10, borderBottom:`1px solid ${B1}` }}>{text}</div>
  );

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:880 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>Settings</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>Manage your account, AI providers and integrations</p>
        </div>
        <button onClick={handleSave} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'none', background:saved?'#10B981':'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 12px ${saved?'rgba(16,185,129,0.3)':'rgba(91,63,200,0.3)'}`, transition:'all 0.2s' }}>
          {saved?<><CheckCircle2 size={13}/> Saved!</>:<><Save size={13}/> Save Changes</>}
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16 }}>
        {/* Left nav */}
        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
          {SECTIONS.map(({ id, label, icon:Icon })=>{
            const active=section===id;
            return (
              <button key={id} onClick={()=>setSection(id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', background:active?(dark?'rgba(91,63,200,0.18)':'rgba(91,63,200,0.1)'):'transparent', color:active?'#7C5CE8':T2, fontSize:12, fontWeight:active?600:500, textAlign:'left', transition:'all 0.12s' }}
                onMouseEnter={e=>{ if(!active){ e.currentTarget.style.background=dark?'#21262D':'#F9FAFB'; e.currentTarget.style.color=T1; }}}
                onMouseLeave={e=>{ if(!active){ e.currentTarget.style.background='transparent'; e.currentTarget.style.color=T2; }}}>
                <Icon size={14}/>{label}
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'24px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* ── PROFILE ── */}
          {section==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              <SectionLabel text="Personal Information"/>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{ width:64, height:64, borderRadius:16, background:avatar?'transparent':'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, color:'#fff', overflow:'hidden', boxShadow:'0 4px 14px rgba(91,63,200,0.35)' }}>
                    {avatar?<img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:name[0]?.toUpperCase()||'P'}
                  </div>
                  <button onClick={()=>avatarRef.current?.click()} style={{ position:'absolute', bottom:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'#5B3FC8', border:`2px solid ${S1}`, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                    <Camera size={11} color="#fff"/>
                  </button>
                  <input ref={avatarRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleAvatarUpload}/>
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:T1 }}>{name||'Your Name'}</div>
                  <div style={{ fontSize:11, color:T2, marginTop:2 }}>{title}</div>
                  <button onClick={()=>avatarRef.current?.click()} style={{ marginTop:5, fontSize:11, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:0 }}>Upload photo</button>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[{label:'Name',title,set:setName,val:name},{label:'Job Title',title:'e.g. Senior SDR',set:setTitle,val:title},{label:'Email',title:'your@email.com',set:setEmail,val:email},{label:'Script URL',title:'https://your-crm.com',set:setScriptUrl,val:scriptUrl}].map(({ label, title: ph, set, val })=>(
                  <div key={label}><FieldLabel text={label}/><input {...inp(val,set,ph)}/></div>
                ))}
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                  <FieldLabel text="Calendar Links"/>
                  <button onClick={addCalLink} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#7C5CE8', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}><Plus size={11}/> Add</button>
                </div>
                {calLinks.map(link=>(
                  <div key={link.id} style={{ display:'grid', gridTemplateColumns:'130px 1fr 32px', gap:8, marginBottom:8, alignItems:'center' }}>
                    <input value={link.label} onChange={e=>updateCal(link.id,{label:e.target.value})} placeholder="Label" style={{ ...inp('','','').style, fontSize:11 }}/>
                    <div style={{ position:'relative' }}>
                      <Link2 size={12} color={T2} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}/>
                      <input value={link.url} onChange={e=>updateCal(link.id,{url:e.target.value})} placeholder="cal.com/…" style={{ ...inp('','','').style, paddingLeft:28, fontSize:11 }}/>
                    </div>
                    <button onClick={()=>deleteCal(link.id)} style={{ width:32, height:32, borderRadius:7, border:`1px solid ${B1}`, background:'transparent', cursor:'pointer', color:T2, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.12s' }}
                      onMouseEnter={e=>{e.currentTarget.style.color='#EF4444'; e.currentTarget.style.borderColor='rgba(239,68,68,0.3)'}}
                      onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1}}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI & COPILOT ── */}
          {section==='ai' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              <SectionLabel text="AI Configuration"/>

              {/* Provider selector */}
              <div>
                <FieldLabel text="AI Provider" sub="Choose which AI generates your outreach"/>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:6 }}>
                  {[
                    { id:'claude', label:'Claude', sub:'Anthropic — copy prompt, paste in Claude.ai', logo:'🤖', color:'#7C5CE8' },
                    { id:'gemini', label:'Gemini', sub:'Google — direct API, instant generation',     logo:'✨', color:'#3B82F6' },
                  ].map(({ id, label, sub, logo, color })=>{
                    const active=aiProvider===id;
                    return (
                      <button key={id} onClick={()=>setAiProvider(id)} style={{ padding:'14px', borderRadius:10, border:`2px solid ${active?color:B1}`, background:active?`${color}12`:'transparent', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:20 }}>{logo}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:active?color:T1 }}>{label}</span>
                          {active && <CheckCircle2 size={14} color={color} style={{ marginLeft:'auto' }}/>}
                        </div>
                        <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>{sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Claude key */}
              <div>
                <FieldLabel text="Claude API Key" sub="From console.anthropic.com — needed for direct generation"/>
                <div style={{ position:'relative' }}>
                  <input type={showClaude?'text':'password'} {...inp(claudeKey,setClaudeKey,'sk-ant-…',true)} style={{ ...inp('','','').style, paddingRight:72, fontFamily:'JetBrains Mono,monospace' }}/>
                  <div style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', display:'flex', gap:2 }}>
                    <button onClick={()=>navigator.clipboard.writeText(claudeKey)} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2, borderRadius:5 }}><Copy size={13}/></button>
                    <button onClick={()=>setShowClaude(v=>!v)} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2, borderRadius:5 }}>
                      {showClaude?<EyeOff size={13}/>:<Eye size={13}/>}
                    </button>
                  </div>
                </div>
                <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#7C5CE8', textDecoration:'none', marginTop:5 }}>
                  Get API key <ExternalLink size={10}/>
                </a>
              </div>

              {/* Gemini key */}
              <div>
                <FieldLabel text="Gemini API Key" sub="From aistudio.google.com — needed for direct generation + transcription"/>
                <div style={{ position:'relative' }}>
                  <input type={showGemini?'text':'password'} {...inp(geminiKey,setGeminiKey,'AIza…',true)} style={{ ...inp('','','').style, paddingRight:72, fontFamily:'JetBrains Mono,monospace' }}/>
                  <div style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', display:'flex', gap:2 }}>
                    <button onClick={()=>navigator.clipboard.writeText(geminiKey)} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2, borderRadius:5 }}><Copy size={13}/></button>
                    <button onClick={()=>setShowGemini(v=>!v)} style={{ padding:5, border:'none', background:'transparent', cursor:'pointer', color:T2, borderRadius:5 }}>
                      {showGemini?<EyeOff size={13}/>:<Eye size={13}/>}
                    </button>
                  </div>
                </div>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#3B82F6', textDecoration:'none', marginTop:5 }}>
                  Get Gemini key <ExternalLink size={10}/>
                </a>
              </div>

              {/* Copilot prefs */}
              <div>
                <FieldLabel text="Copilot Preferences"/>
                {[
                  { key:'injectTouches',   label:'Auto-inject previous touches into prompts' },
                  { key:'showScore',       label:'Show lead score in all prompts'             },
                  { key:'includeNotes',    label:'Include AE notes in context'                },
                  { key:'suggestFollowup', label:'Suggest follow-up after generating'         },
                ].map(({ key, label })=>(
                  <Row key={key} label={label}>
                    <Toggle on={copilotPrefs[key]} onChange={v=>setCopilotPrefs(p=>({...p,[key]:v}))}/>
                  </Row>
                ))}
              </div>

              {/* Model info */}
              <div style={{ padding:'12px 14px', borderRadius:10, background:`rgba(${aiProvider==='gemini'?'59,130,246':'91,63,200'},0.08)`, border:`1px solid rgba(${aiProvider==='gemini'?'59,130,246':'91,63,200'},0.2)` }}>
                <div style={{ fontSize:11, fontWeight:600, color:T1, marginBottom:3 }}>
                  {aiProvider==='claude'?'Claude Sonnet 4.5':'Gemini 1.5 Flash'} — Active
                </div>
                <div style={{ fontSize:11, color:T2 }}>
                  {aiProvider==='claude'
                    ? 'Prompts are copied to clipboard. Paste in Claude.ai to generate, then paste results back.'
                    : 'Gemini generates directly in the app. Results auto-populate the output field.'}
                </div>
              </div>
            </div>
          )}

          {/* ── GOOGLE SHEETS ── */}
          {section==='sheets' && (
            <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
              <SectionLabel text="Google Sheets Integration"/>

              {/* Pre-configured notice */}
              <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <CheckCircle2 size={13} color="#10B981"/>
                  <div style={{ fontSize:12, fontWeight:600, color:'#10B981' }}>Web App connected</div>
                </div>
                <div style={{ fontSize:11, color:T2, lineHeight:1.6 }}>
                  This workspace is pre-wired to the Birdeye SDR Google Sheets Web App. New leads are pushed to <strong style={{ color:T1 }}>Fresh Leads</strong> or <strong style={{ color:T1 }}>Re-engagement</strong> automatically. Stage changes sync in real time. No API key required.
                </div>
              </div>

              {/* Endpoint display */}
              <div>
                <FieldLabel text="Web App Endpoint" sub="Read-only — managed by your Google Apps Script deployment"/>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, padding:'9px 12px', borderRadius:8, border:`1px solid ${B1}`, background:S2, fontSize:10, color:T2, fontFamily:'JetBrains Mono,monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    script.google.com/macros/s/AKfycbx…/exec
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText('https://script.google.com/macros/s/AKfycbxVOAnt_qoRJ61bvxjDUQlZSiuqgIsqZ4UMbnzNJzAxyEsN2Z54_XBCldL5hDYYZUbq/exec')}
                    style={{ padding:'8px 10px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color:T2, cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:11, fontFamily:'inherit', flexShrink:0, transition:'all 0.12s' }}
                    onMouseEnter={e=>{ e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)'; }}
                    onMouseLeave={e=>{ e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1; }}
                    title="Copy full URL">
                    <Copy size={12}/> Copy
                  </button>
                </div>
              </div>

              {/* Test connection */}
              <div>
                <FieldLabel text="Connection Test" sub="Verify the Web App is reachable"/>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:6 }}>
                  <button
                    onClick={handleTestSheets}
                    disabled={testing}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:`1px solid ${B1}`, background:'transparent', color: testing ? T2 : T1, fontSize:11, cursor: testing ? 'not-allowed' : 'pointer', fontFamily:'inherit', transition:'all 0.15s', opacity: testing ? 0.6 : 1 }}
                    onMouseEnter={e=>{ if(!testing){ e.currentTarget.style.borderColor='#10B981'; e.currentTarget.style.color='#10B981'; }}}
                    onMouseLeave={e=>{ if(!testing){ e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T1; }}}>
                    <TestTube size={13}/>
                    {testing ? 'Testing…' : 'Test Connection'}
                  </button>
                  {testResult?.ok && (
                    <span style={{ fontSize:11, color:'#10B981', display:'flex', alignItems:'center', gap:4 }}>
                      <CheckCircle2 size={12}/>
                      {testResult.message || 'Connected'}
                    </span>
                  )}
                  {testResult && !testResult.ok && (
                    <span style={{ fontSize:11, color:'#EF4444', display:'flex', alignItems:'center', gap:4 }}>
                      <AlertCircle size={12}/>
                      {testResult.error || 'Connection failed'}
                    </span>
                  )}
                </div>
              </div>

              {/* What syncs */}
              <div>
                <FieldLabel text="What syncs automatically"/>
                {[
                  { icon:'📥', label:'New leads',     sub:'Pushed to Fresh Leads or Re-engagement tab on creation'  },
                  { icon:'🔄', label:'Stage changes', sub:'Status column updated in sheet whenever a lead stage changes' },
                ].map(({ icon, label, sub }) => (
                  <div key={label} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:`1px solid ${dark?'#21262D':'#F3F4F5'}` }}>
                    <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500, color:T1 }}>{label}</div>
                      <div style={{ fontSize:11, color:T2, marginTop:1 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {section==='notifications' && (
            <div>
              <SectionLabel text="Notification Preferences"/>
              {[
                { key:'hotLeads', label:'Hot lead alerts',           sub:'When a lead becomes hot' },
                { key:'replies',  label:'Lead replies',              sub:'When outreach gets a reply' },
                { key:'demos',    label:'Demo confirmations',        sub:'When a demo is confirmed' },
                { key:'daily',    label:'Daily digest email',        sub:'Morning summary of activity' },
                { key:'weekly',   label:'Weekly performance report', sub:'Stats every Monday' },
              ].map(({ key, label, sub })=>(
                <Row key={key} label={label} sub={sub}>
                  <Toggle on={notifs[key]} onChange={v=>setNotifs(n=>({...n,[key]:v}))}/>
                </Row>
              ))}
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {section==='appearance' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <SectionLabel text="Theme"/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { id:'dark',  label:'Dark Mode',  sub:'Futuristic AI workspace',   preview:'#0D1117', border:'#30363D' },
                  { id:'light', label:'Light Mode', sub:'Clean executive SaaS look', preview:'#F8F9FA', border:'#E5E7EB' },
                ].map(({ id, label, sub, preview, border })=>{
                  const active=theme===id;
                  return (
                    <button key={id} onClick={()=>{ if(theme!==id) toggleTheme(); }} style={{ padding:'14px', borderRadius:10, border:`2px solid ${active?'#5B3FC8':B1}`, background:active?'rgba(91,63,200,0.08)':'transparent', cursor:'pointer', textAlign:'left', transition:'all 0.15s' }}>
                      <div style={{ width:'100%', height:44, borderRadius:7, background:preview, border:`1px solid ${border}`, marginBottom:10, display:'flex', alignItems:'center', gap:6, padding:'0 10px' }}>
                        <div style={{ width:18, height:18, borderRadius:4, background:'#5B3FC8' }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ height:3, background:border, borderRadius:99, marginBottom:3, width:'65%' }}/>
                          <div style={{ height:3, background:border, borderRadius:99, width:'45%' }}/>
                        </div>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:T1 }}>{label}</div>
                          <div style={{ fontSize:10, color:T2 }}>{sub}</div>
                        </div>
                        {active && <CheckCircle2 size={14} color="#7C5CE8"/>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SECURITY ── */}
          {section==='security' && (
            <div>
              <SectionLabel text="Security Settings"/>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { label:'Change Password',           sub:'Last changed 30 days ago',          btn:'Update'     },
                  { label:'Two-Factor Authentication', sub:'Not enabled — strongly recommended', btn:'Enable 2FA' },
                  { label:'Active Sessions',           sub:'1 active session (this device)',     btn:'Manage'     },
                  { label:'API Access Log',            sub:'View all API key usage',             btn:'View Log'   },
                ].map(({ label, sub, btn })=>(
                  <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:10, border:`1px solid ${B1}`, background:S2 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:500, color:T1 }}>{label}</div>
                      <div style={{ fontSize:11, color:T2, marginTop:2 }}>{sub}</div>
                    </div>
                    <button style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${B1}`, background:'transparent', color:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s' }}
                      onMouseEnter={e=>{e.currentTarget.style.color=T1; e.currentTarget.style.borderColor='var(--b2)'}}
                      onMouseLeave={e=>{e.currentTarget.style.color=T2; e.currentTarget.style.borderColor=B1}}>
                      {btn}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
