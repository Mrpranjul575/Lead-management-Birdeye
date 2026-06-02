import { useState } from 'react';
import { Search, Bell, Command, ChevronRight, HelpCircle, Download, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const LABELS = {
  dashboard:'Dashboard', workqueue:'Work Queue', leads:'My Leads', hot:'Hot Leads',
  followups:'Follow Ups', demobooked:'Demo Booked', reengage:'Re-engage',
  pipeline:'Pipeline', reports:'Reports', memory:'AI Memory',
  settings:'Settings', newlead:'New Lead',
};

// Notifications are activity-driven — no hardcoded data.
// Future: derive from leads[].activities where type requires SDR attention.
const NOTIFICATIONS = [];

export default function TopBar({ sidebarWidth=240 }) {
  const { setClipSearch, theme, view, search, setSearch, activeLead, leads } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const dark = theme==='dark';
  const label  = activeLead ? activeLead.business : (LABELS[view]||'Dashboard');
  const parent = activeLead ? (LABELS[view]||'Work Queue') : 'SDR';
  const unreadCount = NOTIFICATIONS.filter(n=>n.unread).length;

  const T1=dark?'#E6EDF3':'#111827', T2=dark?'#8B949E':'#6B7280', B1=dark?'#30363D':'#E5E7EB';

  const handleExport = () => {
    const headers = [
      'ID','Business','Contact','Email','Phone','Website','City','Industry',
      'Intent','AI Score','Reviews','Rating','AI Visibility','Comp Gap',
      'Stage','Next Action','Last Touch','Cadence Day','Tags',
    ];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = leads.map(l => [
      l.id, l.business, l.contact, l.email, l.phone, l.website, l.city, l.industry,
      l.intent, l.aiScore, l.reviews, l.rating, l.aiVisibility, l.compGap,
      l.stage, l.nextAction, l.lastTouch, l.cadenceDay,
      (l.tags || []).join(';'),
    ].map(esc).join(','));
    const csv  = [headers.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `birdeye-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header style={{
        position:'fixed', top:0, right:0, left:sidebarWidth, height:56, zIndex:30,
        display:'flex', alignItems:'center', gap:16, padding:'0 20px',
        background:dark?'rgba(13,17,23,0.95)':'rgba(255,255,255,0.95)',
        borderBottom:`1px solid ${B1}`, backdropFilter:'blur(12px)',
        fontFamily:'Inter,system-ui,sans-serif',
        transition:'left 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <span style={{ fontSize:11, color:T2 }}>{parent}</span>
          <ChevronRight size={12} color={dark?'#484F58':'#D1D5DB'}/>
          <span style={{ fontSize:12, fontWeight:600, color:T1 }}>{label}</span>
        </div>

        {/* Search */}
        <div style={{
          flex:1, maxWidth:480, display:'flex', alignItems:'center', gap:8,
          padding:'6px 12px', borderRadius:8,
          background:dark?'#161B22':'#F9FAFB', border:`1px solid ${B1}`,
        }}>
          <Search size={13} color={T2} style={{ flexShrink:0 }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search leads, campaigns, intelligence…"
            style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:12, color:T1, fontFamily:'inherit' }}/>
          <div style={{ display:'flex', alignItems:'center', gap:2, padding:'2px 5px', borderRadius:4, border:`1px solid ${dark?'#484F58':'#E5E7EB'}`, fontSize:10, color:dark?'#484F58':'#D1D5DB', flexShrink:0 }}>
            <Command size={9}/>K
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:'auto' }}>
          {/* Help */}
          <button style={{ padding:7, borderRadius:8, border:'none', background:'transparent', cursor:'pointer', color:T2, display:'flex', transition:'background 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background=dark?'#21262D':'#F3F4F5'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <HelpCircle size={16}/>
          </button>

          {/* Export */}
          <button
            onClick={handleExport}
            style={{
            display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8,
            border:`1px solid ${B1}`, background:'transparent', cursor:'pointer',
            color:T2, fontSize:11, fontWeight:500, fontFamily:'inherit', transition:'all 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=dark?'#484F58':'#D1D5DB'; e.currentTarget.style.color=T1;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T2;}}>
            <Download size={12}/> Export
          </button>

          {/* Bell */}
          <div style={{ position:'relative' }}>
            <button onClick={()=>setNotifOpen(o=>!o)} style={{
              position:'relative', padding:7, borderRadius:8, border:'none',
              background: notifOpen?(dark?'#21262D':'#F3F4F5'):'transparent',
              cursor:'pointer', color:T2, display:'flex', transition:'background 0.15s',
            }}
              onMouseEnter={e=>e.currentTarget.style.background=dark?'#21262D':'#F3F4F5'}
              onMouseLeave={e=>{ if(!notifOpen) e.currentTarget.style.background='transparent'; }}>
              <Bell size={16}/>
              {unreadCount>0 && (
                <div style={{
                  position:'absolute', top:5, right:5, width:8, height:8, borderRadius:'50%',
                  background:'#EF4444', border:`1.5px solid ${dark?'#0D1117':'#fff'}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:8, color:'#fff', fontWeight:700,
                }}/>
              )}
            </button>

            {/* Notifications dropdown */}
            {notifOpen && (
              <div style={{
                position:'absolute', top:'calc(100% + 8px)', right:0, width:320, zIndex:100,
                background:dark?'#161B22':'#FFFFFF', border:`1px solid ${B1}`,
                borderRadius:12, overflow:'hidden',
                boxShadow:dark?'0 8px 32px rgba(0,0,0,0.5)':'0 8px 32px rgba(0,0,0,0.12)',
              }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderBottom:`1px solid ${B1}` }}>
                  <span style={{ fontSize:13, fontWeight:600, color:T1 }}>Notifications</span>
                  <button onClick={()=>setNotifOpen(false)} style={{ padding:2, border:'none', background:'transparent', cursor:'pointer', color:T2 }}><X size={13}/></button>
                </div>
                {NOTIFICATIONS.length === 0 ? (
                  <div style={{ padding:'28px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:22, marginBottom:8 }}>🔔</div>
                    <div style={{ fontSize:13, fontWeight:600, color:T1, marginBottom:4 }}>No notifications yet</div>
                    <div style={{ fontSize:11, color:T2, lineHeight:1.5 }}>Activity alerts will appear here as you work through your leads.</div>
                  </div>
                ) : (
                  NOTIFICATIONS.map(n=>(
                    <div key={n.id} style={{
                      display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px',
                      borderBottom:`1px solid ${dark?'#21262D':'#F3F4F5'}`,
                      background:n.unread?(dark?'rgba(91,63,200,0.06)':'rgba(91,63,200,0.03)'):'transparent',
                      cursor:'pointer', transition:'background 0.12s',
                    }}
                      onMouseEnter={e=>e.currentTarget.style.background=dark?'#21262D':'#F9FAFB'}
                      onMouseLeave={e=>e.currentTarget.style.background=n.unread?(dark?'rgba(91,63,200,0.06)':'rgba(91,63,200,0.03)'):'transparent'}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:n.dot, flexShrink:0, marginTop:5 }}/>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:12, color:T1, lineHeight:1.5, margin:0 }}>{n.text}</p>
                        <span style={{ fontSize:10, color:T2 }}>{n.time}</span>
                      </div>
                      {n.unread && <div style={{ width:6, height:6, borderRadius:'50%', background:'#5B3FC8', flexShrink:0, marginTop:6 }}/>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div style={{
            width:30, height:30, borderRadius:'50%', marginLeft:4,
            background:'linear-gradient(135deg,#5B3FC8,#3B82F6)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer',
            boxShadow:'0 2px 8px rgba(91,63,200,0.3)',
          }}>P</div>
        </div>
      </header>

      {/* Close notif on outside click */}
      {notifOpen && <div onClick={()=>setNotifOpen(false)} style={{ position:'fixed', inset:0, zIndex:29 }}/>}
    </>
  );
}
