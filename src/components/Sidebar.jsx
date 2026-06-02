import { useMemo } from 'react';
import { useApp } from "../context/AppContext";
import { Upload,
  LayoutDashboard, CheckSquare, Users, Flame, RefreshCw, CalendarCheck,
  GitBranch, BarChart2, Settings, Plus, Link2, Copy,
  ChevronDown, Sun, Moon, PanelLeftClose, PanelLeftOpen, Brain, Sparkles
} from 'lucide-react';

const NAV = [
  { id:'dashboard',  label:'Dashboard',   icon:LayoutDashboard, badge:null },
  { id:'workqueue',  label:'Work Queue',  icon:CheckSquare,     badge:14   },
  { id:'leads',      label:'My Leads',    icon:Users,           badge:null },
  { id:'hot',        label:'Hot Leads',   icon:Flame,           badge:3,   badgeRed:true   },
  { id:'followups',  label:'Follow Ups',  icon:RefreshCw,       badge:5,   badgeAmber:true },
  { id:'demobooked', label:'Demo Booked', icon:CalendarCheck,   badge:null },
  { id:'reengage',   label:'Re-engage',   icon:GitBranch,       badge:null },
  { id:'pipeline',   label:'Pipeline',    icon:GitBranch,       badge:null },
  { id:'reports',    label:'Reports',     icon:BarChart2,       badge:null },
  { id:'cadences',   label:'Cadences',    icon:GitBranch,       badge:null },
  { id:'memory',     label:'AI Memory',   icon:Brain,           badge:null },
  { id:'settings',   label:'Settings',    icon:Settings,        badge:null },
];

export default function Sidebar() {
  const { theme, view, setView, toggleTheme, sidebarOpen, toggleSidebar, closeLead, openCopilot, leads } = useApp();
  const dark = theme === 'dark';
  const W = sidebarOpen ? 240 : 56;

  const liveBadges = useMemo(() => ({
    workqueue: leads.length,
    hot:       leads.filter(l => l.stage === 'Hot').length,
    followups: leads.filter(l => l.stage === 'Follow Up').length,
  }), [leads]);

  const handleNav = (id) => {
    closeLead();   // always close lead page first
    setView(id);
  };

  const getBadgeBg = (item) => {
    if (item.badgeRed)   return { background:'#EF4444', color:'#fff' };
    if (item.badgeAmber) return { background:'#F59E0B', color:'#fff' };
    return { background:dark?'#30363D':'#E5E7EB', color:dark?'#8B949E':'#6B7280' };
  };

  return (
    <aside style={{
      position:'fixed', left:0, top:0, height:'100vh', width:W, zIndex:40,
      display:'flex', flexDirection:'column',
      background:dark?'#161B22':'#FFFFFF',
      borderRight:`1px solid ${dark?'#30363D':'#E5E7EB'}`,
      fontFamily:'Inter,system-ui,sans-serif',
      transition:'width 0.2s cubic-bezier(0.4,0,0.2,1)',
      overflow:'hidden',
    }}>

      {/* Brand */}
      <div style={{
        display:'flex', alignItems:'center',
        justifyContent:sidebarOpen?'space-between':'center',
        padding:sidebarOpen?'14px 14px':'14px 0',
        borderBottom:`1px solid ${dark?'#30363D':'#E5E7EB'}`,
        minHeight:56, flexShrink:0,
      }}>
        {sidebarOpen && (
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:32, height:32, borderRadius:8, background:'#5B3FC8', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 3px 10px rgba(91,63,200,0.4)',
            }}>
              <span style={{ color:'#fff', fontSize:14, fontWeight:800 }}>B</span>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:dark?'#E6EDF3':'#111827', lineHeight:1 }}>Birdeye</div>
              <div style={{ fontSize:9, fontWeight:600, color:dark?'#8B949E':'#9CA3AF', letterSpacing:'0.07em', textTransform:'uppercase', marginTop:2 }}>SDR Workspace</div>
            </div>
          </div>
        )}
        {!sidebarOpen && (
          <div style={{ width:32, height:32, borderRadius:8, background:'#5B3FC8', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'#fff', fontSize:14, fontWeight:800 }}>B</span>
          </div>
        )}
        {sidebarOpen && (
          <button onClick={toggleSidebar} style={{
            width:26, height:26, borderRadius:6, border:'none', background:'transparent',
            cursor:'pointer', color:dark?'#8B949E':'#9CA3AF', display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background=dark?'#21262D':'#F3F4F5'; e.currentTarget.style.color=dark?'#E6EDF3':'#111827';}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent'; e.currentTarget.style.color=dark?'#8B949E':'#9CA3AF';}}>
            <PanelLeftClose size={14}/>
          </button>
        )}
      </div>

      {/* User pill */}
      {sidebarOpen ? (
        <div style={{ display:'flex', alignItems:'center', gap:8, margin:'10px 10px 4px', padding:'8px 10px', borderRadius:10, cursor:'pointer', transition:'background 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background=dark?'#21262D':'#F9FAFB'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>P</div>
            <div style={{ position:'absolute', bottom:-1, right:-1, width:8, height:8, borderRadius:'50%', background:'#10B981', border:`2px solid ${dark?'#161B22':'#fff'}` }}/>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:dark?'#E6EDF3':'#111827' }}>Paul</div>
            <div style={{ fontSize:10, color:dark?'#8B949E':'#6B7280' }}>Senior SDR · Online</div>
          </div>
          <ChevronDown size={11} color={dark?'#8B949E':'#9CA3AF'}/>
        </div>
      ) : (
        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
          <div style={{ position:'relative' }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>P</div>
            <div style={{ position:'absolute', bottom:0, right:0, width:7, height:7, borderRadius:'50%', background:'#10B981', border:`2px solid ${dark?'#161B22':'#fff'}` }}/>
          </div>
        </div>
      )}

      {/* New Lead */}
      <div style={{ padding:sidebarOpen?'6px 10px 8px':'6px 8px 8px', flexShrink:0 }}>
        <button onClick={() => handleNav('newlead')} style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
          padding:'9px 0', borderRadius:10, border:'none', cursor:'pointer',
          background:'#5B3FC8', color:'#fff', fontSize:12, fontWeight:600, fontFamily:'inherit',
          boxShadow:'0 3px 10px rgba(91,63,200,0.3)', transition:'background 0.15s, transform 0.1s',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='#4828B5'}
          onMouseLeave={e=>e.currentTarget.style.background='#5B3FC8'}
          onMouseDown={e=>e.currentTarget.style.transform='scale(0.97)'}
          onMouseUp={e=>e.currentTarget.style.transform='scale(1)'}>
          <Plus size={14}/>
          {sidebarOpen && 'New Lead'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'0 6px' }}>
        {NAV.map((item) => {
          
          const Icon = item.icon;
          const isActive = view===item.id;
          return (
            <button key={item.id} onClick={()=>handleNav(item.id)}
              title={!sidebarOpen?item.label:undefined}
              style={{
                width:'100%', display:'flex', alignItems:'center',
                justifyContent:sidebarOpen?'flex-start':'center',
                gap:10, padding:sidebarOpen?'7px 10px':'8px 0',
                borderRadius:8, border:'none', cursor:'pointer', marginBottom:1,
                background:isActive?(dark?'rgba(91,63,200,0.18)':'rgba(91,63,200,0.1)'):'transparent',
                color:isActive?'#7C5CE8':(dark?'#8B949E':'#6B7280'),
                fontSize:12, fontWeight:isActive?600:500,
                fontFamily:'inherit', transition:'all 0.12s',
              }}
              onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background=dark?'#21262D':'#F9FAFB'; e.currentTarget.style.color=dark?'#E6EDF3':'#111827';}}}
              onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background='transparent'; e.currentTarget.style.color=dark?'#8B949E':'#6B7280';}}}>
              <Icon size={15} style={{ flexShrink:0 }}/>
              {sidebarOpen && (
                <>
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
                  {(liveBadges[item.id] ?? item.badge) != null && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:99, minWidth:18, textAlign:'center', ...getBadgeBg(item) }}>
                      {liveBadges[item.id] ?? item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ flexShrink:0, borderTop:`1px solid ${dark?'#30363D':'#E5E7EB'}` }}>
        {/* Booking link */}
        {sidebarOpen && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px 4px' }}>
            <Link2 size={11} color={dark?'#484F58':'#D1D5DB'}/>
            <span style={{ fontSize:10, color:dark?'#8B949E':'#9CA3AF', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>cal.com/paulwalker</span>
            <button style={{ padding:2, border:'none', background:'transparent', cursor:'pointer', color:dark?'#484F58':'#D1D5DB' }}><Copy size={10}/></button>
          </div>
        )}

        {/* AI Copilot button — matches image 1 */}
        <div style={{ padding:sidebarOpen?'6px 10px 8px':'6px 8px 8px' }}>
          <button onClick={()=>openCopilot('Email', null)} style={{
            width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            padding:'9px 0', borderRadius:10, border:`1px solid rgba(91,63,200,0.3)`,
            cursor:'pointer', background:dark?'rgba(91,63,200,0.1)':'rgba(91,63,200,0.08)',
            color:'#7C5CE8', fontSize:12, fontWeight:600, fontFamily:'inherit',
            transition:'all 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background=dark?'rgba(91,63,200,0.2)':'rgba(91,63,200,0.15)'; e.currentTarget.style.borderColor='rgba(91,63,200,0.5)';}}
            onMouseLeave={e=>{e.currentTarget.style.background=dark?'rgba(91,63,200,0.1)':'rgba(91,63,200,0.08)'; e.currentTarget.style.borderColor='rgba(91,63,200,0.3)';}}>
            <Sparkles size={13}/>
            {sidebarOpen && 'AI Copilot'}
          </button>
        </div>

        {/* Theme + collapse */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:sidebarOpen?'space-between':'center', padding:sidebarOpen?'2px 14px 10px':'2px 0 10px' }}>
          {!sidebarOpen && (
            <button onClick={toggleSidebar} style={{ padding:6, borderRadius:6, border:'none', background:'transparent', cursor:'pointer', color:dark?'#8B949E':'#9CA3AF', display:'flex', alignItems:'center', justifyContent:'center' }}
              title="Expand sidebar">
              <PanelLeftOpen size={14}/>
            </button>
          )}
          {sidebarOpen && (
            <>
              <button onClick={toggleTheme} style={{
                display:'flex', alignItems:'center', gap:4, fontSize:10, padding:'4px 8px', borderRadius:6,
                border:`1px solid ${dark?'#30363D':'#E5E7EB'}`, background:'transparent',
                color:dark?'#8B949E':'#6B7280', fontFamily:'inherit', cursor:'pointer',
              }}>
                {dark?<Sun size={11}/>:<Moon size={11}/>}{dark?'Light':'Dark'}
              </button>
              <button onClick={toggleSidebar} style={{ padding:4, borderRadius:5, border:'none', background:'transparent', cursor:'pointer', color:dark?'#484F58':'#D1D5DB' }}
                title="Collapse">
                <PanelLeftClose size={13}/>
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
