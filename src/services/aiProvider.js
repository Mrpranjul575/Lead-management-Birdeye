/**
 * AI PROVIDER SERVICE
 * Unified interface for Claude and Gemini.
 * Routes calls based on user's selected provider in settings.
 */

// ── Claude (Anthropic) ────────────────────────────────────────────────────────
async function callClaude(prompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Claude API error ${response.status}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ── Gemini (Google) ───────────────────────────────────────────────────────────
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${response.status}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Gemini transcription (audio) ──────────────────────────────────────────────
export async function transcribeWithGemini(audioBase64, mimeType, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
          { text: `Transcribe this sales call recording completely and accurately.

After the full transcript, provide a structured analysis:

TRANSCRIPT:
[full word-for-word transcript]

---
SUMMARY:
[2-3 sentence summary of what was discussed]

PAIN POINTS:
- [pain point 1]
- [pain point 2]

COMPETITORS MENTIONED:
- [competitor 1]
- [competitor 2]

OBJECTIONS:
- [objection 1]

BUYING SIGNALS:
- [signal 1]

ACTION ITEMS:
- [action 1]

DECISION MAKERS:
- [person name + role]

SENTIMENT: [Positive / Neutral / Negative]

NEXT BEST ACTION:
[specific recommended next step]` }
        ]
      }],
      generationConfig: { maxOutputTokens: 4000 },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini transcription error ${response.status}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── Parse transcript output into structured intelligence ──────────────────────
export function parseTranscriptIntelligence(text) {
  const section = (label) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };
  const bullets = (label) => {
    const raw = section(label);
    return raw.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  };

  const transcriptMatch = text.match(/TRANSCRIPT:\s*([\s\S]*?)(?=\n---|\nSUMMARY:)/i);
  const transcript = transcriptMatch ? transcriptMatch[1].trim() : text;

  return {
    transcript,
    summary:        section('SUMMARY'),
    painPoints:     bullets('PAIN POINTS'),
    competitors:    bullets('COMPETITORS MENTIONED'),
    objections:     bullets('OBJECTIONS'),
    buyingSignals:  bullets('BUYING SIGNALS'),
    actionItems:    bullets('ACTION ITEMS'),
    decisionMakers: bullets('DECISION MAKERS'),
    sentiment:      section('SENTIMENT'),
    nextBestAction: section('NEXT BEST ACTION'),
  };
}

// ── Main unified call ─────────────────────────────────────────────────────────
export async function callAI(prompt, settings = {}) {
  const provider = settings.aiProvider || 'claude';
  const key = provider === 'gemini' ? settings.geminiKey : settings.claudeKey;

  if (!key || key.includes('•')) {
    // No key — return a placeholder for copy-paste workflow
    return null;
  }

  if (provider === 'gemini') return callGemini(prompt, key);
  return callClaude(prompt, key);
}

export default callAI;
