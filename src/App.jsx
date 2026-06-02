import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import Sidebar       from './components/Sidebar';
import TopBar        from './components/TopBar';
import Copilot       from './components/Copilot';
import ClipboardSearch from './components/ClipboardSearch';
import WorkQueue     from './views/WorkQueue';
import LeadPage      from './views/LeadPage';
import MyLeads       from './views/MyLeads';
import Reports       from './views/Reports';
import Dashboard     from './views/Dashboard';
import Cadences      from './views/Cadences';
import ReEngage      from './views/ReEngage';
import NewLead       from './views/NewLead';
import BulkCSV       from './views/BulkCSV';
import AIMemory      from './views/AIMemory';
import Pipeline      from './views/Pipeline';
import Settings      from './views/Settings';
import PromptBuilder from './views/PromptBuilder';
import { HotLeads, FollowUps, DemoBooked } from './views/FilteredLeads';

const VIEWS = {
  dashboard:Dashboard,    workqueue:WorkQueue,    leads:MyLeads,
  hot:HotLeads,           followups:FollowUps,    demobooked:DemoBooked,
  reengage:ReEngage,      pipeline:Pipeline,      reports:Reports,
  cadences:Cadences,      memory:AIMemory,        settings:Settings,
  newlead:NewLead,        bulkcsv:BulkCSV,        promptbuilder:PromptBuilder,
};

function Shell() {
  const { theme, view, activeLead, sidebarOpen, clipSearch, setClipSearch } = useApp();
  const SW = sidebarOpen ? 240 : 56;
  const fullWidth = ['pipeline','cadences','promptbuilder'].includes(view);
  const zeroPad   = view === 'promptbuilder';

  useEffect(() => {
    document.documentElement.classList.toggle('dark',  theme==='dark');
    document.documentElement.classList.toggle('light', theme==='light');
  }, [theme]);

  // Global ⌘K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setClipSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const View = VIEWS[view] || Dashboard;

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--t1)', fontFamily:'Inter,system-ui,sans-serif' }}>
      <Sidebar />
      <TopBar sidebarWidth={SW}/>
      <main style={{ marginLeft:SW, paddingTop:56, transition:'margin-left 0.2s cubic-bezier(0.4,0,0.2,1)' }}>
        <div style={{ padding: zeroPad?0:fullWidth?'20px 16px':'28px 24px', maxWidth: fullWidth?'100%':1240, margin:'0 auto' }}>
          {activeLead ? <LeadPage /> : <View />}
        </div>
      </main>
      <Copilot />
      {clipSearch && <ClipboardSearch />}
    </div>
  );
}

export default function App() {
  return <AppProvider><Shell /></AppProvider>;
}
