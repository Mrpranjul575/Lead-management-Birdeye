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

import { PhoneCall, Calendar, Mic, Plus, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getPendingSteps } from '../utils/cadenceUtils';
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
