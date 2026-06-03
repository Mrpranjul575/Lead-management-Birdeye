/**
 * ACTION CENTER
 * Context-aware execution hub for the LeadPage OverviewTab.
 * Replaces the static Quick Actions card.
 *
 * Priority order:
 *   1. Pending cadence actions  — channel-aware Copilot launch
 *   2. Recommended action       — top suggestion from deriveNextBestSuggestions
 *                                 (only shown when no cadence actions pending)
 *   3. Utility actions          — always available, separated by a divider
 *
 * Recommendation logic lives in NextBestStep — not duplicated here.
 */

import { PhoneCall, Calendar, Mic, Plus, Zap, GitBranch } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPendingSteps, getCadenceProgress } from '../utils/cadenceUtils';
import { deriveNextBestSuggestions } from './NextBestStep';

const CHANNEL_TO_MODE = { Email:'email', SMS:'sms', VM:'voicemail', LinkedIn:'linkedin' };

function ActionButton({ icon:Icon, label, color='#7C5CE8', onClick, variant='default' }) {
  const base = {
    display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
    borderRadius:7, border:'1px solid var(--b1)', background:'transparent',
    cursor:'pointer', color:'var(--t1)', fontSize:11, fontFamily:'inherit',
    transition:'all 0.12s', textAlign:'left', width:'100%',
  };
  const highlighted = {
    ...base,
    border:`1px solid ${color}40`,
    background:`${color}08`,
  };
  const style = variant === 'highlighted' ? highlighted : base;
  return (
    <button
      onClick={onClick}
      style={style}
      onMouseEnter={e => {
        e.currentTarget.style.background = variant === 'highlighted' ? `${color}18` : 'var(--s3)';
        e.currentTarget.style.borderColor = variant === 'highlighted' ? `${color}60` : 'rgba(91,63,200,0.3)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = variant === 'highlighted' ? `${color}08` : 'transparent';
        e.currentTarget.style.borderColor = variant === 'highlighted' ? `${color}40` : 'var(--b1)';
      }}>
      <Icon size={12} color={color}/>
      {label}
    </button>
  );
}

export default function ActionCenter({ lead, onCallNotes, onFollowUp, onRecording, onTabChange }) {
  const { openCopilot } = useApp();

  // Priority 1: pending cadence steps
  const pendingSteps = (lead.cadenceDay > 0) ? getPendingSteps(lead) : [];
  const cadProgress  = getCadenceProgress(lead);

  // Priority 2: top NextBestStep suggestion (only when no cadence pending)
  const suggestions   = deriveNextBestSuggestions(lead);
  const topSuggestion = pendingSteps.length === 0 ? suggestions[0] : null;

  return (
    <div style={{ background:'var(--bg)', border:'1px solid var(--b1)', borderRadius:12, padding:'14px' }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
        Action Center
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>

        {/* Priority 1 — Pending cadence actions */}
        {pendingSteps.slice(0, 2).map(step => (
          <ActionButton
            key={step.key}
            icon={Zap}
            label={`Generate ${step.label}`}
            color="#5B3FC8"
            variant="highlighted"
            onClick={() => openCopilot(CHANNEL_TO_MODE[step.channel] || 'email', lead)}
          />
        ))}

        {/* Priority 2 — Recommended action from NextBestStep (hidden when cadence active) */}
        {topSuggestion && (
          <ActionButton
            icon={topSuggestion.icon}
            label={topSuggestion.action}
            color={topSuggestion.color}
            variant="highlighted"
            onClick={() => openCopilot(topSuggestion.channel, lead)}
          />
        )}

        {/* Cadence status — shown when a cadence is assigned */}
        {cadProgress.name && (
          <div style={{ padding:'7px 10px', borderRadius:7, background:'rgba(91,63,200,0.06)', border:'1px solid rgba(91,63,200,0.15)', display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <GitBranch size={11} color="#7C5CE8"/>
                <span style={{ fontSize:11, fontWeight:600, color:'#7C5CE8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{cadProgress.name}</span>
              </div>
              <span style={{ fontSize:10, color:'var(--t2)', flexShrink:0 }}>
                {cadProgress.isComplete ? '✓ Done' : cadProgress.isStarted ? `Day ${cadProgress.day}/${cadProgress.total}` : 'Not started'}
              </span>
            </div>
            {cadProgress.totalSteps > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, color:'var(--t2)' }}>{cadProgress.completedSteps}/{cadProgress.totalSteps} steps</span>
                  <span style={{ fontSize:9, fontWeight:700, color: cadProgress.isComplete ? '#10B981' : '#7C5CE8' }}>{cadProgress.pct}%</span>
                </div>
                <div style={{ height:3, borderRadius:99, background:'var(--b1)', overflow:'hidden' }}>
                  <div style={{ height:3, borderRadius:99, background: cadProgress.isComplete ? '#10B981' : '#5B3FC8', width:`${cadProgress.pct}%`, transition:'width 0.4s ease' }}/>
                </div>
              </div>
            )}
            {cadProgress.nextStep && !cadProgress.isComplete && (
              <span style={{ fontSize:9, color:'var(--t2)' }}>Next: {cadProgress.nextStep}</span>
            )}
          </div>
        )}

        {/* Divider */}
        <div style={{ height:1, background:'var(--b1)', margin:'2px 0' }}/>

        {/* Priority 3 — Utility actions (always present) */}
        <ActionButton icon={PhoneCall} label="Add Call Notes"     color="#10B981" onClick={onCallNotes}/>
        <ActionButton icon={Mic}       label="Upload Recording"   color="#EC4899" onClick={onRecording}/>
        <ActionButton icon={Calendar}  label="Schedule Follow Up" color="#7C5CE8" onClick={onFollowUp}/>
        <ActionButton icon={Plus}      label="Add Note"           color="#7C5CE8" onClick={() => onTabChange('memory')}/>

      </div>
    </div>
  );
}
