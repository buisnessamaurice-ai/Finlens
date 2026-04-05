/**
 * FinLens — Financial Intelligence
 * Frontend logic. All API calls go to /api/* on the backend.
 * Watchlist + history stored in localStorage.
 */

// ─── State ────────────────────────────────────────────────────────────────────
let currentMode   = 'earnings';
let selectedPdf   = null;
let lastResult    = '';
let currentSource = '';
let qaHistory     = [];

// ─── Template questions per mode ─────────────────────────────────────────────
const TEMPLATES = {
  earnings: [
    'What did management say about margins?',
    'Were there any analyst questions about competition?',
    'What is the revenue guidance for next quarter?',
    'Did management mention any macro headwinds?',
    'What one-time items affected EPS?',
  ],
  sec: [
    'What are the top 3 risk factors?',
    'How did revenue change year over year?',
    'Are there any going concern warnings?',
    'What does the cash flow statement show?',
    'Were there any related-party transactions?',
  ],
  sentiment: [
    'What is the overall market mood?',
    'Which headlines are most material?',
    'Is this sentiment likely to persist?',
    'What would change the sentiment direction?',
  ],
  redflags: [
    'What are the most serious red flags?',
    'Is the revenue recognition policy normal?',
    'How does this compare to industry standards?',
    'What would a short-seller focus on here?',
  ],
  compare: [
    'Which company has better margins?',
    'Who has stronger guidance?',
    'Which management team is more credible?',
    'Which stock would you rather own?',
  ],
};

// ─── Mode labels ──────────────────────────────────────────────────────────────
const MODE_LABELS = {
  earnings:  'Paste earnings call transcript',
  sec:       'Paste SEC filing text (10-K, 10-Q, 8-K)',
  sentiment: 'Paste news headlines or articles',
  redflags:  'Paste any financial document',
  compare:   'Paste both documents below',
};

// ─── Set mode ─────────────────────────────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;

  // Update active card
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');

  // Show/hide compare inputs
  const isCompare = mode === 'compare';
  document.getElementById('compare-inputs').style.display = isCompare ? 'block' : 'none';
  document.getElementById('single-input').style.display   = isCompare ? 'none'  : 'block';

  // Update input label
  document.getElementById('input-label').textContent = MODE_LABELS[mode];

  // Update templates
  renderTemplates();

  hideError();
  document.getElementById('result-section').classList.remove('show');
}

// ─── Templates ────────────────────────────────────────────────────────────────
function renderTemplates() {
  const pills = document.getElementById('template-pills');
  pills.innerHTML = TEMPLATES[currentMode].map(q =>
    `<button class="template-pill" onclick="useTemplate(this)">${q}</button>`
  ).join('');
}

function useTemplate(btn) {
  // If result is shown, go straight to Q&A
  if (document.getElementById('result-section').classList.contains('show')) {
    document.getElementById('qa-input').value = btn.textContent;
    document.getElementById('qa-input').focus();
  } else {
    // Otherwise just note it — will be asked after analysis
    document.getElementById('qa-input').value = btn.textContent;
  }
}

// ─── Word count ───────────────────────────────────────────────────────────────
function updateWordCount() {
  const text  = document.getElementById('main-text').value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('word-count').textContent = words.toLocaleString() + ' words';
}

// ─── PDF upload ───────────────────────────────────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('dragover');
}
function onDragLeave() {
  document.getElementById('upload-zone').classList.remove('dragover');
}
function onDrop(e) {
  e.preventDefault();
  onDragLeave();
  const file = e.dataTransfer.files[0];
  if (file?.type === 'application/pdf') handlePdf(file);
  else showError('Please drop a valid PDF file.');
}
function handlePdf(file) {
  if (!file) return;
  selectedPdf = file;
  document.getElementById('file-pill-name').textContent = file.name;
  document.getElementById('file-pill').classList.add('show');
}
function removePdf() {
  selectedPdf = null;
  document.getElementById('pdf-input').value = '';
  document.getElementById('file-pill').classList.remove('show');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showError(msg) {
  const box = document.getElementById('error-box');
  box.textContent = '⚠ ' + msg;
  box.classList.add('show');
}
function hideError() {
  document.getElementById('error-box').classList.remove('show');
}
function setLoading(on) {
  document.getElementById('btn-analyze').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('btn-text').textContent  = on ? 'Analysing…' : '⬡ Analyze';
}

// ─── Stream helper ────────────────────────────────────────────────────────────
async function streamSSE(endpoint, body, onChunk) {
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const p = JSON.parse(data);
        if (p.error) throw new Error(p.error);
        if (p.text)  onChunk(p.text);
      } catch (e) {
        if (e.message !== 'Unexpected end of JSON input') throw e;
      }
    }
  }
}

// ─── Main analyze ─────────────────────────────────────────────────────────────
async function analyze() {
  hideError();

  const ticker = document.getElementById('ticker-tag').value.trim().toUpperCase();
  let inputText = '';

  // ── Gather text ──
  if (currentMode === 'compare') {
    const t1 = document.getElementById('compare-text-1').value.trim();
    const t2 = document.getElementById('compare-text-2').value.trim();
    if (!t1 || !t2) { showError('Please paste text in both document fields.'); return; }
    inputText = t1 + '\n\n=== DOCUMENT 2 ===\n\n' + t2;
  } else {
    inputText = document.getElementById('main-text').value.trim();

    // PDF overrides pasted text
    if (selectedPdf) {
      setLoading(true);
      try {
        const fileBase64 = await readFileAsBase64(selectedPdf);
        const res  = await fetch('/api/pdf', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fileBase64 }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error);
        inputText = data.text;
      } catch (err) {
        setLoading(false);
        showError('PDF error: ' + err.message);
        return;
      }
    }

    if (!inputText) { showError('Please paste text or upload a PDF.'); return; }
    if (inputText.split(/\s+/).length < 50) { showError('Please provide at least 50 words for a meaningful analysis.'); return; }
  }

  currentSource = inputText;
  qaHistory     = [];
  document.getElementById('qa-messages').innerHTML = '';

  setLoading(true);
  document.getElementById('result-section').classList.add('show');
  document.getElementById('result-meta').innerHTML = '';

  const resultEl = document.getElementById('result-text');
  resultEl.innerHTML = '';
  resultEl.className = 'result-text streaming';

  let rawText = '';

  try {
    await streamSSE('/api/analyze', { text: inputText, mode: currentMode },
      chunk => {
        rawText += chunk;
        resultEl.innerHTML = renderMarkdown(rawText);
      }
    );

    lastResult      = rawText;
    resultEl.className = 'result-text';

    // Auto-detect verdict for meta chips
    const meta = document.getElementById('result-meta');
    const verdictMatch = rawText.match(/##\s*Verdict[\s\S]*?(Bull|Bear|Neutral|Clean|Watch|High Risk)/i);
    if (verdictMatch) {
      const v    = verdictMatch[1].toLowerCase();
      const cls  = v.includes('bull') || v.includes('clean') ? 'bull'
                 : v.includes('bear') || v.includes('high')  ? 'bear'
                 : 'watch';
      meta.innerHTML = `
        <span class="meta-chip ${cls}">${verdictMatch[1].toUpperCase()}</span>
        <span class="meta-chip">${currentMode}</span>
        ${ticker ? `<span class="meta-chip" style="color:var(--amber);border-color:var(--amber)">${ticker}</span>` : ''}
      `;
    }

    saveToHistory(ticker || currentMode, rawText, currentMode);

  } catch (err) {
    resultEl.className = 'result-text';
    showError('Analysis failed: ' + err.message);
  } finally {
    setLoading(false);
  }
}

// ─── Markdown renderer (headers + bold + lists) ───────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .split('\n')
    .map(line => line.startsWith('<') ? line : `<p>${line}</p>`)
    .join('\n')
    .replace(/<p><\/p>/g, '');
}

// ─── Copy & export ────────────────────────────────────────────────────────────
function copyResult() {
  if (!lastResult) return;
  navigator.clipboard.writeText(lastResult).then(() => {
    const btn = document.querySelector('.action-btn');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}
function exportResult(format) {
  if (!lastResult) return;
  const ticker  = document.getElementById('ticker-tag').value.trim().toUpperCase() || 'analysis';
  const content = format === 'md' ? `# FinLens — ${ticker}\n\n${lastResult}` : lastResult;
  const blob    = new Blob([content], { type: 'text/plain' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = `finlens-${ticker.toLowerCase()}.${format}`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Q&A ──────────────────────────────────────────────────────────────────────
async function askQuestion() {
  const input    = document.getElementById('qa-input');
  const question = input.value.trim();
  if (!question || !currentSource) return;

  input.value = '';
  document.querySelector('.qa-send').disabled = true;

  const messagesEl = document.getElementById('qa-messages');
  const userEl = document.createElement('div');
  userEl.className = 'qa-msg user';
  userEl.textContent = question;
  messagesEl.appendChild(userEl);

  const aiEl = document.createElement('div');
  aiEl.className = 'qa-msg ai';
  messagesEl.appendChild(aiEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  qaHistory.push({ role: 'user', content: question });

  const ctx = `You are a senior financial analyst. The user has analyzed the following document:\n\n---\n${currentSource.slice(0, 6000)}\n---\n\nThe analysis produced:\n${lastResult.slice(0, 2000)}\n\nAnswer follow-up questions concisely and precisely. If you don't know, say so.`;

  let aiText = '';
  try {
    await streamSSE('/api/qa', { context: ctx, history: qaHistory },
      chunk => {
        aiText += chunk;
        aiEl.textContent = aiText;
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    );
    qaHistory.push({ role: 'assistant', content: aiText });
  } catch (err) {
    aiEl.textContent = 'Error: ' + err.message;
  }

  document.querySelector('.qa-send').disabled = false;
  input.focus();
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
const WL_KEY = 'finlens_watchlist';

function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WL_KEY)) || []; } catch { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}
function addTicker() {
  const input  = document.getElementById('ticker-input');
  const symbol = input.value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!symbol) return;
  const list = getWatchlist();
  if (!list.find(t => t.symbol === symbol)) {
    list.unshift({ symbol, added: new Date().toLocaleDateString() });
    saveWatchlist(list);
  }
  input.value = '';
  renderWatchlist();
}
function removeTicker(symbol) {
  saveWatchlist(getWatchlist().filter(t => t.symbol !== symbol));
  renderWatchlist();
}
function renderWatchlist() {
  const el   = document.getElementById('watchlist-items');
  const list = getWatchlist();
  if (!list.length) {
    el.innerHTML = '<div class="sidebar-empty">No tickers yet.</div>';
    return;
  }
  el.innerHTML = list.map(t => `
    <div class="ticker-item">
      <span class="ticker-symbol">${escHtml(t.symbol)}</span>
      <span class="ticker-note">Added ${t.added}</span>
      <button class="ticker-remove" onclick="removeTicker('${escHtml(t.symbol)}')">✕</button>
    </div>
  `).join('');
}

// ─── History ──────────────────────────────────────────────────────────────────
const HIST_KEY = 'finlens_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch { return []; }
}
function saveToHistory(label, result, mode) {
  const list = getHistory();
  list.unshift({ id: Date.now(), label, result, mode, date: new Date().toLocaleDateString() });
  localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, 50)));
  renderHistory();
}
function loadFromHistory(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item) return;
  lastResult = item.result;
  document.getElementById('result-text').innerHTML = renderMarkdown(item.result);
  document.getElementById('result-section').classList.add('show');
  document.getElementById('result-meta').innerHTML = `
    <span class="meta-chip">📂 From history</span>
    <span class="meta-chip">${item.mode}</span>
  `;
  toggleWatchlist();
  window.scrollTo({ top: document.getElementById('result-section').offsetTop - 20, behavior: 'smooth' });
}
function clearHistory() {
  localStorage.removeItem(HIST_KEY);
  renderHistory();
}
function renderHistory() {
  const el   = document.getElementById('history-list');
  const list = getHistory();
  if (!list.length) {
    el.innerHTML = '<div class="sidebar-empty">No past analyses.</div>';
    return;
  }
  el.innerHTML = list.map(item => `
    <div class="history-item" onclick="loadFromHistory(${item.id})">
      <div class="history-item-title">${escHtml(item.label)} — ${item.mode}</div>
      <div class="history-item-meta">${item.date}</div>
    </div>
  `).join('');
}

// ─── Sidebar toggle ───────────────────────────────────────────────────────────
function toggleWatchlist() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
  renderWatchlist();
  renderHistory();
}

// ─── PDF base64 helper ────────────────────────────────────────────────────────
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Util ─────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
renderTemplates();
renderWatchlist();
renderHistory();
