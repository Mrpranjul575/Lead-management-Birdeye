/**
 * CommandCenter.jsx — Phase 12: SDR Command Center
 *
 * Exports:
 *   NextActionBanner    — persistent banner between lead header and tab bar
 *   SDRWorkspaceTab     — single-panel 'workspace' tab (no tab switching needed)
 *   AIBriefingTab       — pre-call brief 'brief' tab
 *   PromptContextTab    — 'prompt_context' tab showing exactly what AI sees
 *
 * Architecture rules:
 *   - All components are read-only display over existing lead data
 *   - No new state, no new persistence, no AI calls
 *   - Trust model unchanged: only isConfirmed() AK facts displayed
 *   - AI suggestions labelled clearly; SDR retains all decisions
 */

import { useState } from 'react';
import {
  Zap, Mail, MessageSquare, Mic, Link2, Phone,
  GitBranch, Clock, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Eye, Brain, Target,
  Sparkles, Copy, Check
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { deriveSignals, deriveActivityIntelligence } from '../utils/intelligenceEngine';
import { getPendingSteps, getCadenceProgress } from '../utils/cadenceUtils';
import { deriveNextBestSuggestions } from './NextBestStep';
import { buildLeadContext } from '../services/prompts';
import { isConfirmed } from '../data/schema';
import { normalizeEvent } from '../utils/timelineUtils';

// ── shared palette helpers ─────────────────────────────────────────────────
const URGENCY_STYLE = {
  high: { bg:'rgba(239,68,68,0.12)',  color:'#F87171',  label:'Do now'    },
  med:  { bg:'rgba(245,158,11,0.12)', color:'#FCD34D',  label:'Today'     },
  low:  { bg:'rgba(59,130,246,0.12)', color:'#60A5FA',  label:'This week' },
};
const CHANNEL_TO_MODE = { Email:'email', SMS:'sms', VM:'voicemail', LinkedIn:'linkedin', Call:'email' };

function relTime(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d ago`;
  if (hr  > 0) return `${hr}h ago`;
  if (min > 0) return `${min}m ago`;
  return 'just now';
}

// ══════════════════════════════════════════════════════════════════════════════
// NextActionBanner
// Persistent bar between lead header and tab bar.
// Answers: "What should I do RIGHT NOW with this lead?"
// ══════════════════════════════════════════════════════════════════════════════
export function NextActionBanner({ lead }) {
  const { openCopilot } = useApp();
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';
  if (!lead) return null;

  const suggestions  = deriveNextBestSuggestions(lead);
  const top          = suggestions[0];
  const actIntel     = deriveActivityIntelligence(lead);
  const urg          = URGENCY_STYLE[top?.urgency] || URGENCY_STYLE.med;
  const Icon         = top?.icon || Zap;
  const days         = actIntel.daysSinceLastContact;

  // Context pills — surface the key "why" signals
  const pills = [];
  if (days === null)    pills.push({ label: 'Never contacted', color: '#8B949E' });
  else if (days >= 7)   pills.push({ label: `${days}d no contact`, color: '#F87171' });
  else if (days >= 3)   pills.push({ label: `${days}d since touch`, color: '#FCD34D' });
  else if (days === 0)  pills.push({ label: 'Contacted today', color: '#34D399' });

  const bsCount = (lead.intelligence?.buyingSignals || []).length;
  if (bsCount > 0) pills.push({ label: `${bsCount} buying signal${bsCount > 1 ? 's' : ''}`, color: '#34D399' });

  const objCount = (lead.intelligence?.objections || []).length;
  if (objCount > 0) pills.push({ label: `${objCount} objection${objCount > 1 ? 's' : ''}`, color: '#F87171' });

  const ak = lead.accountKnowledge;
  const confirmedComps = (ak?.competitors || []).filter(isConfirmed).length;
  if (confirmedComps > 0) pills.push({ label: `${confirmedComps} competitor${confirmedComps > 1 ? 's' : ''} known`, color: '#F59E0B' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px',
      background: `linear-gradient(135deg, ${urg.color}0A 0%, transparent 100%)`,
      border: `1px solid ${urg.color}28`,
      borderRadius: 10, marginBottom: 8,
    }}>
      {/* Urgency icon */}
      <div style={{
        width: 34, height: 34, borderRadius: 9,
        background: urg.bg, border: `1px solid ${urg.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={15} color={urg.color} />
      </div>

      {/* Action + context */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T1 }}>
            {top?.action || 'Take action'}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
            background: urg.bg, color: urg.color,
          }}>{urg.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {pills.map((p, i) => (
            <span key={i} style={{
              fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
              background: p.color + '18', color: p.color,
            }}>{p.label}</span>
          ))}
          {top?.reason && (
            <span style={{ fontSize: 10, color: T2, alignSelf: 'center' }}>· {top.reason}</span>
          )}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={() => openCopilot(CHANNEL_TO_MODE[top?.channel] || 'email', lead)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 8, border: 'none',
          background: '#5B3FC8', color: '#fff',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', flexShrink: 0,
          boxShadow: '0 2px 8px rgba(91,63,200,0.3)',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#7C5CE8'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#5B3FC8'; }}
      >
        <Sparkles size={12} /> Generate {top?.channel || 'Message'}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SDRWorkspaceTab
// Single-panel view answering all four SDR questions without tab switching.
// ══════════════════════════════════════════════════════════════════════════════
export function SDRWorkspaceTab({ lead, onCallNotes, onFollowUp, onTabChange }) {
  const { openCopilot } = useApp();
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';
  const intel      = lead.intelligence || {};
  const derived    = deriveSignals(lead);
  const actIntel   = deriveActivityIntelligence(lead);
  const cadProgress = getCadenceProgress(lead);
  const suggestions = deriveNextBestSuggestions(lead);
  const top         = suggestions[0];
  const urg         = URGENCY_STYLE[top?.urgency] || URGENCY_STYLE.med;
  const Icon        = top?.icon || Zap;

  const confirmedComps = (lead.accountKnowledge?.competitors || []).filter(isConfirmed);
  const openFollowUps  = (lead.followUps || []).filter(f => !f.done);

  // Score color
  const sc = lead.aiScore >= 75 ? '#10B981' : lead.aiScore >= 50 ? '#F59E0B' : '#F87171';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

      {/* ── Col 1 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Scores + signals */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Lead Status</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
            {/* Score circle */}
            <div style={{
              width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
              background: `conic-gradient(${sc} ${lead.aiScore * 3.6}deg, var(--b1) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 3px var(--bg), 0 0 0 5px ${sc}28`,
            }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: sc, fontFamily: 'JetBrains Mono,monospace' }}>{lead.aiScore}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T2, marginBottom: 3 }}>Opportunity Score</div>
              {/* Temperature */}
              {intel.leadTemperature && (
                <div style={{ fontSize: 13, fontWeight: 700, color: intel.leadTemperature === 'Hot' || intel.leadTemperature === 'On Fire' ? '#EF4444' : intel.leadTemperature === 'Warm' ? '#F59E0B' : '#60A5FA' }}>
                  {intel.leadTemperature === 'Hot' ? '🔥' : intel.leadTemperature === 'Warm' ? '🌤' : '❄️'} {intel.leadTemperature}
                </div>
              )}
              <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {[
                  { label: derived.urgency, color: derived.urgency === 'Critical' ? '#F87171' : derived.urgency === 'High' ? '#FCD34D' : '#60A5FA' },
                  { label: derived.engagementLevel, color: derived.engagementLevel === 'Active' ? '#34D399' : '#8B949E' },
                  { label: `Risk: ${derived.riskLevel}`, color: derived.riskLevel === 'High' ? '#F87171' : derived.riskLevel === 'Medium' ? '#FCD34D' : '#34D399' },
                ].map((s, i) => (
                  <span key={i} style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: s.color + '18', color: s.color }}>{s.label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Contact recency */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '7px 10px', borderRadius: 8, background: 'var(--s2)', border: `1px solid ${B1}` }}>
            <Clock size={11} color={actIntel.daysSinceLastContact > 7 ? '#F87171' : T2} />
            <span style={{ fontSize: 11, color: actIntel.daysSinceLastContact > 7 ? '#F87171' : T1 }}>
              {actIntel.daysSinceLastContact === null ? 'Never contacted'
                : actIntel.daysSinceLastContact === 0 ? 'Contacted today'
                : `Last contact: ${actIntel.daysSinceLastContact}d ago`}
            </span>
            {actIntel.hasReplied && <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 'auto', color: '#34D399' }}>✓ Has replied</span>}
          </div>
        </div>

        {/* Recommended next action */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${urg.color}30`, borderRadius: 11, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Recommended Action</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: urg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={14} color={urg.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T1, marginBottom: 2 }}>{top?.action}</div>
              <div style={{ fontSize: 11, color: T2, lineHeight: 1.5 }}>{top?.reason}</div>
            </div>
          </div>
          <button
            onClick={() => openCopilot(CHANNEL_TO_MODE[top?.channel] || 'email', lead)}
            style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: '#5B3FC8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#7C5CE8'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#5B3FC8'; }}
          >
            <Sparkles size={12} /> Generate {top?.channel} with Copilot
          </button>
        </div>

        {/* Active cadence */}
        {cadProgress.name && (
          <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Active Cadence</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <GitBranch size={13} color="#7C5CE8" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7C5CE8' }}>{cadProgress.name}</span>
              <span style={{ fontSize: 10, color: T2, marginLeft: 'auto' }}>
                {cadProgress.isComplete ? '✓ Complete' : `Day ${cadProgress.day}/${cadProgress.total}`}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 99, background: 'var(--b1)', overflow: 'hidden' }}>
              <div style={{ height: 4, borderRadius: 99, background: cadProgress.isComplete ? '#10B981' : '#5B3FC8', width: `${cadProgress.pct}%`, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: 10, color: T2, marginTop: 5 }}>{cadProgress.completedSteps}/{cadProgress.totalSteps} steps · {cadProgress.pct}%</div>
            {cadProgress.nextStep && !cadProgress.isComplete && (
              <div style={{ fontSize: 10, color: '#7C5CE8', marginTop: 4 }}>Next: {cadProgress.nextStep}</div>
            )}
          </div>
        )}

        {/* Open follow-ups */}
        {openFollowUps.length > 0 && (
          <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Open Follow-Ups</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#F59E0B' }}>{openFollowUps.length}</span>
            </div>
            {openFollowUps.slice(0, 3).map((fu, i) => (
              <div key={fu.id || i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderTop: i > 0 ? `1px solid ${B1}` : 'none' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B' }}>{fu.type?.charAt(0).toUpperCase() + fu.type?.slice(1)}</span>
                <span style={{ fontSize: 10, color: T2, flex: 1 }}>{fu.display}</span>
              </div>
            ))}
            {openFollowUps.length > 3 && (
              <button onClick={() => onTabChange?.('followups')} style={{ marginTop: 6, fontSize: 10, color: '#7C5CE8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                +{openFollowUps.length - 3} more →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Col 2 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Intelligence snapshot */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Intelligence</div>
          {[
            { field: 'painPoints',    label: 'Pain Points',    color: '#F87171' },
            { field: 'buyingSignals', label: 'Buying Signals', color: '#34D399' },
            { field: 'objections',    label: 'Objections',     color: '#F472B6' },
          ].map(({ field, label, color }) => {
            const items = intel[field] || [];
            if (items.length === 0) return null;
            return (
              <div key={field} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {items.slice(0, 3).map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                      <span style={{ fontSize: 11, color: 'var(--t1)', lineHeight: 1.5 }}>{item}</span>
                    </div>
                  ))}
                  {items.length > 3 && <span style={{ fontSize: 10, color: T2 }}>+{items.length - 3} more</span>}
                </div>
              </div>
            );
          })}
          {!intel.painPoints?.length && !intel.buyingSignals?.length && !intel.objections?.length && (
            <div style={{ fontSize: 11, color: T2, fontStyle: 'italic' }}>No intelligence logged. Run Gemini enrichment or add call notes.</div>
          )}
          {intel.summary && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--s2)', border: `1px solid ${B1}`, fontSize: 11, color: T2, lineHeight: 1.6 }}>
              {intel.summary}
            </div>
          )}
        </div>

        {/* Confirmed AK */}
        {confirmedComps.length > 0 && (
          <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Confirmed Competitors</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {confirmedComps.slice(0, 4).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 9px', borderRadius: 7, background: 'var(--s2)', border: `1px solid ${B1}` }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T1, flex: 1 }}>{c.name}</span>
                  {c.strength && c.strength !== 'unknown' && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: c.strength === 'stronger' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: c.strength === 'stronger' ? '#F87171' : '#34D399' }}>{c.strength}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent timeline — last 3 events */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Activity</div>
            <button onClick={() => onTabChange?.('timeline')} style={{ fontSize: 10, color: '#7C5CE8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Full timeline →</button>
          </div>
          {(lead.activities || []).length === 0 ? (
            <div style={{ fontSize: 11, color: T2, fontStyle: 'italic' }}>No activities yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(lead.activities || []).slice(0, 4).map((a, i) => {
                const ev = normalizeEvent(a);
                if (!ev) return null;
                return (
                  <div key={a.activityId || i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 7, background: 'var(--s2)', border: `1px solid ${B1}` }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{ev.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      {ev.subtitle && <div style={{ fontSize: 10, color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.subtitle}</div>}
                    </div>
                    <span style={{ fontSize: 9, color: T2, flexShrink: 0 }}>{relTime(a.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick Actions</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { label: 'Add Call Notes', icon: Phone, color: '#10B981', action: onCallNotes },
              { label: 'Schedule Follow-Up', icon: CheckCircle2, color: '#7C5CE8', action: onFollowUp },
              { label: 'Account Knowledge', icon: Brain, color: '#F59E0B', action: () => onTabChange?.('account_knowledge') },
              { label: 'Score Explainer', icon: Target, color: '#3B82F6', action: () => onTabChange?.('scoring') },
            ].map(({ label, icon: I, color, action }) => (
              <button key={label} onClick={action} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 7, border: `1px solid ${B1}`, background: 'transparent', color: T1, fontSize: 10, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.background = color + '12'; e.currentTarget.style.borderColor = color + '40'; e.currentTarget.style.color = color; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = B1; e.currentTarget.style.color = T1; }}>
                <I size={11} color={color} />{label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AIBriefingTab — pre-call brief, single-screen layout
// ══════════════════════════════════════════════════════════════════════════════
export function AIBriefingTab({ lead }) {
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';
  const intel = lead.intelligence || {};
  const ak    = lead.accountKnowledge;

  const confirmedComps = (ak?.competitors || []).filter(isConfirmed);
  const confirmedDMs   = (ak?.decisionMakers || []).filter(isConfirmed);
  const confirmedTools = (ak?.currentTools || []).filter(isConfirmed);
  const confirmedGoals = (ak?.businessGoals || []).filter(isConfirmed);

  const suggestions = deriveNextBestSuggestions(lead);
  const top = suggestions[0];

  const recentActivities = (lead.activities || []).slice(0, 3).map(normalizeEvent).filter(Boolean);

  function Section({ title, color, children, empty }) {
    if (empty) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          {title}
        </div>
        {children}
      </div>
    );
  }

  function BulletList({ items, color }) {
    if (!items?.length) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 11, color: T1, lineHeight: 1.55 }}>{typeof item === 'string' ? item : item.name || item.goal || item.objection || String(item)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

      {/* ── Left column ── */}
      <div>
        {/* Header card */}
        <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T1, marginBottom: 2 }}>{lead.business}</div>
          <div style={{ fontSize: 11, color: T2, marginBottom: 8 }}>{lead.contact} · {lead.city} · {lead.industry}</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {[
              { label: lead.stage, color: '#7C5CE8' },
              { label: `Score ${lead.aiScore}`, color: lead.aiScore >= 75 ? '#10B981' : lead.aiScore >= 50 ? '#F59E0B' : '#F87171' },
              intel.leadTemperature && { label: intel.leadTemperature, color: intel.leadTemperature === 'Hot' ? '#EF4444' : intel.leadTemperature === 'Warm' ? '#F59E0B' : '#60A5FA' },
              { label: lead.intent, color: '#38BDF8' },
            ].filter(Boolean).map((p, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: p.color + '18', color: p.color }}>{p.label}</span>
            ))}
          </div>
        </div>

        {/* Pain points */}
        <Section title="Pain Points" color="#F87171" empty={!intel.painPoints?.length}>
          <BulletList items={intel.painPoints} color="#F87171" />
        </Section>

        {/* Buying signals */}
        <Section title="Buying Signals" color="#34D399" empty={!intel.buyingSignals?.length}>
          <BulletList items={intel.buyingSignals} color="#34D399" />
        </Section>

        {/* Objections */}
        <Section title="Objections to Handle" color="#F472B6" empty={!intel.objections?.length}>
          <BulletList items={intel.objections} color="#F472B6" />
        </Section>

        {/* AI summary */}
        {intel.summary && (
          <Section title="AI Summary" color="#60A5FA">
            <div style={{ fontSize: 11, color: T2, lineHeight: 1.65, padding: '8px 10px', borderRadius: 8, background: 'var(--s2)', border: `1px solid ${B1}` }}>
              {intel.summary}
            </div>
          </Section>
        )}
      </div>

      {/* ── Right column ── */}
      <div>
        {/* Recommended angle */}
        <div style={{ background: 'rgba(91,63,200,0.06)', border: '1px solid rgba(91,63,200,0.2)', borderRadius: 11, padding: '14px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7C5CE8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recommended Angle</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T1, marginBottom: 3 }}>{top?.action}</div>
          <div style={{ fontSize: 11, color: T2, lineHeight: 1.55 }}>{top?.reason}</div>
        </div>

        {/* Confirmed competitors */}
        <Section title="Known Competitors (Confirmed)" color="#F59E0B" empty={!confirmedComps.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {confirmedComps.slice(0, 5).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 9px', borderRadius: 7, background: 'var(--s2)', border: `1px solid ${B1}` }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T1, flex: 1 }}>{c.name}</span>
                {c.strength && c.strength !== 'unknown' && <span style={{ fontSize: 9, fontWeight: 600, color: c.strength === 'stronger' ? '#F87171' : '#34D399' }}>{c.strength}</span>}
              </div>
            ))}
          </div>
        </Section>

        {/* Decision makers */}
        <Section title="Decision Makers" color="#7C5CE8" empty={!confirmedDMs.length}>
          <BulletList items={confirmedDMs.map(d => d.role ? `${d.name} (${d.role})` : d.name)} color="#7C5CE8" />
        </Section>

        {/* Current tools */}
        <Section title="Current Tools" color="#38BDF8" empty={!confirmedTools.length}>
          <BulletList items={confirmedTools.map(t => t.category ? `${t.name} (${t.category})` : t.name)} color="#38BDF8" />
        </Section>

        {/* Business goals */}
        <Section title="Business Goals" color="#10B981" empty={!confirmedGoals.length}>
          <BulletList items={confirmedGoals.map(g => g.goal)} color="#10B981" />
        </Section>

        {/* Recent timeline */}
        {recentActivities.length > 0 && (
          <Section title="Recent Activity" color="#8B949E">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {recentActivities.map((ev, i) => (
                <div key={ev.activityId || i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{ev.icon}</span>
                  <span style={{ fontSize: 11, color: T1, flex: 1 }}>{ev.title}</span>
                  <span style={{ fontSize: 9, color: T2, flexShrink: 0 }}>{relTime(ev.timestamp)}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* AE Notes excerpt */}
        {lead.aeNotes && (
          <Section title="Research Notes" color="#8B949E">
            <div style={{ fontSize: 10, color: T2, lineHeight: 1.6, padding: '7px 9px', borderRadius: 7, background: 'var(--s2)', border: `1px solid ${B1}`, maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
              {lead.aeNotes.slice(0, 200)}{lead.aeNotes.length > 200 ? '…' : ''}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PromptContextTab — shows exactly what the AI sees when generating content
// ══════════════════════════════════════════════════════════════════════════════
export function PromptContextTab({ lead }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied]     = useState(false);
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  const fullContext = buildLeadContext(lead);

  // Parse each section and determine field status
  const intel = lead.intelligence || {};
  const ak    = lead.accountKnowledge;

  const SECTIONS = [
    {
      title: 'Lead Profile',
      icon: '👤',
      fields: [
        { label: 'Business',      value: lead.business,       included: !!lead.business },
        { label: 'Contact',       value: lead.contact,        included: !!lead.contact },
        { label: 'Location',      value: lead.city,           included: !!lead.city },
        { label: 'Industry',      value: lead.industry,       included: !!lead.industry },
        { label: 'Intent',        value: lead.intent,         included: !!lead.intent },
        { label: 'AI Score',      value: lead.aiScore,        included: true },
        { label: 'AI Visibility', value: `${lead.aiVisibility || 0}%`, included: true },
        { label: 'Comp. Gap',     value: lead.compGap,        included: !!lead.compGap },
        { label: 'Stage',         value: lead.stage,          included: !!lead.stage },
        { label: 'Reviews',       value: lead.reviews,        included: !!lead.reviews },
        { label: 'Rating',        value: lead.rating,         included: !!lead.rating },
        { label: 'Keyword',       value: lead.keyword,        included: !!lead.keyword },
        { label: 'GMB URL',       value: lead.gmbUrl,         included: !!lead.gmbUrl },
        { label: 'Salesloft URL', value: lead.salesloftUrl,   included: !!lead.salesloftUrl },
      ],
    },
    {
      title: 'AE Notes & Context',
      icon: '📝',
      fields: [
        { label: 'Research Notes', value: lead.aeNotes ? `${lead.aeNotes.slice(0, 60)}…` : null, included: !!lead.aeNotes },
      ],
      excluded: [
        { label: 'Generated AE Notes', reason: 'Excluded by design — generated output never feeds prompt context' },
      ],
    },
    {
      title: 'AI Intelligence',
      icon: '🧠',
      fields: [
        { label: 'Pain Points',    value: intel.painPoints?.join(', '),    included: !!intel.painPoints?.length },
        { label: 'Objections',     value: intel.objections?.join(', '),    included: !!intel.objections?.length },
        { label: 'Buying Signals', value: intel.buyingSignals?.join(', '), included: !!intel.buyingSignals?.length },
        { label: 'Next Best Action', value: intel.nextBestAction,          included: !!intel.nextBestAction },
      ],
    },
    {
      title: 'Account Knowledge',
      icon: '🏷',
      note: 'Only confirmed facts with no active conflict are included.',
      fields: [
        {
          label: 'Competitors',
          value: (ak?.competitors || []).filter(c => isConfirmed(c) && !c.conflictWith).map(c => c.name).join(', '),
          included: (ak?.competitors || []).filter(c => isConfirmed(c) && !c.conflictWith).length > 0,
        },
        {
          label: 'Decision Makers',
          value: (ak?.decisionMakers || []).filter(c => isConfirmed(c) && !c.conflictWith).map(d => d.name).join(', '),
          included: (ak?.decisionMakers || []).filter(c => isConfirmed(c) && !c.conflictWith).length > 0,
        },
        {
          label: 'Current Tools',
          value: (ak?.currentTools || []).filter(c => isConfirmed(c) && !c.conflictWith).map(t => t.name).join(', '),
          included: (ak?.currentTools || []).filter(c => isConfirmed(c) && !c.conflictWith).length > 0,
        },
        {
          label: 'Budget',
          value: ak?.budget ? ak.budget.status : null,
          included: !!(ak?.budget && isConfirmed(ak.budget) && !ak.budget.conflictWith),
        },
        {
          label: 'Purchase Timeline',
          value: ak?.purchaseTimeline ? ak.purchaseTimeline.urgency : null,
          included: !!(ak?.purchaseTimeline && isConfirmed(ak.purchaseTimeline) && !ak.purchaseTimeline.conflictWith),
        },
      ],
      excluded: [
        { label: 'Pending AK facts', reason: 'Not yet confirmed by SDR — excluded from prompts' },
        { label: 'Dismissed AK facts', reason: 'Rejected by SDR — permanently excluded' },
        { label: 'Conflicted AK facts', reason: 'Active conflict — excluded until resolved' },
      ],
    },
    {
      title: 'Previous Touches',
      icon: '📅',
      fields: [
        {
          label: 'Touch history',
          value: `${(lead.activities || []).length + (lead.touchLog || []).length} entries`,
          included: (lead.activities || []).length + (lead.touchLog || []).length > 0,
        },
      ],
      note: 'Deduplicated merge of activities[] and touchLog[]. Only outreach types included (Email, SMS, Call, LinkedIn, VM, Meeting, Note).',
    },
  ];

  const handleCopy = () => {
    navigator.clipboard.writeText(fullContext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Eye size={14} color="#60A5FA" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', marginBottom: 3 }}>Prompt Context Viewer</div>
          <div style={{ fontSize: 11, color: T2, lineHeight: 1.6 }}>
            This is exactly what the AI receives when you generate content for this lead.
            <strong style={{ color: T1 }}> ✓ Included</strong> fields enter the prompt.
            <strong style={{ color: '#F87171' }}> ✗ Excluded</strong> fields are omitted — either empty, pending review, or excluded by design.
          </div>
        </div>
      </div>

      {/* Section breakdown */}
      {SECTIONS.map(section => (
        <div key={section.title} style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, overflow: 'hidden' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${B1}`, background: 'var(--s2)' }}>
            <span style={{ fontSize: 14 }}>{section.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T1 }}>{section.title}</span>
            {section.note && <span style={{ fontSize: 10, color: T2, marginLeft: 4 }}>— {section.note}</span>}
          </div>

          {/* Fields */}
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {section.fields.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: f.included ? '#34D399' : '#F87171', flexShrink: 0, width: 12 }}>
                  {f.included ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T1, minWidth: 120, flexShrink: 0 }}>{f.label}</span>
                {f.included && f.value != null && (
                  <span style={{ fontSize: 11, color: T2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{String(f.value)}</span>
                )}
                {!f.included && (
                  <span style={{ fontSize: 10, color: '#8B949E', fontStyle: 'italic' }}>empty — not sent to AI</span>
                )}
              </div>
            ))}

            {/* Explicit exclusions */}
            {section.excluded?.map((ex, i) => (
              <div key={`ex-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#F87171', flexShrink: 0, width: 12 }}>✗</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#F87171', minWidth: 120, flexShrink: 0 }}>{ex.label}</span>
                <span style={{ fontSize: 10, color: '#8B949E', fontStyle: 'italic' }}>{ex.reason}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Full prompt expandable */}
      <div style={{ background: 'var(--bg)', border: `1px solid ${B1}`, borderRadius: 11, overflow: 'hidden' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: 'none', background: 'var(--s2)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {expanded ? <ChevronDown size={13} color={T2} /> : <ChevronRight size={13} color={T2} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: T1 }}>Full Prompt Text</span>
          <span style={{ fontSize: 10, color: T2 }}>— the complete string sent to the AI</span>
          <button
            onClick={e => { e.stopPropagation(); handleCopy(); }}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, border: `1px solid ${B1}`, background: copied ? 'rgba(16,185,129,0.1)' : 'transparent', color: copied ? '#10B981' : '#7C5CE8', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
          </button>
        </button>
        {expanded && (
          <div style={{ padding: '12px 14px' }}>
            <pre style={{ fontSize: 10, color: T2, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', margin: 0, maxHeight: 400, overflow: 'auto' }}>
              {fullContext}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
