import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { Zap, Mail, TrendingUp, Calendar, Download, Brain } from 'lucide-react';

const PERIODS = ['This Month','Last Quarter','YTD'];

// Heatmap slots (Mon-Fri × AM/PM rows) — real data would need timestamps
const MOCK_HEAT = [[20,80,90,50,20],[40,85,95,70,35],[60,55,45,60,40],[30,25,35,30,20]];

export default function Reports() {
  const { leads } = useApp();
  const { dark, T1, T2, B1, S1, S2, S3 } = useTheme();
  const [period, setPeriod] = useState('This Month');

  const stats = useMemo(() => {
    const acts = leads.flatMap(l => l.activities || []);
    const total     = leads.length;
    const emails    = acts.filter(a=>a.type==='Email').length;
    const calls     = acts.filter(a=>a.type==='Call').length;
    const sms       = acts.filter(a=>a.type==='SMS').length;
    const demos     = leads.filter(l=>l.stage==='Demo Booked').length;
    const converted = leads.filter(l=>l.stage==='Converted').length;
    const replies   = acts.filter(a=>['Replied','Positive','Connected'].includes(a.outcome)).length;
    const replyRate = emails>0 ? ((replies/emails)*100).toFixed(1) : '0.0';
    const aiGens    = acts.filter(a=>a.type==='AI Generation').length;

    // Funnel
    const funnel = [
      { label:'TARGET ACCOUNT', value:total,   emoji:'🏢' },
      { label:'CONTACTED',      value:leads.filter(l=>l.stage!=='New').length, emoji:'👤' },
      { label:'FIRST TOUCH',    value:emails+calls+sms, emoji:'📨' },
      { label:'REPLIED',        value:replies,  emoji:'💬' },
      { label:'DEMO BOOKED',    value:demos,    emoji:'📅' },
    ];

    // Intent breakdown
    const intentMap = leads.reduce((acc,l)=>{ const k=l.intent||'Other'; acc[k]=(acc[k]||0)+1; return acc; },{});
    const intents = Object.entries(intentMap).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({
      label, pct: total>0?Math.round((count/total)*100):0,
    }));

    // Top email subjects (from activities with content)
    const emailActs = acts.filter(a=>a.type==='Email' && a.details?.content);
    const topEmails = emailActs.slice(0,4).map((a,i)=>({
      rank:i+1,
      subject: a.summary || a.details?.content?.slice(0,50)+'…',
      outcome: a.outcome||'—',
      leadName: leads.find(l=>(l.activities||[]).some(x=>x.activityId===a.activityId))?.business||'—',
    }));

    // Activity by type
    const byType = [
      { label:'Email',    count:emails,  color:'#7C5CE8' },
      { label:'Call',     count:calls,   color:'#10B981' },
      { label:'SMS',      count:sms,     color:'#3B82F6' },
      { label:'AI',       count:aiGens,  color:'#F59E0B' },
    ];
    const maxAct = Math.max(...byType.map(b=>b.count), 1);

    return { total, emails, calls, sms, demos, converted, replies, replyRate, aiGens, funnel, intents, topEmails, byType, maxAct };
  }, [leads, period]);

  const kpis = [
    { label:'TOTAL LEADS',   value:stats.total,     delta:null, icon:TrendingUp, ic:'#7C5CE8', ib:'rgba(91,63,200,0.12)' },
    { label:'EMAILS LOGGED', value:stats.emails,    delta:`+${stats.aiGens} AI generated`, icon:Mail, ic:'#3B82F6', ib:'rgba(59,130,246,0.12)' },
    { label:'REPLY RATE',    value:`${stats.replyRate}%`, delta:`${stats.replies} replies`, icon:TrendingUp, ic:'#10B981', ib:'rgba(16,185,129,0.12)' },
    { label:'DEMOS BOOKED',  value:stats.demos,     delta:null, icon:Calendar, ic:'#F59E0B', ib:'rgba(245,158,11,0.12)' },
  ];

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:T1, margin:0 }}>Reports &amp; Analytics</h1>
          <p style={{ fontSize:12, color:T2, marginTop:4 }}>Live performance data from {leads.length} leads and {leads.flatMap(l=>l.activities||[]).length} activities</p>
        </div>
        <div style={{ display:'flex', gap:0, background:S1, border:`1px solid ${B1}`, borderRadius:9, padding:3 }}>
          {PERIODS.map(p=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', background:period===p?'#5B3FC8':'transparent', color:period===p?'#fff':T2, fontSize:11, fontWeight:period===p?600:400, fontFamily:'inherit', transition:'all 0.15s' }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Note: period filter is UI only — backend would filter by date. Currently all data shown. */}
      {period !== 'This Month' && (
        <div style={{ padding:'8px 12px', borderRadius:8, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', fontSize:11, color:'#F59E0B' }}>
          ℹ️ Period filtering requires activity timestamps. Showing all logged data. Connect Google Sheets for time-filtered reports.
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
        {kpis.map(({ label, value, delta, icon:Icon, ic, ib })=>(
          <div key={label} style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:600, color:T2, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</span>
              <div style={{ width:27, height:27, borderRadius:7, background:ib, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={13} color={ic}/>
              </div>
            </div>
            <div style={{ fontSize:28, fontWeight:700, color:T1, fontFamily:'JetBrains Mono,monospace', lineHeight:1 }}>{value}</div>
            {delta && <p style={{ fontSize:10, color:T2, margin:'5px 0 0' }}>{delta}</p>}
          </div>
        ))}
      </div>

      {/* Funnel + Activity types */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:14 }}>

        {/* Funnel */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:14, fontWeight:600, color:T1, marginBottom:18 }}>Outreach Funnel</div>
          <div style={{ display:'flex', justifyContent:'space-between', position:'relative' }}>
            <div style={{ position:'absolute', top:20, left:'5%', right:'5%', height:1, background:B1 }}/>
            {stats.funnel.map(({ label, value, emoji },i)=>(
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flex:1 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:S2, border:`2px solid ${i===stats.funnel.length-1?'#F59E0B':'rgba(91,63,200,0.4)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, zIndex:1, boxShadow:i===stats.funnel.length-1?'0 0 12px rgba(245,158,11,0.3)':'none' }}>{emoji}</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:9, color:T2, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:i===stats.funnel.length-1?'#F59E0B':T1, fontFamily:'JetBrains Mono,monospace' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity breakdown */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Activity Breakdown</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {stats.byType.map(({ label, count, color })=>(
              <div key={label}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:12, color:T1 }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace' }}>{count}</span>
                </div>
                <div style={{ height:6, background:S3, borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:6, width:`${(count/stats.maxAct)*100}%`, background:color, borderRadius:99, transition:'width 0.5s ease' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Intents + Heatmap */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

        {/* Intent distribution */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Intent Distribution</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {stats.intents.length===0
              ? <span style={{ fontSize:12, color:T2, fontStyle:'italic' }}>No leads yet</span>
              : stats.intents.map(({ label, pct },i)=>{
                const colors=['#7C5CE8','#3B82F6','#10B981','#F59E0B','#EC4899'];
                return (
                  <div key={label}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                      <span style={{ fontSize:12, color:T1, display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:7, height:7, borderRadius:2, background:colors[i%5] }}/>
                        {label}
                      </span>
                      <span style={{ fontSize:12, fontWeight:600, color:T2 }}>{pct}%</span>
                    </div>
                    <div style={{ height:5, background:S3, borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:5, width:`${pct}%`, background:colors[i%5], borderRadius:99, transition:'width 0.5s ease' }}/>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Engagement heatmap (representative) */}
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:4 }}>Best Outreach Times</div>
          <div style={{ fontSize:10, color:T2, marginBottom:12 }}>Reply rate by day & time (representative)</div>
          <div style={{ display:'grid', gridTemplateColumns:'30px repeat(5,1fr)', gap:3 }}>
            <div/>
            {['MON','TUE','WED','THU','FRI'].map(d=>(
              <div key={d} style={{ fontSize:9, textAlign:'center', color:T2, fontWeight:600, marginBottom:2 }}>{d}</div>
            ))}
            {['8am','10am','1pm','3pm'].map((t,ti)=>[
              <div key={t} style={{ fontSize:9, color:T2, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:4 }}>{t}</div>,
              ...[0,1,2,3,4].map(di=>(
                <div key={di} style={{ height:24, borderRadius:5, background:`rgba(91,63,200,${MOCK_HEAT[ti][di]/100*0.85+0.05})`, cursor:'pointer', transition:'all 0.15s' }}
                  title={`${MOCK_HEAT[ti][di]}% reply rate`}
                  onMouseEnter={e=>e.currentTarget.style.outline='1px solid rgba(91,63,200,0.7)'}
                  onMouseLeave={e=>e.currentTarget.style.outline='none'}/>
              ))
            ])}
          </div>
        </div>
      </div>

      {/* Recent emails */}
      {stats.topEmails.length > 0 && (
        <div style={{ background:S1, border:`1px solid ${B1}`, borderRadius:14, padding:'20px' }}>
          <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:14 }}>Recent Email Activity</div>
          {stats.topEmails.map(({ rank, subject, outcome, leadName })=>(
            <div key={rank} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom:`1px solid ${dark?'#21262D':'#F3F4F5'}` }}>
              <div style={{ width:22, height:22, borderRadius:6, background:S2, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:T2, flexShrink:0 }}>{rank}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, fontWeight:500, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{subject}</div>
                <div style={{ fontSize:10, color:T2, marginTop:1 }}>{leadName}</div>
              </div>
              {outcome !== '—' && <span style={{ fontSize:10, fontWeight:600, padding:'1px 7px', borderRadius:99, background:'rgba(16,185,129,0.1)', color:'#10B981', flexShrink:0 }}>{outcome}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
