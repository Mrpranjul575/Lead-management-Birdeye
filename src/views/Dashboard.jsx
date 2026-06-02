import { useMemo } from 'react';
import { Zap, Mail, TrendingUp, Calendar, Users, Flame,
         RefreshCw, CheckCircle2, Brain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';

export default function Dashboard() {
  const { leads, openCopilot } = useApp();
  const { dark, T1, T2, B1, S1, S2, S3 } = useTheme();

  // ── Derive real metrics from leads ──
  const stats = useMemo(() => {
    const total       = leads.length;
    const hot         = leads.filter(l=>l.stage==='Hot').length;
    const working     = leads.filter(l=>['Contacted','Follow Up','Nurturing'].includes(l.stage)).length;
    const demo        = leads.filter(l=>l.stage==='Demo Booked').length;
    const converted   = leads.filter(l=>l.stage==='Converted').length;
    const reEngage    = leads.filter(l=>l.stage==='Re-engage').length;
    const lost        = leads.filter(l=>l.stage==='Lost').length;

    const allActivities = leads.flatMap(l=>l.activities||[]);
    const calls   = allActivities.filter(a=>a.type==='Call').length;
    const emails  = allActivities.filter(a=>a.type==='Email').length;
    const sms     = allActivities.filter(a=>a.type==='SMS').length;
    const aiGens  = allActivities.filter(a=>a.type==='AI Generation').length;
    const replies = allActivities.filter(a=>['Replied','Positive','Connected'].includes(a.outcome)).length;
    const replyRate = emails > 0 ? Math.round((replies/emails)*100) : 0;

    const avgScore = total > 0 ? Math.round(leads.reduce((s,l)=>s+(l.aiScore||0),0)/total) : 0;

    const intentMap = leads.reduce((acc,l)=>{ const k=l.intent||'Unknown'; acc[k]=(acc[k]||0)+1; return acc; },{});
    const topIntents = Object.entries(intentMap).sort((a,b)=>b[1]-a[1]).slice(0,4);

    const stageMap = {
      'New':leads.filter(l=>l.stage==='New').length,
      'Contacted':working,
      'Hot':hot,
      'Demo':demo,
      'Converted':converted,
    };

    return { total, hot, working, demo, converted, reEngage, lost, calls, emails, sms, aiGens, replies, replyRate, avgScore, topIntents, stageMap, allActivities };
  }, [leads]);

  const kpis = [
    { label:'Total Leads',     value:stats.total,     delta:null,        icon:Users,       ic:'#7C5CE8', ib:'rgba(91,63,200,0.12)'   },
    { label:'Hot Leads',       value:stats.hot,       delta:'High priority', icon:Flame,    ic:'#EF4444', ib:'rgba(239,68,68,0.12)'   },
    { label:'Demo Booked',     value:stats.demo,      delta:null,        icon:Calendar,    ic:'#F59E0B', ib:'rgba(245,158,11,0.12)'   },
    { label:'Reply Rate',      value:`${stats.replyRate}%`, delta:null,  icon:TrendingUp,  ic:'#10B981', ib:'rgba(16,185,129,0.12)'   },
    { label:'Emails Logged',   value:stats.emails,    delta:null,        icon:Mail,        ic:'#3B82F6', ib:'rgba(59,130,246,0.12)'   },
    { label:'Calls Logged',    value:stats.calls,     delta:null,        icon:CheckCircle2,ic:'#10B981', ib:'rgba(16,185,129,0.12)'   },
    { label:'Re-engage',       value:stats.reEngage,  delta:null,        icon:RefreshCw,   ic:'#FB923C', ib:'rgba(251,146,60,0.12)'   },
    { label:'AI Generations',  value:stats.aiGens,    delta:null,        icon:Brain,       ic:'#7C5CE8', ib:'rgba(91,63,200,0.12)'   },
  ];

  const FUNNEL = [
    { label:'Total',     value:stats.total,     color:'#7C5CE8' },
    { label:'Working',   value:stats.working,   color:'#3B82F6' },
    { label:'Hot',       value:stats.hot,       color:'#EF4444' },
    { label:'Demo',      value:stats.demo,      color:'#F59E0B' },
    { label:'Converted', value:stats.converted, color:'#10B981' },
  ];
  const maxFunnel = Math.max(...FUNNEL.map(f=>f.value), 1);

  // Recent activities across all leads
  const recentActs = useMemo(() =>
    leads.flatMap(l=>(l.activities||[]).map(a=>({...a, leadName:l.business})))
      .sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp))
      .slice(0,6)
  , [leads]);

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:T1, margin:0 }}>Dashboard</h1>
          <p style={{ fontSize:12, color:T2, marginTop:4 }}>Live metrics from your {leads.length} leads</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:11, color:T2 }}>Avg AI Score: <strong style={{ color:'#7C5CE8' }}>{stats.avgScore}</strong></span>
          <button onClick={()=>openCopilot('situational',null)} style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background:'#5B3FC8', color:'#fff', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 12px rgba(91,63,200,0.3)' }}>
            <Zap size={12}/> AI Copilot
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {kpis.map(({ label, value, delta, icon:Icon, ic, ib })=>(
          <div key={label} style={{ background:S1, border:`1px solid ${B1}`, borderRadius:12, padding:'16px 18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
              <div style={{ width:26, height:26, borderRadius:7, background:ib, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={13} color={ic}/>
              </div>
            </div>
            <div style={{ fontSize:26, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', lineHeight:1 }}>{value}</div>
            {delta && <div style={{ fontSize:10, color:T2, marginTop:5 }}>{delta}</div>}
          </div>
        ))}
      </div>

      {/* Funnel + Stage + Recent Activity */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px 300px', gap:14 }}>

        {/* Funnel */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:16 }}>Pipeline Funnel</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {FUNNEL.map(({ label, value, color })=>(
              <div key={label}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, color:T1 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace' }}>{value}</span>
                </div>
                <div style={{ height:8, background:S3, borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:8, width:`${(value/maxFunnel)*100}%`, background:color, borderRadius:99, transition:'width 0.5s ease', opacity:0.85 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Intent distribution */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Top Intents</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {stats.topIntents.length===0
              ? <span style={{ fontSize:12, color:T2, fontStyle:'italic' }}>No leads yet</span>
              : stats.topIntents.map(([intent, count],i)=>{
                const colors = ['#7C5CE8','#3B82F6','#10B981','#F59E0B'];
                const pct = Math.round((count/stats.total)*100);
                return (
                  <div key={intent}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:11, color:T1 }}>{intent}</span>
                      <span style={{ fontSize:11, fontWeight:600, color:T2 }}>{pct}%</span>
                    </div>
                    <div style={{ height:5, background:S3, borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:5, width:`${pct}%`, background:colors[i]||'#7C5CE8', borderRadius:99, transition:'width 0.5s ease' }}/>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Recent activity */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Recent Activity</span>
            <span style={{ fontSize:10, color:T2 }}>{stats.allActivities.length} total</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {recentActs.length===0
              ? <span style={{ fontSize:12, color:T2, fontStyle:'italic' }}>No activities yet — log a call or send an email</span>
              : recentActs.map((a,i)=>(
                <div key={a.activityId||i} style={{ display:'flex', gap:8 }}>
                  <div style={{ width:26, height:26, borderRadius:7, background:S2, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:12 }}>
                    {a.type==='Call'?'📞':a.type==='Email'?'✉️':a.type==='SMS'?'💬':a.type==='LinkedIn'?'🔗':'📝'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.leadName}</div>
                    <div style={{ fontSize:10, color:T2 }}>{a.type} · {new Date(a.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Stage breakdown */}
      <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Lead Status Distribution</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(9,1fr)', gap:8 }}>
          {['New','Hot','Contacted','Follow Up','Demo Booked','Nurturing','Re-engage','Converted','Lost'].map(stage=>{
            const count = leads.filter(l=>l.stage===stage).length;
            const pct   = stats.total > 0 ? Math.round((count/stats.total)*100) : 0;
            const colors= {'Hot':'#EF4444','Demo Booked':'#7C5CE8','Converted':'#10B981','Lost':'#EF4444','Follow Up':'#38BDF8','Nurturing':'#F472B6','Re-engage':'#FB923C','Contacted':'#F59E0B','New':'#60A5FA'};
            const color = colors[stage]||'#7C5CE8';
            return (
              <div key={stage} style={{ textAlign:'center' }}>
                <div style={{ fontSize:22, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace' }}>{count}</div>
                <div style={{ fontSize:10, color:T2, marginTop:3 }}>{stage}</div>
                <div style={{ height:3, background:S3, borderRadius:99, marginTop:5, overflow:'hidden' }}>
                  <div style={{ height:3, width:`${pct}%`, background:color, borderRadius:99 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
