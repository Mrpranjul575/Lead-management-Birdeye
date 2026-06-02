import { useState } from 'react';
import { MoreHorizontal, Plus, Clock, Zap, Mail, Phone } from 'lucide-react';
import { STAGE_STYLE, INTENT_STYLE } from '../constants/stages';
import { useApp } from '../context/AppContext';

const COLUMNS = [
  { id:'New',         label:'New',          color:'#3B82F6', dot:'#60A5FA'  },
  { id:'Contacted',   label:'Contacted',    color:'#F59E0B', dot:'#FCD34D'  },
  { id:'Follow Up',   label:'Follow Up',    color:'#38BDF8', dot:'#38BDF8'  },
  { id:'Demo Booked', label:'Demo Booked',  color:'#7C5CE8', dot:'#7C5CE8'  },
  { id:'Nurturing',   label:'Nurturing',    color:'#EC4899', dot:'#F472B6'  },
  { id:'Converted',   label:'Converted',    color:'#10B981', dot:'#34D399'  },
  { id:'Lost',        label:'Lost',         color:'#EF4444', dot:'#F87171'  },
];


function ScoreBar({ score }) {
  const color = score>=80?'#10B981':score>=65?'#F59E0B':'#EF4444';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
      <div style={{ flex:1, height:3, background:'var(--b1)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:3, width:`${score}%`, background:color, borderRadius:99 }}/>
      </div>
      <span style={{ fontSize:9, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace', flexShrink:0 }}>{score}</span>
    </div>
  );
}

function LeadCard({ lead, theme, onOpen }) {
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S2=dark?'#0D1117':'#F8F9FA';
  const itnt = INTENT_STYLE[lead.intent] || INTENT_STYLE['AI Visibility'];
  const initials = lead.business.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={e=>{ e.dataTransfer.setData('leadId', lead.id); setDragging(true); }}
      onDragEnd={()=>setDragging(false)}
      onClick={()=>onOpen(lead)}
      style={{
        background: dark?'#161B22':'#FFFFFF',
        border:`1px solid ${dragging?'rgba(91,63,200,0.5)':B1}`,
        borderRadius:10, padding:'12px', cursor:'grab',
        transform: dragging?'rotate(1.5deg) scale(1.02)':'none',
        boxShadow: dragging?'0 8px 24px rgba(0,0,0,0.3)':'0 1px 3px rgba(0,0,0,0.1)',
        transition:'box-shadow 0.15s, border-color 0.15s',
        opacity: dragging?0.85:1,
      }}
      onMouseEnter={e=>{ if(!dragging) e.currentTarget.style.borderColor='rgba(91,63,200,0.35)'; }}
      onMouseLeave={e=>{ if(!dragging) e.currentTarget.style.borderColor=B1; }}>

      {/* Card header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <div style={{ width:26, height:26, borderRadius:7, background:'linear-gradient(135deg,#5B3FC8,#3B82F6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0 }}>
            {initials}
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, color:T1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{lead.business}</div>
            <div style={{ fontSize:9, color:T2, fontFamily:'JetBrains Mono,monospace', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{lead.email}</div>
          </div>
        </div>
        <button onClick={e=>{e.stopPropagation();}} style={{ padding:2, border:'none', background:'transparent', cursor:'pointer', color:T2, flexShrink:0 }}>
          <MoreHorizontal size={12}/>
        </button>
      </div>

      {/* Intent + score */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ ...itnt, padding:'1px 6px', borderRadius:99, fontSize:9, fontWeight:500 }}>{lead.intent}</span>
        {lead.stage==='Hot' && <span style={{ fontSize:9 }}>🔥</span>}
      </div>

      {/* Score bar */}
      <ScoreBar score={lead.aiScore}/>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
        <span style={{ fontSize:9, color:T2, display:'flex', alignItems:'center', gap:3 }}>
          <Clock size={8}/> {lead.lastTouch}
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={e=>e.stopPropagation()} style={{ width:20, height:20, borderRadius:4, border:`1px solid ${B1}`, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T2, transition:'all 0.12s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#5B3FC8'; e.currentTarget.style.color='#7C5CE8';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T2;}}>
            <Mail size={9}/>
          </button>
          <button onClick={e=>e.stopPropagation()} style={{ width:20, height:20, borderRadius:4, border:`1px solid ${B1}`, background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:T2, transition:'all 0.12s' }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor='#10B981'; e.currentTarget.style.color='#10B981';}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=B1; e.currentTarget.style.color=T2;}}>
            <Zap size={9}/>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { theme, leads, updateLead, openLead } = useApp();
  const dark = theme==='dark';
  const T1='var(--t1)', T2='var(--t2)', B1='var(--b1)';
  const S1=dark?'#161B22':'#FFFFFF', S2=dark?'#0D1117':'#F8F9FA';

  const [dragOver, setDragOver] = useState(null);

  const handleDrop = (e, colId) => {
    e.preventDefault();
    const leadId = parseInt(e.dataTransfer.getData('leadId'));
    if (leadId) updateLead(leadId, { stage: colId });
    setDragOver(null);
  };

  const byStage = (stageId) => leads.filter(l => l.stage === stageId);
  const totalValue = (stageId) => byStage(stageId).length;

  return (
    <div className="fade-up" style={{ display:'flex', flexDirection:'column', gap:16, height:'calc(100vh - 140px)', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, color:T1, margin:0 }}>Pipeline</h1>
          <p style={{ fontSize:12, color:T2, marginTop:3 }}>Drag leads between stages to update their status</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ display:'flex', gap:4 }}>
            {['Kanban','Table'].map((v,i)=>(
              <button key={v} style={{ padding:'6px 12px', borderRadius:7, border:`1px solid ${B1}`, background:i===0?S1:'transparent', color:i===0?T1:T2, fontSize:11, cursor:'pointer', fontFamily:'inherit', fontWeight:i===0?600:400 }}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display:'flex', gap:10, flexShrink:0, overflowX:'auto', paddingBottom:4 }}>
        {COLUMNS.map(col=>{
          const count = byStage(col.id).length;
          return (
            <div key={col.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, background:S1, border:`1px solid ${B1}`, flexShrink:0 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:col.dot }}/>
              <span style={{ fontSize:11, color:T1, fontWeight:500 }}>{col.label}</span>
              <span style={{ fontSize:10, fontWeight:700, color:col.color, fontFamily:'JetBrains Mono,monospace' }}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban board */}
      <div style={{ display:'flex', gap:12, flex:1, overflow:'hidden' }}>
        {COLUMNS.map(col=>{
          const colLeads = byStage(col.id);
          const isOver = dragOver===col.id;
          return (
            <div key={col.id}
              onDragOver={e=>{e.preventDefault(); setDragOver(col.id);}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={e=>handleDrop(e, col.id)}
              style={{
                flex:1, minWidth:160, maxWidth:220, display:'flex', flexDirection:'column', gap:0,
                background: isOver?`rgba(${col.id==='Converted'?'16,185,129':'91,63,200'},0.06)`:S2,
                border:`1px solid ${isOver?col.color:B1}`,
                borderRadius:12, overflow:'hidden', transition:'all 0.15s',
                boxShadow: isOver?`0 0 0 2px ${col.color}40`:'none',
              }}>

              {/* Column header */}
              <div style={{ padding:'10px 12px', borderBottom:`1px solid ${B1}`, background: dark?'rgba(0,0,0,0.2)':'rgba(0,0,0,0.03)', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }}/>
                    <span style={{ fontSize:11, fontWeight:600, color:T1 }}>{col.label}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:col.color, background:`${col.color}20`, padding:'0px 5px', borderRadius:99, fontFamily:'JetBrains Mono,monospace' }}>{colLeads.length}</span>
                  </div>
                  <button style={{ padding:2, border:'none', background:'transparent', cursor:'pointer', color:T2 }}>
                    <Plus size={12}/>
                  </button>
                </div>
              </div>

              {/* Cards */}
              <div style={{ flex:1, overflowY:'auto', padding:'10px 8px', display:'flex', flexDirection:'column', gap:8 }}>
                {colLeads.length===0 ? (
                  <div style={{ padding:'20px 8px', textAlign:'center', color:dark?'rgba(72,79,88,0.5)':'rgba(209,213,219,0.8)', fontSize:11, border:`1.5px dashed ${dark?'#21262D':'#E5E7EB'}`, borderRadius:8 }}>
                    Drop leads here
                  </div>
                ) : colLeads.map(lead=>(
                  <LeadCard key={lead.id} lead={lead} theme={theme} onOpen={openLead}/>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
