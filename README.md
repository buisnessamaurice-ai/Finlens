# FinLens — Financial Intelligence

AI-powered analysis for financial documents. Built for people who actually work in markets.  
Powered by **Groq AI** (free tier). Deployable on **Vercel** in 2 minutes.

---

## What It Does

| Mode | Input | Output |
|------|-------|--------|
| 📞 Earnings Call | Transcript text or PDF | Verdict, beat/miss, guidance, tone score, bull/bear case, red flags, key quotes |
| 📑 SEC Filing | 10-K / 10-Q / 8-K text or PDF | Business snapshot, financials, risk factors, red flags, what changed |
| 📰 News Sentiment | Headlines or articles | Sentiment score, bull/bear signals, noise vs signal, institutional angle |
| 🚩 Red Flag Scanner | Any financial document | Risk score, accounting flags, language flags, short thesis, what to verify |
| ⚖️ Compare | Two documents | Head-to-head financials, competitive position, long/short idea |

**Plus:**
- Follow-up Q&A after any analysis
- Ticker watchlist (localStorage)
- Analysis history (last 50, localStorage)
- Export as `.md` or `.txt`
- PDF upload on all modes

---

## Project Structure

```
finlens/
├── api/
│   ├── analyze.js     # Main analysis endpoint — all 5 modes, streaming
│   ├── qa.js          # Follow-up Q&A endpoint, streaming
│   └── pdf.js         # PDF text extraction
├── public/
│   ├── index.html     # App markup
│   ├── css/styles.css # Dark terminal UI
│   └── js/app.js      # All frontend logic
├── vercel.json        # Routing config
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Quick Start (3 steps)

**1. Get a free Groq API key**  
[console.groq.com](https://console.groq.com) → Sign up → API Keys → Create Key

**2. Install & configure**
```bash
git clone https://github.com/YOUR_USERNAME/finlens.git
cd finlens
npm install
cp .env.example .env
# Open .env → paste: GROQ_API_KEY=gsk_...
```

**3. Run**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel (free)

```bash
# Option A — terminal
npx vercel          # follow the prompts, add GROQ_API_KEY when asked

# Option B — web
# vercel.com → New Project → import GitHub repo → add GROQ_API_KEY in Environment Variables → Deploy
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `GROQ_API_KEY not configured` | Add the key in Vercel → Project Settings → Environment Variables |
| PDF shows no text | PDF is image-based/scanned — paste the text manually instead |
| Analysis cuts off | Input is very long — try pasting the most relevant section only |
| `npm run dev` fails | Run `npm install` first |

---

## Tech Stack

| | |
|-|-|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend  | Vercel Serverless Functions |
| AI       | Groq — `llama-3.3-70b-versatile` (free) |
| PDF      | pdf-parse |

---

## License

MIT
