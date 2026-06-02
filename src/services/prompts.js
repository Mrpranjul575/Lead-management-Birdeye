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
function buildTouchHistory(lead) {
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
    intel.decisionMakers?.length
      ? `Decision Makers: ${intel.decisionMakers.join(', ')}`
      : null,
    // Phase 7A Fix 2: corrected field name — schema defines nextBestAction,
    // not suggestedNextAction. This line was silently dead since schema creation.
    intel.nextBestAction
      ? `Recommended Next Action: ${intel.nextBestAction}`
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

Label exactly as: === EMAIL 1 === / === EMAIL 2 === / === EMAIL 3 ===`;
}

// ─── SMS prompt ───────────────────────────────────────────────────────────────
export function buildSMSPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
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

Label exactly as: === SMS 1 === / === SMS 2 === / === SMS 3 ===`;
}

// ─── Voicemail prompt ─────────────────────────────────────────────────────────
export function buildVoicemailPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

═══ TASK: WRITE A 30-SECOND VOICEMAIL SCRIPT ═══
This will be spoken out loud. Write for ear, not eye.

Rules:
- Exactly 75-85 words (30 seconds at normal pace)
- Start with your name and company immediately
- ONE specific hook relevant to this lead (their reviews, competitor, AI visibility)
- End with your number AND an email mention ("I'll also shoot you a quick email")
- Sound natural — use contractions, short phrases
- NO reading from a script feel — write it conversationally

Format:
[INTRO - 1 sentence]
[HOOK - 2 sentences max, specific to this lead]
[CTA - 1-2 sentences, give callback number placeholder]

Then provide: WORD COUNT: X | ESTIMATED TIME: ~Xs`;
}

// ─── LinkedIn prompt ──────────────────────────────────────────────────────────
export function buildLinkedInPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
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

Label exactly as: === CONNECTION REQUEST === / === FOLLOW-UP 1 === / === FOLLOW-UP 2 ===`;
}

// ─── AE Notes generator ───────────────────────────────────────────────────────
export function buildAENotesPrompt(lead, rawData, aiReport, seoReport, repGap, addlNotes) {
  return `You are a senior SDR writing structured AE handoff notes for a new lead.

RAW INPUT DATA:
${rawData || 'Not provided'}

AI SCAN REPORT:
${aiReport || 'Not provided'}

LOCAL SEO REPORT:
${seoReport || 'Not provided'}

REPUTATION GAP DATA:
${repGap || 'Not provided'}

ADDITIONAL NOTES:
${addlNotes || 'Not provided'}

═══ TASK: GENERATE STRUCTURED AE NOTES ═══
Analyse all the input data above and write clean, structured AE notes.

Output EXACTLY in this format:

## Lead Summary
[2-3 sentence overview: who they are, what they need, why now]

## Pain Points
- [specific pain point from the data]
- [specific pain point from the data]
- [add more if present]

## Competitor Intelligence
- [competitor name + their advantage/disadvantage]
- [any other competitors mentioned]

## Intent Signals
- Primary: [intent]
- Signals: [what in the data suggests this]

## Keyword & SEO Context
- Target keyword: [if present]
- Local SEO gaps: [from SEO report]
- AI visibility: [from AI report]

## Recommended Angle
[1-2 sentences: what is the strongest opening angle for this lead based on all the data]

## Next Best Action
[Specific action: e.g. "Send competitor proof email leading with the X review gap vs Y competitor"]

Write concisely. Every bullet should contain a real insight, not a placeholder.`;
}

// ─── Situational prompt ───────────────────────────────────────────────────────
export function buildSituationalPrompt(lead) {
  if (!lead) return 'No lead selected. Open a lead first.';
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

// ─── Re-engage hook generator ─────────────────────────────────────────────────
export function buildReEngagePrompt(lead, signal) {
  if (!lead) return 'No lead selected. Open a lead first.';
  const ctx = buildLeadContext(lead);

  return `${PERSONA}

${ctx}

NEW SIGNAL DETECTED: ${signal || 'Lead showing new activity'}

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

// ─── Normalize mode to lowercase for all internal use ─────────────────────────
export function normalizeMode(mode) {
  if (!mode) return 'email';
  return mode.toLowerCase();
}

// ─── Route to correct prompt builder ─────────────────────────────────────────
export function buildPrompt(mode, lead) {
  const m = normalizeMode(mode);
  switch (m) {
    case 'email':      return buildEmailPrompt(lead);
    case 'sms':        return buildSMSPrompt(lead);
    case 'voicemail':  return buildVoicemailPrompt(lead);
    case 'linkedin':   return buildLinkedInPrompt(lead);
    case 'situational':return buildSituationalPrompt(lead);
    case 'cadence':    return buildCadencePrompt(lead);
    default:           return buildEmailPrompt(lead);
  }
}
