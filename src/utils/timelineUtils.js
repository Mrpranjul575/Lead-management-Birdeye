/**
 * timelineUtils — Phase 10D
 *
 * Pure event-normalization layer for the Unified Lead Timeline.
 *
 * CONTRACT
 * ────────
 * normalizeEvent(activity) → TimelineEvent | null
 *
 *   Accepts a single raw activity from lead.activities[].
 *   Returns a fully-decorated TimelineEvent ready for rendering.
 *   Returns null for activity types that should be silently excluded
 *   from the timeline (e.g. raw import system entries).
 *
 * TimelineEvent shape:
 * ────────────────────
 *   activityId  : unique id from the source activity
 *   timestamp   : ISO string — used for sorting and display
 *   category    : 'engagement' | 'knowledge' | 'intelligence' | 'cadence' | 'system'
 *   filterKey   : the id used by TIMELINE_FILTERS for tab-based filtering
 *   icon        : emoji string — single source of truth for all timeline icons
 *   iconBg      : CSS background for the icon circle
 *   iconColor   : CSS color for icon border / accent
 *   title       : primary display string (bold)
 *   subtitle    : secondary display string (optional, muted)
 *   badge       : { label, color, bg } | null — source attribution pill
 *   evidence    : string | null — extraction context for AK provenance
 *   meta        : [{ label, value }] — structured metadata rows (optional)
 *   isAI        : boolean — drives the AI pill decoration on the card
 *   outcome     : string | null — passed through from source activity
 *
 * Design rules:
 * ─────────────
 *   - Pure function: no React, no context, no side effects, never throws
 *   - Single authoritative icon/color/category mapping — never duplicated in UI
 *   - Graceful degradation: unknown/missing fields fall back to defaults
 *   - AI category (Gemini, Copilot) is always flagged with isAI: true
 *   - Knowledge events surface evidence (item.context) for provenance display
 *   - Status change events show previousStage → newStage transition
 *
 * Consumers:
 * ──────────
 *   UnifiedTimeline (LeadPage.jsx) — the only consumer. Do not import elsewhere.
 *
 * Not responsible for:
 * ─────────────────────
 *   - Sorting (caller responsibility)
 *   - Grouping by date (caller responsibility)
 *   - Filtering (caller reads filterKey)
 *   - Rendering (LeadPage.jsx responsibility)
 */

// ── Timeline filter definitions ───────────────────────────────────────────────
// Exported so UnifiedTimeline and any future consumer share the same list.
export const TIMELINE_FILTERS = [
  { id: 'all',         label: 'All'          },
  { id: 'engagement',  label: 'Activities'   },
  { id: 'knowledge',   label: 'Knowledge'    },
  { id: 'intelligence',label: 'Intelligence' },
  { id: 'cadence',     label: 'Cadence'      },
  { id: 'calls',       label: 'Calls'        },
  { id: 'notes',       label: 'Notes'        },
];

// ── Category → icon/color config ─────────────────────────────────────────────
// Centralised here — never duplicated in the rendering layer.
const CATEGORY_CONFIG = {
  engagement:   { iconBg: 'rgba(16,185,129,0.12)',  iconColor: '#10B981' },
  knowledge:    { iconBg: 'rgba(245,158,11,0.12)',  iconColor: '#F59E0B' },
  intelligence: { iconBg: 'rgba(59,130,246,0.12)',  iconColor: '#60A5FA' },
  cadence:      { iconBg: 'rgba(91,63,200,0.12)',   iconColor: '#7C5CE8' },
  system:       { iconBg: 'rgba(139,148,158,0.12)', iconColor: '#8B949E' },
};

// ── Source badge config ───────────────────────────────────────────────────────
const SOURCE_BADGE = {
  gemini:       { label: '✨ Gemini',    color: '#60A5FA', bg: 'rgba(59,130,246,0.1)'  },
  'copilot-notes': { label: '🤖 AI Notes', color: '#7C5CE8', bg: 'rgba(124,92,232,0.1)' },
  cadence:      { label: '🔀 Cadence',  color: '#7C5CE8', bg: 'rgba(91,63,200,0.1)'   },
  transcript:   { label: '🎙 Transcript',color: '#3B82F6', bg: 'rgba(59,130,246,0.1)'  },
  manual:       { label: '✏ Manual',   color: '#8B949E', bg: 'rgba(139,148,158,0.1)'  },
  system:       { label: '⚙ System',   color: '#8B949E', bg: 'rgba(139,148,158,0.1)'  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function badge(source) {
  return SOURCE_BADGE[source] || null;
}

function catConfig(category) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.system;
}

// ── normalizeEvent ─────────────────────────────────────────────────────────────
/**
 * Maps a single raw activity to a TimelineEvent.
 * Returns null to silently exclude the activity from the timeline.
 *
 * @param {object} activity - A single entry from lead.activities[]
 * @returns {TimelineEvent|null}
 */
export function normalizeEvent(activity) {
  if (!activity || !activity.timestamp) return null;

  const d       = activity.details || {};
  const type    = activity.type    || '';
  const summary = activity.summary || '';
  const source  = activity.source  || d.source || 'manual';

  // ── Engagement events ────────────────────────────────────────────────────
  if (type === 'Call') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'calls',
      icon:       '📞',
      ...cc,
      title:      'Call Logged',
      subtitle:   d.content || null,
      badge:      null,
      evidence:   null,
      meta:       d.outcome ? [{ label: 'Outcome', value: d.outcome }] : [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'Email') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '📧',
      ...cc,
      title:      d.subject ? `Email: ${d.subject}` : 'Email Sent',
      subtitle:   d.content ? d.content.slice(0, 120) + (d.content.length > 120 ? '…' : '') : null,
      badge:      null,
      evidence:   null,
      meta:       activity.outcome ? [{ label: 'Status', value: activity.outcome }] : [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'SMS') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '💬',
      ...cc,
      title:      'SMS Sent',
      subtitle:   d.content ? d.content.slice(0, 100) + (d.content.length > 100 ? '…' : '') : null,
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'LinkedIn') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '💼',
      ...cc,
      title:      'LinkedIn Message',
      subtitle:   d.content ? d.content.slice(0, 100) + (d.content.length > 100 ? '…' : '') : null,
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'Voicemail') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '🎙',
      ...cc,
      title:      'Voicemail Left',
      subtitle:   d.content ? d.content.slice(0, 100) + (d.content.length > 100 ? '…' : '') : null,
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'Meeting') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '📅',
      ...cc,
      title:      'Meeting',
      subtitle:   d.content || null,
      badge:      null,
      evidence:   null,
      meta:       d.outcome ? [{ label: 'Outcome', value: d.outcome }] : [],
      isAI:       false,
      outcome:    activity.outcome,
    };
  }

  if (type === 'Note') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'notes',
      icon:       '📝',
      ...cc,
      title:      'Note Added',
      subtitle:   d.content || summary || null,
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    null,
    };
  }

  if (type === 'Follow Up') {
    const cc = catConfig('engagement');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'engagement',
      filterKey:  'engagement',
      icon:       '🔔',
      ...cc,
      title:      'Follow-Up Scheduled',
      subtitle:   d.content || null,
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    null,
    };
  }

  // ── Knowledge events (Phase 10D) ─────────────────────────────────────────
  if (type === 'Knowledge Update') {
    const cc       = catConfig('knowledge');
    const action   = d.action   || '';   // 'detected' | 'approved' | 'rejected'
    const field    = d.field    || '';
    const itemName = d.itemName || d.identityKey || '';
    const ctx      = d.extractionContext || null;

    // Icon and title by action
    const actionMap = {
      detected: { icon: '🔍', title: `${_fieldLabel(field)} Detected`,  isAI: true  },
      approved: { icon: '✅', title: `${_fieldLabel(field)} Approved`,  isAI: false },
      rejected: { icon: '❌', title: `${_fieldLabel(field)} Rejected`,  isAI: false },
    };
    const mapped = actionMap[action] || { icon: '🏷', title: summary || 'Knowledge Updated', isAI: false };

    // Badge: AI-detected facts show source badge; SDR decisions show manual
    const eventBadge = action === 'detected'
      ? (badge(source) || badge('manual'))
      : (action === 'approved' || action === 'rejected')
        ? { label: '👤 SDR', color: '#8B949E', bg: 'rgba(139,148,158,0.1)' }
        : null;

    // Pending badge pill for detected items not yet reviewed
    const statusPill = action === 'detected'
      ? { label: 'Pending Review', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
      : null;

    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'knowledge',
      filterKey:  'knowledge',
      icon:       mapped.icon,
      ...cc,
      title:      mapped.title,
      subtitle:   itemName || null,
      badge:      eventBadge,
      statusPill,
      evidence:   ctx,
      meta:       [],
      isAI:       mapped.isAI,
      outcome:    null,
    };
  }

  // ── Intelligence events ──────────────────────────────────────────────────
  if (type === 'AI Generation') {
    const cc      = catConfig('intelligence');
    const isEnrich = source === 'gemini';

    // Determine what fields were written (if details carries them)
    const fields  = d.enrichedFields || null;
    const subtitle = fields
      ? fields.join(', ') + ' updated'
      : d.content || null;

    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'intelligence',
      filterKey:  'intelligence',
      icon:       isEnrich ? '✨' : '🤖',
      ...cc,
      title:      isEnrich ? 'AI Intelligence Enriched' : (summary || 'AI Content Generated'),
      subtitle,
      badge:      isEnrich ? badge('gemini') : badge('copilot-notes'),
      evidence:   null,
      meta:       [],
      isAI:       true,
      outcome:    null,
    };
  }

  if (type === 'Transcript') {
    const cc = catConfig('intelligence');
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'intelligence',
      filterKey:  'intelligence',
      icon:       '🎙',
      ...cc,
      title:      'Recording Processed',
      subtitle:   d.fileName || null,
      badge:      badge('transcript'),
      evidence:   null,
      meta:       [],
      isAI:       true,
      outcome:    null,
    };
  }

  // ── Cadence events ────────────────────────────────────────────────────────
  if (type === 'Cadence Update') {
    const cc       = catConfig('cadence');
    const stepLabel   = d.stepLabel   || null;
    const stepChannel = d.stepChannel || null;
    const cadenceDay  = d.cadenceDay  || null;

    // Distinguish sub-types by summary text pattern
    const isStarted   = summary.toLowerCase().includes('cadence started') || summary.toLowerCase().includes('started:');
    const isCompleted = summary.toLowerCase().includes('cadence complete');
    const isAdvanced  = summary.toLowerCase().includes('advanced to day');
    const isStep      = d.stepKey != null && !isCompleted;

    const icon  = isStarted   ? '🚀'
                : isCompleted ? '🏁'
                : isAdvanced  ? '⏭'
                : isStep      ? '▶'
                : '🔀';

    const title = isStarted   ? `Cadence Started`
                : isCompleted ? `Cadence Completed`
                : isAdvanced  ? `Advanced to Day ${cadenceDay}`
                : isStep      ? `Step: ${stepLabel || d.stepKey}`
                : summary || 'Cadence Update';

    const subtitle = isStarted
      ? (summary.replace(/cadence started[:\s]*/i, '').trim() || null)
      : stepChannel && cadenceDay
        ? `Day ${cadenceDay} · ${stepChannel}`
        : stepLabel || null;

    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'cadence',
      filterKey:  'cadence',
      icon,
      ...cc,
      title,
      subtitle,
      badge:      badge('cadence'),
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    null,
    };
  }

  // ── System events ─────────────────────────────────────────────────────────
  if (type === 'Status Change') {
    const cc  = catConfig('system');
    const prev = d.previousStage || null;
    const next = d.newStage      || d.stage || null;
    return {
      activityId: activity.activityId,
      timestamp:  activity.timestamp,
      category:   'system',
      filterKey:  'engagement',
      icon:       '📊',
      ...cc,
      title:      'Stage Changed',
      subtitle:   prev && next ? `${prev} → ${next}` : (summary || null),
      badge:      null,
      evidence:   null,
      meta:       [],
      isAI:       false,
      outcome:    null,
    };
  }

  if (type === 'Import') {
    // Silently exclude raw import events — they clutter the timeline
    // without providing actionable context for the SDR.
    return null;
  }

  // ── Unknown / legacy fallback ─────────────────────────────────────────────
  // Surface unknown types rather than silently dropping them, so future
  // activity types are visible from day one without a code change.
  if (!type) return null;
  const cc = catConfig('system');
  return {
    activityId: activity.activityId,
    timestamp:  activity.timestamp,
    category:   'system',
    filterKey:  'engagement',
    icon:       '⚙',
    ...cc,
    title:      summary || type,
    subtitle:   d.content || null,
    badge:      null,
    evidence:   null,
    meta:       [],
    isAI:       false,
    outcome:    activity.outcome || null,
  };
}

// ── _fieldLabel — human-readable label for AK field names ────────────────────
// Private helper used only by normalizeEvent for Knowledge Update titles.
function _fieldLabel(field) {
  const LABELS = {
    competitors:         'Competitor',
    decisionMakers:      'Decision Maker',
    currentTools:        'Tool',
    businessGoals:       'Business Goal',
    recurringObjections: 'Objection',
    budget:              'Budget',
    purchaseTimeline:    'Timeline',
  };
  return LABELS[field] || 'Fact';
}

// ── groupByDate ───────────────────────────────────────────────────────────────
/**
 * Groups an array of TimelineEvents by calendar date.
 * Returns an array of { dateLabel, events } in descending date order.
 *
 * @param {TimelineEvent[]} events - pre-sorted descending by timestamp
 * @returns {{ dateLabel: string, events: TimelineEvent[] }[]}
 */
export function groupByDate(events) {
  if (!events || events.length === 0) return [];
  const map = new Map();
  for (const ev of events) {
    const label = new Date(ev.timestamp).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    if (!map.has(label)) map.set(label, []);
    map.get(label).push(ev);
  }
  return Array.from(map.entries()).map(([dateLabel, evs]) => ({ dateLabel, events: evs }));
}

// ── relativeTime ─────────────────────────────────────────────────────────────
/**
 * Returns a compact relative time string for a given ISO timestamp.
 * e.g. "just now", "5m ago", "3h ago", "2d ago"
 *
 * @param {string} isoString
 * @returns {string}
 */
export function relativeTime(isoString) {
  if (!isoString) return '';
  const ms  = Date.now() - new Date(isoString).getTime();
  const min = Math.floor(ms / 60000);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0)  return `${day}d ago`;
  if (hr  > 0)  return `${hr}h ago`;
  if (min > 0)  return `${min}m ago`;
  return 'just now';
}
