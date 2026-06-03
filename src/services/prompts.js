/**
 * BIRDEYE SDR AI PROMPT ENGINE
 * Central source of truth for all prompt generation.
 * All prompts are hyper-personalised using:
 *   - lead.aeNotes (full context: competitor, keyword, GMB, Salesloft, rep gap, AI/SEO reports)
 *   - lead.intent
 *   - lead.stage
 *   - lead.touchLog + lead.activities[] (previous touches — never repeat)
 *   - lead.competitor
 *   - lead.keyword
 */

import { isConfirmed, isPromptEligible } from '../data/schema.js';

// ─── Prompt Builder override system ──────────────────────────────────────────
// Read priority: birdeye_prompt_library → birdeye_prompt_overrides → DEFAULT
// Called at the top of every buildXPrompt function before the default template.
function getPromptOverride(mode) {
  try {
    const lib = JSON.parse(localStorage.getItem('birdeye_prompt_library') || '{}');
    if (lib[mode]?.promptText) return lib[mode].promptText;
    const ov = JSON.parse(localStorage.getItem('birdeye_prompt_overrides') || '{}');
    if (ov[mode]?.promptText) return ov[mode].promptText;
  } catch {}
  return null;
}

function interpolatePrompt(template, lead) {
  if (!template || !lead) return template;
  return template
    .replace(/\{\{first_name\}\}/g,    lead.contact   || '')
    .replace(/\{\{biz_name\}\}/g,      lead.business  || '')
    .replace(/\{\{industry\}\}/g,      lead.industry  || '')
    .replace(/\{\{city\}\}/g,          lead.city      || '')
    .replace(/\{\{ai_score\}\}/g,      String(lead.aiScore   || ''))
    .replace(/\{\{reviews\}\}/g,       String(lead.reviews   || ''))
    .replace(/\{\{ai_visibility\}\}/g, String(lead.aiVisibility || ''))
    .replace(/\{\{competitor_1\}\}/g,  lead.competitor || lead.intelligence?.competitors?.[0] || '')
    .replace(/\{\{pain_point_1\}\}/g,  lead.intelligence?.painPoints?.[0]  || '')
    .replace(/\{\{last_touch\}\}/g,    lead.lastTouch  || '')
    .replace(/\{\{objection_1\}\}/g,   lead.intelligence?.objections?.[0]  || '');
}

// ─── Phase 7A Fix 3: Unified touch history builder ───────────────────────────
// Merges legacy touchLog (flat format) and modern activities[] (v4 format) into
// a single de-duplicated, chronologically sorted list for prompt context.
//
// touchLog shape : { id, channel, content, date ('5/27' string), type }
// activities shape: { activityId, timestamp (ISO), type, summary, details.content, source }
//
// Dedupe key: normalised type + date/timestamp prefix + content prefix (first 80 chars).
// This eliminates duplicates produced by addTouchEntry()'s dual-write behaviour
// without relying on internal IDs (which differ between the two arrays).
//
// Sort: descending by resolved timestamp so the most recent touch appears first.
// touchLog date strings ('5/27') are not reliably parseable as full ISO timestamps;
// they are treated as having epoch 0 for sort purposes, placing them after all
// activities[] entries that carry real ISO timestamps. This is intentional — the
// activities[] array is the authoritative modern record; legacy entries act as
// a fallback for leads that predate the v4 migration.
//
// Exported so Copilot.jsx can use the same count for its "X previous touches"
// display without reimplementing the merge logic independently.
export function buildTouchHistory(lead) {
  const DISPLAY_TYPES = new Set([
    'Email', 'SMS', 'Call', 'Voicemail', 'LinkedIn',
    'Meeting', 'Transcript', 'Note', 'Follow Up',
  ]);

  // ── Normalise touchLog entries ──
  const fromTouchLog = (lead.touchLog || []).map(t => ({
    type:      t.type || t.channel || 'Email',
    date:      t.date || '',
    content:   t.content || '',
    sortKey:   0, // legacy — no reliable full timestamp
    source:    'touchLog',
  }));

  // ── Normalise activities[] entries ──
  // Only include SDR-facing outreach/conversation types for prompt context.
  // Exclude system events (Cadence Update, Status Change, Import, AI Generation)
  // which add noise without helping the AI understand the relationship history.
  const fromActivities = (lead.activities || [])
    .filter(a => DISPLAY_TYPES.has(a.type))
    .map(a => ({
      type:    a.type,
      date:    a.timestamp || '',
      content: a.details?.content || a.summary || '',
      sortKey: a.timestamp ? new Date(a.timestamp).getTime() : 0,
      source:  'activities',
    }));

  // ── Merge and deduplicate ──
  // Dedupe key: lowercase type + first 8 chars of date + first 80 chars of content.
  // Coarse enough to catch dual-write duplicates, precise enough not to collapse
  // genuinely distinct touches of the same type sent on the same day.
  const seen = new Set();
  const merged = [...fromActivities, ...fromTouchLog].filter(entry => {
    const key = [
      entry.type.toLowerCase(),
      entry.date.slice(0, 8),
      entry.content.slice(0, 80).toLowerCase().replace(/\s+/g, ' ').trim(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Sort descending by resolved timestamp (most recent first) ──
  merged.sort((a, b) => b.sortKey - a.sortKey);

  return merged;
}

// ─── Shared context builder ──────────────────────────────────────────────────
export function buildLeadContext(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';

  // Phase 7A Fix 3: use merged touch history instead of touchLog-only
  const allTouches  = buildTouchHistory(lead);
  const prevTouches = allTouches.length
    ? allTouches.map((t, i) =>
        `  ${i + 1}. [${t.type}] ${t.date ? t.date.slice(0, 10) : ''}: ${t.content.slice(0, 120)}${t.content.length > 120 ? '…' : ''}`
      ).join('\n')
    : '  None — this is the FIRST touch. Make a strong first impression.';

  // Extract structured data from aeNotes
  const notes = lead.aeNotes || '';
  const competitorLine = lead.competitor
    ? `Competitor: ${lead.competitor}`
    : notes.match(/competitor[:\s]+([^\n]+)/i)?.[1]
      ? `Competitor: ${notes.match(/competitor[:\s]+([^\n]+)/i)[1]}`
      : null;

  const reviewsLine = lead.reviews
    ? `Their reviews: ${lead.reviews} (★${lead.rating || 'N/A'})`
    : null;

  const keywordLine = lead.keyword ? `Target keyword: ${lead.keyword}` : null;
  const gmbLine     = lead.gmbUrl  ? `GMB: ${lead.gmbUrl}` : null;
  const slLine      = lead.salesloftUrl ? `Salesloft: ${lead.salesloftUrl}` : null;
  const mqlLine     = lead.mqlDate ? `MQL Date: ${lead.mqlDate}` : null;

  const extraContext = [competitorLine, reviewsLine, keywordLine, gmbLine, slLine, mqlLine]
    .filter(Boolean).join('\n');

  // ── AI Intelligence — read from lead.intelligence, render only populated fields ──
  const intel = lead.intelligence || {};
  const intelLines = [
    intel.painPoints?.length
      ? `Pain Points: ${intel.painPoints.join(' | ')}`
      : null,
    intel.objections?.length
      ? `Known Objections: ${intel.objections.join(' | ')}`
      : null,
    intel.buyingSignals?.length
      ? `Buying Signals: ${intel.buyingSignals.join(' | ')}`
      : null,
    // Decision Makers removed from intelLines — Phase 7C-2C.
    // Deprecated intelligence.decisionMakers[] is empty for all Phase 7B+ leads.
    // Confirmed decision makers are injected via the ACCOUNT KNOWLEDGE section below.
    // Phase 7A Fix 2: corrected field name — schema defines nextBestAction,
    // not suggestedNextAction. This line was silently dead since schema creation.
    intel.nextBestAction
      ? `Recommended Next Action: ${intel.nextBestAction}`
      : null,
  ].filter(Boolean).join('\n');

  // ── Account Knowledge — Phase 7B / 7C-1 / 7D-A ─────────────────────────
  // Reads from lead.accountKnowledge (authoritative) with fallback to the
  // deprecated intelligence fields for leads not yet migrated.
  // Phase 7C-1: filtered through isPromptEligible() (not isConfirmed()).
  // Phase 7D-A: isPromptEligible() = isConfirmed(item) && !hasConflict(item).
  //   — pending, dismissed, superseded: excluded (not trusted)
  //   — confirmed with active conflictWith: excluded (contested, awaiting resolution)
  //   — confirmed with no conflict: included (fully trusted)
  // UI display (AccountKnowledgeTab, PrepareCallDrawer) uses isConfirmed() and
  // continues to show conflicted facts — only prompts use isPromptEligible().
  // Arrays capped at 3 items; strings truncated at 80 chars.
  // Metadata fields (lastExtractedFrom, extractionCount, lastUpdated) excluded.
  const trunc = (s, n = 80) => (s && s.length > n ? s.slice(0, n) + '…' : s || '');
  const ak = lead.accountKnowledge;

  // Prompt-eligible competitors — confirmed + no active conflict
  const akCompetitors = ak?.competitors?.length
    ? ak.competitors.filter(isPromptEligible)
    : (lead.intelligence?.competitors || []).map(name => ({ name }));

  // Prompt-eligible decision makers — same pattern
  const akDecisionMakers = ak?.decisionMakers?.length
    ? ak.decisionMakers.filter(isPromptEligible)
    : (lead.intelligence?.decisionMakers || []).map(name => ({ name }));

  const akLines = [
    akCompetitors.length
      ? `Competitors: ${akCompetitors.slice(0,3).map(c => c.strength && c.strength !== 'unknown' ? `${trunc(c.name)} (${c.strength})` : trunc(c.name)).join(' | ')}`
      : null,
    akDecisionMakers.length
      ? `Decision Makers: ${akDecisionMakers.slice(0,3).map(d => d.role ? `${trunc(d.name)} (${trunc(d.role)})` : trunc(d.name)).join(' | ')}`
      : null,
    ak?.currentTools?.filter(isPromptEligible).length
      ? `Current Tools: ${ak.currentTools.filter(isPromptEligible).slice(0,3).map(t => t.category ? `${trunc(t.name)} (${trunc(t.category)})` : trunc(t.name)).join(' | ')}`
      : null,
    ak?.budget && isPromptEligible(ak.budget)
      ? `Budget: ${ak.budget.status || 'unknown'}${ak.budget.amount ? ` — ${trunc(ak.budget.amount)}` : ''}${ak.budget.notes ? ` (${trunc(ak.budget.notes)})` : ''}`
      : null,
    ak?.purchaseTimeline && isPromptEligible(ak.purchaseTimeline)
      ? `Timeline: ${ak.purchaseTimeline.urgency || 'unknown'}${ak.purchaseTimeline.targetDate ? ` — ${trunc(ak.purchaseTimeline.targetDate)}` : ''}${ak.purchaseTimeline.notes ? ` (${trunc(ak.purchaseTimeline.notes)})` : ''}`
      : null,
    ak?.businessGoals?.filter(isPromptEligible).length
      ? `Business Goals: ${ak.businessGoals.filter(isPromptEligible).slice(0,3).map(g => trunc(g.goal)).join(' | ')}`
      : null,
    ak?.recurringObjections?.filter(isPromptEligible).length
      ? `Recurring Objections: ${ak.recurringObjections.filter(isPromptEligible).slice(0,3).map(o => `${trunc(o.objection)} (${o.occurrences}×, ${o.resolved ? 'resolved' : 'open'})`).join(' | ')}`
      : null,
  ].filter(Boolean).join('\n');

  return `═══ LEAD PROFILE ═══
Business:     ${lead.business}
Contact:      ${lead.contact || 'Decision Maker'}
Location:     ${lead.city || 'Unknown'}
Industry:     ${lead.industry || 'Unknown'}
Intent:       ${lead.intent || 'AI Visibility'}
AI Score:     ${lead.aiScore || 'N/A'} / 100
AI Visibility:${lead.aiVisibility || 0}% (industry avg is ~35%)
Comp. Gap:    ${lead.compGap || 'Unknown'}
Stage:        ${lead.stage || 'New'}
Last Touch:   ${lead.lastTouch || 'Never'}
${extraContext ? `\n${extraContext}` : ''}

═══ AE NOTES & CONTEXT ═══
${notes || 'None yet.'}

═══ AI INTELLIGENCE ═══
${intelLines || 'No intelligence logged yet.'}
${akLines ? `\n═══ ACCOUNT KNOWLEDGE ═══\n${akLines}` : ''}
═══ PREVIOUS TOUCHES (do NOT repeat these angles) ═══
${prevTouches}`;
}

// ─── SDR persona ─────────────────────────────────────────────────────────────
const PERSONA = `You are Paul, a Senior SDR at Birdeye — the #1 AI-powered reputation and review management platform.

YOUR STYLE:
- Conversational, human, never corporate or salesy
- Short sentences. No filler phrases ("I hope this finds you well", "touch base", "circle back")
- Always reference something SPECIFIC about this lead — their reviews, competitor, keyword, location
- Every message ends with ONE clear, low-friction CTA
- Never pitch features — pitch outcomes
- You have one goal: get a 15-min conversation

BIRDEYE VALUE PROPS (use sparingly, pick the one most relevant):
- Businesses using Birdeye appear in AI search results (ChatGPT, Gemini, Perplexity) — most don't know this is possible
- Average client gets 3× more reviews in 30 days
- Competitor gap: if a rival has more reviews or better AI visibility, you can show exactly how to close that gap
- Local AI search is the new SEO — businesses ranking in AI get 40% more calls`;

// ─── Email prompt ─────────────────────────────────────────────────────────────
export function buildEmailPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('email');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);
  // Phase 7A Fix 3: count email touches from merged history (touchLog + activities[])
  // so angle guidance reflects the true number of emails sent, not just legacy entries.
  const touchCount = buildTouchHistory(lead).filter(t => t.type === 'Email').length;

  const angleGuidance = touchCount === 0
    ? `ANGLE: This is the FIRST email. Lead with their specific pain — ${lead.intent}. Reference ${lead.competitor ? `their competitor (${lead.competitor})` : 'their AI visibility gap'}. DO NOT mention Birdeye by name until the 3rd sentence minimum.`
    : touchCount === 1
      ? `ANGLE: Second touch. Previous email was sent — no reply yet. Change angle completely. Try: a short data point, a question, or a case study. DO NOT re-send the same pitch.`
      : `ANGLE: Touch ${touchCount + 1}. They've seen multiple emails. Try a pattern interrupt — be very short (2-3 sentences max), be direct, or use a break-up style if > 4 touches.`;

  return `${PERSONA}

${ctx}

═══ TASK: GENERATE 3 EMAIL VARIATIONS ═══
${angleGuidance}

Write 3 email variations with different angles. For each:
SUBJECT: [subject line — under 8 words, no clickbait]
BODY: [email body]

Rules:
- Email 1: Data-led (use their specific review count, visibility %, or competitor gap)
- Email 2: Story/social proof (similar ${lead.industry || 'business'} that succeeded)
- Email 3: Direct/short (under 60 words total)
- Each ends with exactly ONE question as the CTA
- Sign off as: Paul | Senior SDR, Birdeye

Label each email exactly as:
=== EMAIL 1 ===
Subject: [subject line]

[email body]

=== EMAIL 2 ===
Subject: [subject line]

[email body]

=== EMAIL 3 ===
Subject: [subject line]

[email body]`;
}

// ─── SMS prompt ───────────────────────────────────────────────────────────────
export function buildSMSPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('sms');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);
  const firstName = lead.contact?.split(' ')[0] || lead.business?.split(' ')[0] || 'there';

  return `${PERSONA}

${ctx}

═══ TASK: GENERATE 3 SMS VARIATIONS ═══
Write 3 SMS messages. Each MUST be under 160 characters. Start with their first name.

Rules:
- SMS 1: Reference their specific situation (${lead.intent}, ${lead.reviews || 'review'} count)
- SMS 2: Curiosity hook — one provocative question
- SMS 3: Ultra-short re-engage (under 80 chars) — yes/no question only
- Never start with "Hi" or "Hey" on more than one
- No emoji overload — max 1 per message
- Sign: – Paul, Birdeye

The contact's first name is: ${firstName}

Label each SMS exactly as:
=== SMS 1 ===
[sms text under 160 chars]

=== SMS 2 ===
[sms text under 160 chars]

=== SMS 3 ===
[sms text under 160 chars]`;
}

// ─── Voicemail prompt ─────────────────────────────────────────────────────────
export function buildVoicemailPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('voicemail');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

═══ TASK: WRITE A 30-SECOND VOICEMAIL SCRIPT ═══
Write a single flowing voicemail script of exactly 75–85 words.

Rules:
- Natural spoken language — write for the ear, not the eye
- Use contractions and short phrases (how a real person talks)
- Start with your name and company immediately
- Include ONE specific hook using this lead's data (their review count, competitor, AI visibility gap, or keyword)
- End with your phone number placeholder and mention you'll send a follow-up email
- Output the script only — nothing else
- No section labels, no brackets, no headers, no markdown, no word count

The script should flow as continuous spoken sentences. Do not separate it into sections.`;
}

// ─── LinkedIn prompt ──────────────────────────────────────────────────────────
export function buildLinkedInPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('linkedin');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

═══ TASK: WRITE LINKEDIN OUTREACH SEQUENCE ═══

Write 3 LinkedIn messages:

CONNECTION REQUEST (max 300 chars):
- Find genuine common ground or a specific observation about their business/content
- DO NOT pitch in the connection request
- Make it feel like a human reaching out, not a sales sequence

FOLLOW-UP 1 (after they accept — max 500 chars):
- Pure value, no pitch
- Share one insight specifically relevant to ${lead.intent} for ${lead.industry || 'their industry'}

FOLLOW-UP 2 (3-5 days later — max 400 chars):
- Soft intro to what Birdeye does
- Tie it to their specific situation
- End with a low-friction CTA (10-min call, not "schedule a demo")

Label each message exactly as:
=== CONNECTION REQUEST ===
[message]

=== FOLLOW-UP 1 ===
[message]

=== FOLLOW-UP 2 ===
[message]`;
}

// ─── AE Notes generator ───────────────────────────────────────────────────────
export function buildAENotesPrompt(lead) {
  if (!lead) return 'No lead selected.';
  const override = getPromptOverride('aeNotes');
  if (override) return interpolatePrompt(override, lead);
  const competitors = lead.intelligence?.competitors || [];
  const c1 = competitors[0] || lead.competitor || '';
  const c2 = competitors[1] || '';

  return `You are a sales enablement specialist at Birdeye.
Generate AE Notes in plain text only. No markdown. No asterisks. No bold. No bullet symbols.

Use EXACTLY this format — every field on its own line:

Business Name: ${lead.business || ''}
Name: ${lead.contact || ''}
Location: ${lead.city || ''}
Industry: ${lead.industry || ''}
Rating: ${lead.rating || ''}
Reviews: ${lead.reviews || ''}
Keyword: ${lead.keyword || ''}
Competitors: ${c1}${c2 ? ', ' + c2 : ''}
GMB URL: ${lead.gmbUrl || ''}
Salesloft URL: ${lead.salesloftUrl || ''}
MQL Date: ${lead.mqlDate || ''}
AI Score: ${lead.aiScore || ''}
Intent: ${lead.intent || ''}
Stage: ${lead.stage || ''}
Pain Points: ${(lead.intelligence?.painPoints || []).join(', ') || ''}
Buying Signals: ${(lead.intelligence?.buyingSignals || []).join(', ') || ''}
Last Conversation: ${lead.intelligence?.lastConversation || ''}
Next Best Action: ${lead.intelligence?.nextBestAction || lead.nextAction || ''}

Raw Research Notes:
${lead.aeNotes || 'None provided'}

Rules:
- Plain text only — no markdown, no asterisks, no bold
- Real numbers only — never invented
- Mention competitor names and exact gaps where known
- Leave field blank if data not available

Output AE Notes only. Nothing else.`;
}

// ─── Situational prompt ───────────────────────────────────────────────────────
export function buildSituationalPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('situational');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

═══ TASK: SITUATIONAL ANALYSIS & RECOMMENDED NEXT MOVE ═══
Based on everything above, give me:

1. SITUATION ASSESSMENT (3-4 sentences)
   - Where is this lead in their journey?
   - What signals tell you that?
   - What is the biggest risk of losing this deal right now?

2. RECOMMENDED NEXT ACTION
   - Channel: [Email / SMS / Call / LinkedIn]
   - Timing: [Send now / Wait X days / Best time to send]
   - Angle: [What specific message will resonate most right now]

3. DRAFT MESSAGE
   - Write the actual message to send right now
   - Keep it short and specific
   - Based on their stage (${lead.stage}) and last touch (${lead.lastTouch})

4. RED FLAGS (if any)
   - Is there anything in the data that suggests this lead is not worth pursuing?`;
}

// ─── Cadence builder prompt ───────────────────────────────────────────────────
export function buildCadencePrompt(lead, cadenceName) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('cadence');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

═══ TASK: BUILD A 7-STEP OUTREACH CADENCE ═══
${cadenceName ? `Cadence name: ${cadenceName}` : ''}

Build a complete 7-step outreach sequence for this lead optimised for their intent (${lead.intent}) and stage (${lead.stage}).

For each step provide:
- Day: [number]
- Channel: [Email / SMS / Voicemail / LinkedIn]
- Time: [AM / PM]
- Angle: [specific message angle — 1 sentence]
- If/Then: [what to do if they reply / don't reply]

Rules:
- Mix channels — don't send 3 emails in a row
- Increase urgency gradually
- Day 1-3: Value-led (no hard pitch)
- Day 4-6: Social proof + soft CTA
- Day 7: Break-up / last attempt

Format each step as:
STEP X | Day Y | [Channel] | [AM/PM]
Angle: [description]
If reply: [action]
If no reply: [action]`;
}

// ─── Cadence step email/SMS generator ────────────────────────────────────────
// Phase 10B-1: added getPromptOverride('cadenceStep') support.
// The SDR can now customise cadence step generation via Prompt Builder.
// Template variables available: {{first_name}}, {{biz_name}}, {{city}},
//   {{competitor_1}}, {{pain_point_1}}, {{last_touch}}, etc.
// Step-specific context (channel, day, angle) is injected after the override.
export function buildCadenceStepPrompt(lead, step) {
  if (!lead) return 'No lead selected.';
  const override = getPromptOverride('cadenceStep');
  if (override) {
    const interpolated = interpolatePrompt(override, lead);
    // Append step-specific context so overrides still benefit from it
    return `${interpolated}

Step context:
Channel: ${step.channel || 'Email'}
Day: ${step.day || 1}
Angle: ${step.angle || step.label || step.name || 'Value-add outreach'}`;
  }
  const ctx = buildLeadContext(lead);
  return `${ctx}

TASK: Write a ${step.channel || 'Email'} for Day ${step.day || 1} of this lead's outreach cadence.
Angle: ${step.angle || step.label || step.name || 'Value-add outreach'}
Type: ${step.type || 'Automated'}

Rules:
- Reference something specific about ${lead.business}
- Lead with their pain point — not Birdeye features
- End with ONE clear low-friction CTA
- Under 100 words for email body
- If email: provide Subject line first, then body
- If SMS: under 160 characters, no emoji overload
- Sign off: Paul | SDR, Birdeye

Output the ${step.channel || 'Email'} only. Nothing else.`;
}

// ─── Re-engage hook generator ─────────────────────────────────────────────────
export function buildReEngagePrompt(lead, signal) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const override = getPromptOverride('reEngage');
  if (override) return interpolatePrompt(override, lead);
  const ctx = buildLeadContext(lead);

  // Phase 10B-1: derive a specific signal when none is passed externally.
  // buildPrompt('reEngage', lead) calls this without a signal argument.
  // Previously fell back to generic 'Lead showing new activity'. Now derives
  // a meaningful signal from lead fields so rule #1 ("REFERENCES THE SIGNAL
  // directly") produces a specific hook instead of a generic one.
  // isConfirmed is already imported at the top of this file.
  const resolvedSignal = signal || (() => {
    const akComps = (lead.accountKnowledge?.competitors || []).filter(isConfirmed);
    const comp = akComps[0]?.name
      || lead.intelligence?.competitors?.[0]
      || lead.competitor;
    if (comp) return `Competitor active — ${comp} may be gaining ground while ${lead.business} is cold`;
    if (lead.intent === 'AI Visibility') return `AI visibility gap — ${lead.aiVisibility ?? 0}% vs ~35% industry average`;
    if (lead.intent === 'Review Growth') return `Review gap — ${lead.reviews ?? 0} reviews, below competitive threshold`;
    if (lead.intent === 'Listings')      return `Listing accuracy issue — inconsistent data across directories`;
    return 'Lead re-entered consideration — re-engagement window is open';
  })();

  return `${PERSONA}

${ctx}

NEW SIGNAL DETECTED: ${resolvedSignal}

═══ TASK: WRITE A RE-ENGAGEMENT HOOK ═══
This lead went cold but just showed a new intent signal. Write a re-engagement message that:

1. REFERENCES THE SIGNAL directly (don't pretend you don't know)
2. Addresses why they went cold (${lead.lostReason || 'no previous context'})
3. Shows something NEW has changed — either at Birdeye or relevant to their situation
4. Keeps it short — under 100 words
5. Ends with a very easy CTA — not a demo request

Write 2 versions:
VERSION A: Email (with subject line)
VERSION B: LinkedIn DM (max 300 chars)

Label: === VERSION A (Email) === / === VERSION B (LinkedIn) ===`;
}

// ─── Call Notes intelligence extraction prompt ────────────────────────────────
// Consumes getPromptOverride('notes') so the Prompt Builder "Call Notes AI"
// action is live. Falls back to the structured extraction default.
export function buildNotesPrompt(lead) {
  if (!lead) return 'No lead selected.';
  const override = getPromptOverride('notes');
  if (override) return interpolatePrompt(override, lead);

  return `Extract intelligence from these call notes for ${lead.business || 'this lead'}.

Notes: [paste call notes here]

Extract and return JSON with:
- summary (2 sentences)
- painPoints (array of strings)
- objections (array of strings)
- competitors (array of strings)
- buyingSignals (array of strings)
- nextBestAction (string)
- leadTemperature (Cold / Warm / Hot)
- sentiment (Positive / Neutral / Negative)`;
}

// ─── normalizeGeneratedContent ────────────────────────────────────────────────
//
// Canonical output normalizer for all AI-generated content.
// Replaces the private parseClaudeOutput function that lived inside Copilot.jsx.
//
// CONTRACT:
//   normalizeGeneratedContent(mode, rawText) → { subject: string, body: string }
//
// Guarantees:
//   - Never throws under any input
//   - Empty / null / non-string input → { subject:'', body:'' }
//   - Never returns multi-variant blobs (EMAIL 2, SMS 2, etc.)
//   - Voicemail: strips ALL labels, brackets, word counts
//   - LinkedIn: extracts connection request section only
//   - Situational, cadence, notes, aeNotes: pass through (structured sections intentional)
//
// Parser hardening — survives AI format drift:
//   - Email: exact delimiter → Subject: fallback → raw fallback
//   - SMS: exact delimiter → strip delimiter line → raw fallback
//   - Voicemail: regex strip all [LABEL] + WORD COUNT + ESTIMATED TIME lines
//   - LinkedIn: exact delimiter → raw fallback
//
export function normalizeGeneratedContent(mode, rawText) {
  // Guard — never throws, empty input returns empty output
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { subject: '', body: '' };
  }

  const raw = rawText.trim();

  // ── Extraction helper ──────────────────────────────────────────────────────
  // Returns the text between startTag and endTag (exclusive), trimmed.
  // Returns '' if startTag is not found.
  const extract = (text, startTag, endTag) => {
    const s = text.indexOf(startTag);
    if (s === -1) return '';
    const start = s + startTag.length;
    const e = endTag ? text.indexOf(endTag, start) : -1;
    return text.slice(start, e === -1 ? text.length : e).trim();
  };

  // ── EMAIL ──────────────────────────────────────────────────────────────────
  // Extract EMAIL 1 only — never return EMAIL 2 or EMAIL 3.
  // Fallback chain: exact delimiter → Subject: line scan → raw (capped at EMAIL 2 boundary)
  if (mode === 'email') {
    // Try exact delimiter first
    let email1 = extract(raw, '=== EMAIL 1 ===', '=== EMAIL 2 ===');

    // Fallback: alternate delimiter formats
    if (!email1) email1 = extract(raw, 'EMAIL_1_START', 'EMAIL_1_END');

    // Fallback: find first Subject: line in raw and take from there
    // Only use this if we couldn't find a block at all
    if (!email1) {
      const subjectIdx = raw.search(/^Subject:/im);
      if (subjectIdx !== -1) {
        // Limit to before EMAIL 2 start if present
        const email2Idx = raw.indexOf('=== EMAIL 2 ===');
        email1 = email2Idx !== -1
          ? raw.slice(subjectIdx, email2Idx).trim()
          : raw.slice(subjectIdx).trim();
      }
    }

    // Final fallback: use raw but cap at EMAIL 2 boundary
    if (!email1) {
      const email2Idx = raw.indexOf('=== EMAIL 2 ===');
      email1 = email2Idx !== -1 ? raw.slice(0, email2Idx).trim() : raw;
    }

    // Parse subject line from the extracted block
    const subjectMatch = email1.match(/^Subject:\s*(.+)/im);
    const subject = subjectMatch ? subjectMatch[1].trim() : '';
    // Remove subject line (and any blank line immediately after) from body
    const body = email1
      .replace(/^Subject:\s*.+\n?/im, '')
      .trim();

    return { subject, body };
  }

  // ── SMS ────────────────────────────────────────────────────────────────────
  // Extract SMS 1 only. Strip the delimiter label line from the extracted text.
  if (mode === 'sms') {
    let sms1 = extract(raw, '=== SMS 1 ===', '=== SMS 2 ===');

    // Fallback: alternate delimiter
    if (!sms1) sms1 = extract(raw, 'SMS_1_START', 'SMS_1_END');

    // Fallback: no delimiter — take full text but strip any === lines
    if (!sms1) sms1 = raw.replace(/===.*===/g, '').trim();

    // Strip any residual delimiter lines that ended up inside the block
    const body = sms1
      .replace(/^===.*===\s*\n?/gm, '')
      .trim();

    return { subject: 'SMS', body };
  }

  // ── VOICEMAIL ──────────────────────────────────────────────────────────────
  // Strip ALL structural labels — [INTRO], [HOOK], [CTA], bracket patterns,
  // WORD COUNT lines, ESTIMATED TIME lines, and VOICEMAIL SCRIPT headers.
  if (mode === 'voicemail') {
    let body = raw;

    // Strip **VOICEMAIL SCRIPT** headers and similar markdown headers
    body = body.replace(/\*{0,2}VOICEMAIL SCRIPT\*{0,2}\s*\n?/gi, '');
    body = body.replace(/^#+\s+.*$/gm, '');                        // ## headings

    // Strip [LABEL] bracket patterns: [INTRO], [HOOK], [CTA], [INTRO - 1 sentence], etc.
    body = body.replace(/\[[^\]]*\]\s*[-–]?\s*/g, '');

    // Strip WORD COUNT and ESTIMATED TIME lines (whole line)
    body = body.replace(/^WORD COUNT\s*:.*$/gim, '');
    body = body.replace(/^ESTIMATED TIME\s*:.*$/gim, '');
    body = body.replace(/^WORD COUNT\s*\|.*$/gim, '');             // "WORD COUNT: X | ESTIMATED TIME: ~Xs"

    // Collapse multiple consecutive blank lines into one
    body = body.replace(/\n{3,}/g, '\n\n');

    return { subject: 'Voicemail Script', body: body.trim() };
  }

  // ── LINKEDIN ───────────────────────────────────────────────────────────────
  // Extract CONNECTION REQUEST section only — never return follow-up variants.
  if (mode === 'linkedin') {
    const connection =
      extract(raw, '=== CONNECTION REQUEST ===', '=== FOLLOW-UP 1 ===') ||
      extract(raw, '=== CONNECTION REQUEST ===', '=== FOLLOW-UP 2 ===') ||
      extract(raw, 'CONNECTION REQUEST:', 'FOLLOW-UP') ||
      raw;   // final fallback: return raw if no delimiter found

    const body = connection
      .replace(/^===.*===\s*\n?/gm, '')   // strip residual delimiter lines
      .trim();

    return { subject: 'LinkedIn Connection', body };
  }

  // ── PASS-THROUGH MODES ─────────────────────────────────────────────────────
  // situational, cadence, notes, aeNotes — structured sections are intentional.
  return { subject: mode, body: raw };
}

// ─── Normalize mode to lowercase for all internal use ─────────────────────────
export function normalizeMode(mode) {
  if (!mode) return 'email';
  return mode.toLowerCase();
}

// ─── Route to correct prompt builder ─────────────────────────────────────────
export function buildPrompt(mode, lead) {
  const m = normalizeMode(mode);
  switch (m) {
    case 'email':       return buildEmailPrompt(lead);
    case 'sms':         return buildSMSPrompt(lead);
    case 'voicemail':   return buildVoicemailPrompt(lead);
    case 'linkedin':    return buildLinkedInPrompt(lead);
    case 'situational': return buildSituationalPrompt(lead);
    case 'cadence':     return buildCadencePrompt(lead);
    case 'notes':       return buildNotesPrompt(lead);
    case 'reengage':    return buildReEngagePrompt(lead);         // Phase 10B-1: wire dead export
    case 'cadencestep': return buildCadenceStepPrompt(lead, {}); // Phase 10B-1: add to router
    default:            return buildEmailPrompt(lead);
  }
}
