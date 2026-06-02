/**
 * AccountKnowledgeTab — Phase 7C-2D / 7D-C
 *
 * Sections (top to bottom):
 *   Conflicts     — confirmed facts contested by new extractions (Phase 7D-C)
 *   Pending Review — AI-extracted facts awaiting SDR confirmation
 *   Confirmed Facts — Trusted account facts, read-only with provenance
 *
 * Actions available:
 *   confirmAccountKnowledgeFact, dismissAccountKnowledgeFact,
 *   bulkConfirmAccountKnowledge,
 *   resolveConflict, keepExistingFact, supersedeFact
 */

import { useState } from 'react';
import { CheckCircle2, X, AlertCircle, ShieldCheck, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { isConfirmed, hasConflict } from '../data/schema';
import { getAgeBand, AGE_BAND_CONFIG, formatAgeLabel } from '../utils/accountKnowledgeUtils';

// ── Field metadata ─────────────────────────────────────────────────────────────
const FIELD_META = {
  competitors:         { label: 'Competitors',        singular: 'Competitor',     color: '#F59E0B', identityProp: 'name'      },
  decisionMakers:      { label: 'Decision Makers',    singular: 'Decision Maker', color: '#7C5CE8', identityProp: 'name'      },
  budget:              { label: 'Budget',              singular: 'Budget',         color: '#3B82F6', identityProp: null        },
  purchaseTimeline:    { label: 'Purchase Timeline',   singular: 'Timeline',       color: '#38BDF8', identityProp: null        },
  currentTools:        { label: 'Current Tools',       singular: 'Tool',           color: '#10B981', identityProp: 'name'      },
  businessGoals:       { label: 'Business Goals',      singular: 'Goal',           color: '#34D399', identityProp: 'goal'      },
  recurringObjections: { label: 'Recurring Objections',singular: 'Objection',      color: '#F87171', identityProp: 'objection' },
};

// Display order for confirmed facts section
const FIELD_ORDER = [
  'competitors', 'decisionMakers', 'budget', 'purchaseTimeline',
  'currentTools', 'businessGoals', 'recurringObjections',
];

// ── Source badge ───────────────────────────────────────────────────────────────
const SOURCE_META = {
  transcript: { icon: '🎙', label: 'Transcript', color: '#3B82F6' },
  call_note:  { icon: '📝', label: 'Call Note',  color: '#10B981' },
  sdr_manual: { icon: '✏',  label: 'Manual',     color: '#7C5CE8' },
  migrated:   { icon: '📁', label: 'Migrated',   color: '#8B949E' },
};

// ── Date helper ────────────────────────────────────────────────────────────────
function formatRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const diffMs   = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays < 7)   return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Collect pending items as a flat list ──────────────────────────────────────
// Returns items in a stable display order: array fields first, scalars last.
function collectPendingItems(ak) {
  if (!ak) return [];
  const items = [];
  const arrayFields = ['competitors', 'decisionMakers', 'currentTools', 'businessGoals', 'recurringObjections'];
  for (const field of arrayFields) {
    for (const item of (ak[field] || [])) {
      if (item.reviewStatus === 'pending') {
        const meta = FIELD_META[field];
        items.push({ field, identityKey: item[meta.identityProp] || null, item });
      }
    }
  }
  if (ak.budget?.reviewStatus === 'pending') {
    items.push({ field: 'budget', identityKey: null, item: ak.budget });
  }
  if (ak.purchaseTimeline?.reviewStatus === 'pending') {
    items.push({ field: 'purchaseTimeline', identityKey: null, item: ak.purchaseTimeline });
  }
  return items;
}

// ── Collect conflict items as a flat list (Phase 7D-C) ───────────────────────
// businessGoals and recurringObjections never carry conflictWith
// (hasMeaningfulDifference returns false for them), so they are excluded.
// Array field order: competitors, decisionMakers, currentTools; scalars last.
function collectConflictItems(ak) {
  if (!ak) return [];
  const items = [];
  for (const field of ['competitors', 'decisionMakers', 'currentTools']) {
    for (const item of (ak[field] || [])) {
      if (hasConflict(item)) {
        items.push({ field, identityKey: item[FIELD_META[field].identityProp], item });
      }
    }
  }
  if (hasConflict(ak.budget))           items.push({ field: 'budget',           identityKey: null, item: ak.budget });
  if (hasConflict(ak.purchaseTimeline)) items.push({ field: 'purchaseTimeline',  identityKey: null, item: ak.purchaseTimeline });
  return items;
}

// ── Render the conflictWith values for a given field (Phase 7D-C) ──────────────
// Returns { primary, secondary } display strings for the extraction side.
// Intentionally separate from getPrimaryValue/getSecondaryValue which render
// the confirmed entry. Both answer different questions.
function getConflictDisplayValues(field, cw) {
  if (!cw) return { primary: '—', secondary: null };
  const norm = v => (v && v !== 'unknown') ? v : null;
  switch (field) {
    case 'competitors':
      return {
        primary:   norm(cw.strength) || '—',
        secondary: cw.context || null,
      };
    case 'decisionMakers':
      return {
        primary:   cw.role || '—',
        secondary: norm(cw.authority),
      };
    case 'currentTools':
      return { primary: cw.category || '—', secondary: null };
    case 'budget':
      return {
        primary:   [norm(cw.status), cw.amount || null].filter(Boolean).join(' — ') || '—',
        secondary: cw.notes || null,
      };
    case 'purchaseTimeline':
      return {
        primary:   [norm(cw.urgency), cw.targetDate || null].filter(Boolean).join(' — ') || '—',
        secondary: cw.notes || null,
      };
    default: return { primary: '—', secondary: null };
  }
}

// ── Build the newItem for supersedeFact from the conflictWith values ──────────
// Supersede is only offered for decisionMakers and currentTools (Modification 1).
function buildNewItemFromConflict(field, item) {
  const cw   = item.conflictWith;
  const meta = FIELD_META[field];
  if (!cw || !meta.identityProp) return null;
  const base = { [meta.identityProp]: item[meta.identityProp] };
  ['strength','context','role','authority','notes','category'].forEach(f => {
    if (cw[f] !== undefined) base[f] = cw[f];
  });
  base.source     = cw.source     || 'transcript';
  base.sourceDate = cw.sourceDate || new Date().toISOString();
  return base;
}

// ── Conflict age label (Modification 3) ───────────────────────────────────────
// Returns "Open Xd" or "Open Today" based on conflictWith.sourceDate.
function conflictAgeLabel(sourceDate) {
  if (!sourceDate) return null;
  const d = new Date(sourceDate);
  if (isNaN(d)) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return '⚡ Open today';
  return `⚡ Open ${days}d`;
}

// ── Count all pending items ────────────────────────────────────────────────────
export function countPendingAK(ak) {
  if (!ak) return 0;
  let n = 0;
  ['competitors', 'decisionMakers', 'currentTools', 'businessGoals', 'recurringObjections']
    .forEach(f => { n += (ak[f] || []).filter(i => i.reviewStatus === 'pending').length; });
  if (ak.budget?.reviewStatus          === 'pending') n++;
  if (ak.purchaseTimeline?.reviewStatus === 'pending') n++;
  return n;
}

// ── Count all items with unresolved conflicts (Phase 7D-A) ───────────────────
// Counts confirmed items that have conflictWith set across all fields.
// Used by AccountKnowledgeTab badge and PrepareCallDrawer conflict indicator.
export function countConflicts(ak) {
  if (!ak) return 0;
  let n = 0;
  ['competitors', 'decisionMakers', 'currentTools', 'businessGoals', 'recurringObjections']
    .forEach(f => { n += (ak[f] || []).filter(hasConflict).length; });
  if (hasConflict(ak.budget))           n++;
  if (hasConflict(ak.purchaseTimeline)) n++;
  return n;
}

// ── Primary value string for display ──────────────────────────────────────────
function getPrimaryValue(field, item) {
  if (!item) return '—';
  switch (field) {
    case 'competitors':         return item.name        || '—';
    case 'decisionMakers':      return item.name        || '—';
    case 'currentTools':        return item.name        || '—';
    case 'businessGoals':       return item.goal        || '—';
    case 'recurringObjections': return item.objection   || '—';
    case 'budget':
      return [item.status && item.status !== 'unknown' ? item.status : null, item.amount || null]
        .filter(Boolean).join(' — ') || item.notes || 'Budget noted';
    case 'purchaseTimeline':
      return [item.urgency && item.urgency !== 'unknown' ? item.urgency : null, item.targetDate || null]
        .filter(Boolean).join(' — ') || item.notes || 'Timeline noted';
    default: return '—';
  }
}

// ── Secondary value string (subtitle) ─────────────────────────────────────────
function getSecondaryValue(field, item) {
  if (!item) return null;
  switch (field) {
    case 'competitors':
      return [item.strength && item.strength !== 'unknown' ? item.strength : null, item.context || null]
        .filter(Boolean).join(' · ') || null;
    case 'decisionMakers':
      return [item.role || null, item.authority && item.authority !== 'unknown' ? item.authority : null]
        .filter(Boolean).join(' · ') || null;
    case 'currentTools':   return item.category || null;
    case 'budget':         return item.notes || null;
    case 'purchaseTimeline': return item.notes || null;
    case 'recurringObjections':
      return [`${item.occurrences || 1}×`, item.resolved ? 'resolved' : 'open'].join(', ');
    default: return null;
  }
}

// ── SourceBadge ────────────────────────────────────────────────────────────────
function SourceBadge({ source, date }) {
  const meta = SOURCE_META[source] || SOURCE_META['migrated'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
      background: `${meta.color}18`, color: meta.color,
    }}>
      {meta.icon} {meta.label}{date ? ` · ${date}` : ''}
    </span>
  );
}

// ── PendingCard ────────────────────────────────────────────────────────────────
function PendingCard({ field, identityKey, item, lead }) {
  const { confirmAccountKnowledgeFact, dismissAccountKnowledgeFact } = useApp();
  const meta      = FIELD_META[field];
  const primary   = getPrimaryValue(field, item);
  const secondary = getSecondaryValue(field, item);
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 9,
      border: `1px solid rgba(245,158,11,0.25)`,
      background: 'rgba(245,158,11,0.04)',
    }}>
      {/* Category pill */}
      <span style={{
        flexShrink: 0, marginTop: 2, fontSize: 9, fontWeight: 700,
        padding: '2px 7px', borderRadius: 99,
        background: `${meta.color}18`, color: meta.color,
      }}>
        {meta.singular}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T1, marginBottom: secondary ? 2 : 0 }}>
          {primary}
        </div>
        {secondary && (
          <div style={{ fontSize: 11, color: T2, marginBottom: 4 }}>{secondary}</div>
        )}
        <SourceBadge source={item.source} date={formatRelativeDate(item.sourceDate)} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0, marginTop: 1 }}>
        <button
          onClick={() => confirmAccountKnowledgeFact(lead.id, field, identityKey)}
          title="Confirm"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(16,185,129,0.35)',
            background: 'rgba(16,185,129,0.08)', color: '#10B981',
            fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; }}
        >
          <CheckCircle2 size={11} /> Confirm
        </button>
        <button
          onClick={() => dismissAccountKnowledgeFact(lead.id, field, identityKey)}
          title="Dismiss"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.06)', color: '#F87171',
            fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; }}
        >
          <X size={11} /> Dismiss
        </button>
      </div>
    </div>
  );
}

// ── ConflictCard — one conflict resolution card (Phase 7D-C) ─────────────────
// Shows current confirmed value vs. AI-extracted value side-by-side.
// Keep Existing: keepExistingFact
// Accept Extracted: resolveConflict(..., 'accept')
// Supersede →: supersedeFact (decisionMakers and currentTools only — Mod 1)
function ConflictCard({ field, identityKey, item, lead }) {
  const { keepExistingFact, resolveConflict, supersedeFact } = useApp();
  const meta           = FIELD_META[field];
  const confirmedPrimary   = getPrimaryValue(field, item);
  const confirmedSecondary = getSecondaryValue(field, item);
  const { primary: cwPrimary, secondary: cwSecondary } = getConflictDisplayValues(field, item.conflictWith);
  const ageLabel = conflictAgeLabel(item.conflictWith?.sourceDate);
  // Supersede only offered for decisionMakers and currentTools (Modification 1)
  const showSupersede = field === 'decisionMakers' || field === 'currentTools';
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  const handleSupersede = () => {
    const newItem = buildNewItemFromConflict(field, item);
    if (newItem) supersedeFact(lead.id, field, identityKey, newItem);
  };

  return (
    <div style={{
      borderRadius: 9, border: '1px solid rgba(239,68,68,0.28)',
      background: 'rgba(239,68,68,0.03)', overflow: 'hidden',
    }}>
      {/* Card header — field pill + conflict age */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', borderBottom: '1px solid rgba(239,68,68,0.15)',
        background: 'rgba(239,68,68,0.06)',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
          background: `${meta.color}18`, color: meta.color,
        }}>
          {meta.singular}
        </span>
        {ageLabel && (
          <span style={{ fontSize: 9, fontWeight: 600, color: '#F87171' }}>{ageLabel}</span>
        )}
      </div>

      {/* Two-column comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* Current confirmed */}
        <div style={{ padding: '10px 12px', borderRight: '1px solid rgba(239,68,68,0.15)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Current (confirmed)
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T1, marginBottom: confirmedSecondary ? 2 : 0 }}>
            {confirmedPrimary}
          </div>
          {confirmedSecondary && <div style={{ fontSize: 11, color: T2 }}>{confirmedSecondary}</div>}
          <div style={{ marginTop: 5 }}>
            <SourceBadge source={item.source} date={formatRelativeDate(item.sourceDate)} />
          </div>
        </div>

        {/* Extracted */}
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Extracted
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T1, marginBottom: cwSecondary ? 2 : 0 }}>
            {cwPrimary}
          </div>
          {cwSecondary && <div style={{ fontSize: 11, color: T2 }}>{cwSecondary}</div>}
          <div style={{ marginTop: 5 }}>
            <SourceBadge
              source={item.conflictWith?.source || 'transcript'}
              date={formatRelativeDate(item.conflictWith?.sourceDate)}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 12px',
        borderTop: '1px solid rgba(239,68,68,0.12)',
        background: 'rgba(0,0,0,0.08)',
      }}>
        <button
          onClick={() => keepExistingFact(lead.id, field, identityKey)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '5px 0', borderRadius: 7,
            border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)',
            color: '#10B981', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.07)'; }}
        >
          <CheckCircle2 size={10} /> Keep Existing
        </button>
        <button
          onClick={() => resolveConflict(lead.id, field, identityKey, 'accept')}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '5px 0', borderRadius: 7,
            border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.07)',
            color: '#60A5FA', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.07)'; }}
        >
          <CheckCircle2 size={10} /> Accept Extracted
        </button>
        {showSupersede && (
          <button
            onClick={handleSupersede}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '5px 0', borderRadius: 7,
              border: '1px solid rgba(124,92,232,0.3)', background: 'rgba(124,92,232,0.07)',
              color: '#7C5CE8', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,92,232,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,92,232,0.07)'; }}
          >
            <Zap size={10} /> Supersede →
          </button>
        )}
      </div>
    </div>
  );
}

// ── AKItem — one confirmed fact row ────────────────────────────────────────────
// Phase 7D-D: age band dot + freshness label + Re-Verify button (old facts only).
// Modification 2: Re-Verify shown only when band === 'old'.
// Modification 4: explicit "Last verified X" language via formatAgeLabel().
// identityKey is derived internally from item + field (no new prop).
function AKItem({ field, item, leadId }) {
  const { reverifyAccountKnowledgeFact } = useApp();
  const meta       = FIELD_META[field];
  const primary    = getPrimaryValue(field, item);
  const secondary  = getSecondaryValue(field, item);
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  // Derive identity key from item — keeps AKCategory call site clean
  const identityKey = meta.identityProp ? item[meta.identityProp] : null;

  // Age band (display-only, computed at render time, never stored)
  const band       = getAgeBand(item);
  const bandConfig = AGE_BAND_CONFIG[band];
  const ageLabel   = formatAgeLabel(item);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 10px', borderRadius: 8,
      border: `1px solid ${B1}`, background: 'var(--bg)',
      // Dim old items slightly to draw attention to their staleness
      opacity: band === 'old' ? 0.82 : 1,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: meta.color, flexShrink: 0, marginTop: 5,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T1 }}>{primary}</div>
        {secondary && (
          <div style={{ fontSize: 11, color: T2, marginTop: 1 }}>{secondary}</div>
        )}

        {/* Provenance + age row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {/* Age band dot — only shown for aging and old (recent needs no indicator) */}
          {band !== 'recent' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600,
              color: bandConfig.color,
            }}>
              <span style={{
                display: 'inline-block', width: 5, height: 5,
                borderRadius: '50%', background: bandConfig.color,
              }} />
              {/* Modification 4: explicit freshness language */}
              {ageLabel}
            </span>
          )}

          <SourceBadge
            source={item.source}
            date={item.reviewedAt ? `Confirmed ${formatRelativeDate(item.reviewedAt)}` : formatRelativeDate(item.sourceDate)}
          />

          {/* Re-Verify button — Modification 2: shown only for old facts */}
          {bandConfig.showAction && (
            <button
              onClick={() => reverifyAccountKnowledgeFact(leadId, field, identityKey)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                border: `1px solid ${bandConfig.color}40`,
                background: `${bandConfig.color}10`,
                color: bandConfig.color,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = `${bandConfig.color}22`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${bandConfig.color}10`; }}
              title="Mark as still current — updates last verified date"
            >
              ↻ Re-Verify
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AKCategory — one confirmed category section ────────────────────────────────
function AKCategory({ field, ak, leadId }) {
  const meta  = FIELD_META[field];
  const T2    = 'var(--t2)';
  const isArray  = meta.identityProp !== null;

  // Collect confirmed items for this field
  let confirmedItems = [];
  if (isArray) {
    confirmedItems = (ak?.[field] || []).filter(isConfirmed);
  } else {
    const scalar = ak?.[field];
    if (scalar && isConfirmed(scalar)) confirmedItems = [scalar];
  }

  if (confirmedItems.length === 0) return null;

  return (
    <div>
      {/* Category header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 10, color: T2, opacity: 0.6 }}>({confirmedItems.length})</span>
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {confirmedItems.map((item, i) => (
          <AKItem key={i} field={field} item={item} leadId={leadId} />
        ))}
      </div>
    </div>
  );
}

// ── AccountKnowledgeTab ────────────────────────────────────────────────────────
export default function AccountKnowledgeTab({ lead }) {
  const { bulkConfirmAccountKnowledge, resolveConflict, keepExistingFact, supersedeFact } = useApp();
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const ak            = lead.accountKnowledge;
  const pendingItems  = collectPendingItems(ak);
  const conflictItems = collectConflictItems(ak);
  const pendingCount  = pendingItems.length;
  const conflictCount = conflictItems.length;
  // Modification 2: collapse when > 5 conflicts; show first 5 with expand button
  const CONFLICT_COLLAPSE_THRESHOLD = 5;
  const visibleConflicts = conflictCount > CONFLICT_COLLAPSE_THRESHOLD && !conflictsExpanded
    ? conflictItems.slice(0, CONFLICT_COLLAPSE_THRESHOLD)
    : conflictItems;
  const T1 = 'var(--t1)', T2 = 'var(--t2)', B1 = 'var(--b1)';

  // Check if any confirmed facts exist across all fields
  const hasConfirmedFacts = FIELD_ORDER.some(field => {
    const meta = FIELD_META[field];
    if (meta.identityProp !== null) {
      return (ak?.[field] || []).some(isConfirmed);
    }
    return ak?.[field] && isConfirmed(ak[field]);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Conflict section (Phase 7D-C) ───────────────────────────────────── */}
      {conflictCount > 0 && (
        <div style={{
          borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.02)', overflow: 'hidden',
        }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(239,68,68,0.18)',
            background: 'rgba(239,68,68,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Zap size={13} color="#F87171" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F87171' }}>
                {conflictCount} conflict{conflictCount !== 1 ? 's' : ''} need{conflictCount === 1 ? 's' : ''} resolution
              </span>
              <span style={{ fontSize: 10, color: T2 }}>— fact{conflictCount !== 1 ? 's' : ''} excluded from AI context</span>
            </div>
          </div>

          {/* Conflict cards */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleConflicts.map((c, i) => (
              <ConflictCard
                key={`${c.field}-${c.identityKey ?? 'scalar'}-${i}`}
                field={c.field}
                identityKey={c.identityKey}
                item={c.item}
                lead={lead}
              />
            ))}

            {/* Expand/collapse button — only shown when > 5 conflicts */}
            {conflictCount > CONFLICT_COLLAPSE_THRESHOLD && (
              <button
                onClick={() => setConflictsExpanded(e => !e)}
                style={{
                  alignSelf: 'flex-start', fontSize: 11, fontWeight: 600,
                  color: '#F87171', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
                }}
              >
                {conflictsExpanded
                  ? `▲ Show fewer`
                  : `▼ Show ${conflictCount - CONFLICT_COLLAPSE_THRESHOLD} more conflict${conflictCount - CONFLICT_COLLAPSE_THRESHOLD !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Pending Review section ──────────────────────────────────────────── */}
      {pendingCount > 0 && (
        <div style={{
          borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)',
          background: 'rgba(245,158,11,0.03)', overflow: 'hidden',
        }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid rgba(245,158,11,0.2)',
            background: 'rgba(245,158,11,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <AlertCircle size={13} color="#F59E0B" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>
                {pendingCount} fact{pendingCount !== 1 ? 's' : ''} pending review
              </span>
              <span style={{ fontSize: 10, color: T2 }}>
                — not yet in AI prompt context
              </span>
            </div>
            <button
              onClick={() => bulkConfirmAccountKnowledge(lead.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 7, border: 'none',
                background: '#F59E0B', color: '#fff',
                fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#D97706'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F59E0B'; }}
            >
              <CheckCircle2 size={11} /> Confirm All
            </button>
          </div>

          {/* Pending cards */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingItems.map((p, i) => (
              <PendingCard
                key={`${p.field}-${p.identityKey ?? 'scalar'}-${i}`}
                field={p.field}
                identityKey={p.identityKey}
                item={p.item}
                lead={lead}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Confirmed Facts section ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg)', border: `1px solid ${B1}`,
        borderRadius: 12, padding: '16px',
      }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
          <ShieldCheck size={13} color="#10B981" />
          <span style={{ fontSize: 11, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Confirmed Account Knowledge
          </span>
        </div>

        {!hasConfirmedFacts ? (
          /* Empty state */
          <div style={{ textAlign: 'center', padding: '32px 16px', color: T2 }}>
            <ShieldCheck size={24} color="var(--b2)" style={{ marginBottom: 10, opacity: 0.4 }} />
            <div style={{ fontSize: 12, color: T2, marginBottom: 4 }}>No confirmed account knowledge yet.</div>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>
              {pendingCount > 0
                ? 'Review the pending facts above to start building your account knowledge.'
                : 'Facts are extracted from call notes and transcripts.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FIELD_ORDER.map(field => (
              <AKCategory key={field} field={field} ak={ak} leadId={lead.id} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
