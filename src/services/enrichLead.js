/**
 * enrichLead — Pure async enrichment service.
 *
 * No React imports. No context imports. No side effects beyond the fetch call.
 * Safe to call from any context — AppContext, views, or background workers.
 *
 * Returns an intelligence patch object on success, null on any failure or
 * when prerequisites are not met (missing key, wrong provider, network error).
 * Never throws. Never logs errors to console.
 */

/**
 * Calls the Gemini API with a structured business profile prompt and returns
 * a parsed intelligence patch ready to pass to updateIntelligence().
 *
 * @param {object} lead     - Full v4 lead object
 * @param {object} settings - { aiProvider: string, geminiKey: string }
 * @returns {object|null}   - Intelligence patch or null
 */
export async function enrichLead(lead, settings) {
  // Prerequisites — return null silently when conditions are not met
  if (!settings?.geminiKey || settings.aiProvider !== 'gemini') return null;
  if (!lead) return null;

  const prompt = `You are an expert SDR analyst. Based on the following business profile,
generate sales intelligence.

Business: ${lead.business || 'Unknown'}
Location: ${lead.city || 'Unknown'}
Industry: ${lead.industry || 'Unknown'}
Website: ${lead.website || 'Not provided'}
Reviews: ${lead.reviews || 0} (Rating: ${lead.rating || 'Unknown'})
AI Visibility Score: ${lead.aiVisibility || 0}%
Competitor Gap: ${lead.compGap || 'Unknown'}
Intent Signal: ${lead.intent || 'Unknown'}
AI Score: ${lead.aiScore || 0}

Return ONLY a JSON object with these exact keys:
{
  "summary": "2 sentence summary of why this lead needs Birdeye",
  "painPoints": ["pain 1", "pain 2", "pain 3"],
  "nextBestAction": "specific recommended first outreach action",
  "leadTemperature": "Cold" or "Warm" or "Hot",
  "buyingSignals": ["signal 1", "signal 2"],
  "objections": ["likely objection 1", "likely objection 2"]
}
No markdown. No explanation. JSON only.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    // Strip optional ```json / ``` fences before parsing
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed  = JSON.parse(cleaned);

    return {
      summary:         typeof parsed.summary         === 'string'   ? parsed.summary         : '',
      painPoints:      Array.isArray(parsed.painPoints)              ? parsed.painPoints      : [],
      nextBestAction:  typeof parsed.nextBestAction  === 'string'   ? parsed.nextBestAction  : '',
      leadTemperature: ['Cold','Warm','Hot'].includes(parsed.leadTemperature) ? parsed.leadTemperature : 'Cold',
      buyingSignals:   Array.isArray(parsed.buyingSignals)           ? parsed.buyingSignals   : [],
      objections:      Array.isArray(parsed.objections)              ? parsed.objections      : [],
      lastUpdated:     new Date().toISOString(),
    };
  } catch {
    // Network errors, JSON parse failures, malformed response — all return null silently
    return null;
  }
}
