import Groq from 'groq-sdk';

const MODES = {

  earnings: (text) => `You are a senior equity research analyst. Analyze this earnings call transcript with precision and depth.

Return your analysis using these exact headers:

## Verdict
One sentence: Bull, Bear, or Neutral — and why in plain English.

## Beat / Miss
Revenue: [beat/miss/in-line] by [amount or %] | EPS: [beat/miss/in-line] by [amount] | State if figures weren't mentioned.

## Guidance
What management said about next quarter and full year. If they raised, lowered, or withdrew guidance, say so explicitly.

## Management Tone
Score: [1-10] where 10 = extremely confident. Explain the score. Note any hedging, evasion, or unusual language.

## Bull Case
3 specific reasons from THIS call to be optimistic.

## Bear Case
3 specific risks or concerns raised directly or indirectly in this call.

## Red Flags
Any accounting oddities, unusual one-time items, changed metrics, or evasive answers. Write "None detected" if clean.

## Key Quotes
3 most important verbatim quotes from management with one sentence of context each.

## One-Line Summary
A single sentence a trader could read in 5 seconds.

Transcript:
---
${text}
---`,

  sec: (text) => `You are a forensic financial analyst specializing in SEC filings. Analyze this filing (10-K, 10-Q, or 8-K).

Return your analysis using these exact headers:

## Filing Type & Period
Identify the filing type and reporting period.

## Business Snapshot
2-3 sentences on what this company does and its market position.

## Financial Highlights
Key revenue, profit, and cash flow figures. Note YoY changes. Flag any restatements.

## Risk Factors
Top 5 most material risks listed or implied. Flag any NEW risks vs boilerplate language.

## Red Flags
Unusual accounting treatments, changed auditors, going concern language, related-party transactions. Write "None detected" if clean.

## Management Discussion Tone
What are they optimistic about? What are they downplaying? Any notable omissions?

## What Changed
What is materially different from a normal filing? New disclosures, removed language, changed segment reporting.

## Verdict
Bull / Bear / Neutral with a 2-sentence rationale.

Filing text:
---
${text}
---`,

  sentiment: (text) => `You are a quantitative analyst specializing in market sentiment. Analyze these financial news headlines or articles.

Return your analysis using these exact headers:

## Sentiment Score
[Score: X/10] where 1 = extremely bearish, 5 = neutral, 10 = extremely bullish.

## Overall Narrative
2-3 sentences on the dominant story the market is telling right now.

## Bullish Signals
Specific items from the text that are positive catalysts.

## Bearish Signals
Specific items from the text that are negative or concerning.

## Noise vs Signal
Which headlines are likely noise vs genuinely material information?

## Institutional Angle
What sophisticated investors are likely focusing on vs what retail is reacting to.

## Key Question
The single most important question an analyst should be asking based on this news flow.

News content:
---
${text}
---`,

  redflags: (text) => `You are a forensic accountant and short-seller researcher. Find problems — things that don't add up, language that obscures, or metrics that mislead.

Return your analysis using these exact headers:

## Overall Risk Score
[Score: X/10] where 10 = extremely high risk of misrepresentation.

## Accounting Red Flags
Specific issues: revenue recognition problems, unusual accruals, aggressive capitalization, goodwill issues.

## Language Red Flags
Evasive phrases, excessive hedging, missing information, changed metric definitions.

## Management Credibility
Based on what they say and don't say — do they appear credible?

## Metric Manipulation Risk
Signs of channel stuffing, pulled-forward revenue, or adjusted metrics that flatter results.

## Short Thesis
If someone were shorting this stock based on this document alone, what would their thesis be?

## What To Verify
The 5 most important things to independently verify after reading this.

## Verdict
Clean / Watch / High Risk — with 2 sentences of rationale.

Document:
---
${text}
---`,

  compare: (text) => `You are a competitive intelligence analyst. Two companies or documents have been provided separated by "=== DOCUMENT 2 ===". Compare them.

Return your analysis using these exact headers:

## Companies Identified
Name both entities being compared.

## Head-to-Head Financials
Side by side on key metrics: revenue growth, margins, EPS, guidance.

## Competitive Position
Who is winning and why? Where is each company stronger?

## Management Quality
Based on their communications — who communicates more clearly, confidently, and credibly?

## Risk Comparison
Which company carries more risk right now and why?

## Momentum
Which company has better near-term momentum based on these documents?

## Long / Short Idea
If forced to go long one and short the other — which and why?

## Verdict
Clear winner or too close to call — with reasoning.

Documents:
---
${text}
---`,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured. Add it in Vercel → Project Settings → Environment Variables.' });
  }

  const { text, mode } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided.' });
  if (!MODES[mode]) return res.status(400).json({ error: 'Invalid analysis mode.' });

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: MODES[mode](text) }],
      stream: true,
      max_tokens: 2000,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) res.write(`data: ${JSON.stringify({ text: token })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Analyze error:', err.message);
    try { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); } catch (_) {}
  }
}
