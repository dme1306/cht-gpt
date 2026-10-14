const PRIMARY_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODEL = 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function amount(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function inr(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value); }
function fastAnswer(question, records) {
  const q = String(question || '').toLowerCase();
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  let filtered = records.slice();
  const company = /crius\s*fnd|criusfnd|\bfnd\b/.test(q) ? 'CRIUS FND' : /\bchiros\b/.test(q) ? 'CHIROS' : /\bcrius\b/.test(q) ? 'CRIUS' : null;
  const yearMatch = q.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const monthIndex = months.findIndex(m => q.includes(m) || q.includes(m.slice(0,3)));
  if (company) filtered = filtered.filter(r => String(r.location || r.company || '').toUpperCase() === company);
  if (year) filtered = filtered.filter(r => Number(r.fy) === year);
  if (monthIndex >= 0) filtered = filtered.filter(r => Number(r.month) === monthIndex + 1 || String(r.month_year || '').toLowerCase().startsWith(months[monthIndex].slice(0,3)));
  if (!filtered.length) return null;
  if (/\b(total|how much|sum|spend|spent|expenses?)\b/.test(q) && !/\b(top|highest|lowest|compare|trend|average|avg)\b/.test(q)) {
    const total = filtered.reduce((sum, r) => sum + amount(r.amount), 0);
    return `<div><b>Total expense${company ? ' for ' + company : ''}${year ? ' in ' + year : ''}${monthIndex >= 0 ? ' for ' + months[monthIndex] : ''}</b></div><div style="font-size:24px;font-weight:700;margin:8px 0;">${inr(total)}</div><div style="font-size:12px;">${filtered.length.toLocaleString('en-IN')} transactions · average ${inr(total / filtered.length)}</div>`;
  }
  return null;
}
async function groqCall(apiKey, model, question, records) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1400,
      messages: [
        { role: 'system', content: 'You are the expense-analysis assistant for Crius Life Science. Answer only from the supplied expense records. Do not invent figures. Currency is INR (₹). Financial year values are supplied in fy. If a calculation is requested, calculate it from the data. Be concise but show key totals and how you reached them. You may return simple HTML fragments for readable formatting; do not include scripts or event handlers.' },
        { role: 'user', content: `Question: ${question}\n\nExpense records (JSON):\n${JSON.stringify(records).slice(0, 90000)}` }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Groq API ${response.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && (typeof choice.message.content === 'string' ? choice.message.content : Array.isArray(choice.message.content) ? choice.message.content.map(p => p && p.text || '').join('') : '');
  const answer = (content || (choice && choice.message && choice.message.reasoning) || '').trim();
  if (!answer) throw new Error('Groq returned an empty answer. Try asking the question again.');
  return answer;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const expectedKey = process.env.DASHBOARD_ACCESS_KEY;
  if (!expectedKey) return res.status(503).json({ error: 'Dashboard is not configured yet. Set DASHBOARD_ACCESS_KEY in Vercel environment variables.' });
  const suppliedKey = req.headers['x-dashboard-key'];
  if (typeof suppliedKey !== 'string' || suppliedKey !== expectedKey) return res.status(401).json({ error: 'Access denied. Enter the dashboard access key and refresh.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  try {
    const body = req.body || {};
    const question = String(body.question || '').trim();
    const records = Array.isArray(body.records) ? body.records : [];
    if (!question) return res.status(400).json({ error: 'Please ask a question.' });
    if (!records.length) return res.status(400).json({ error: 'No expense data available. Please refresh the dashboard.' });
    if (!body.skipFast) {
      const answer = fastAnswer(question, records);
      if (answer) return res.status(200).json({ answer });
    }
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing GROQ_API_KEY environment variable. Add your Groq key in Vercel Project Settings → Environment Variables.' });
    try {
      const answer = await groqCall(apiKey, PRIMARY_MODEL, question, records);
      return res.status(200).json({ answer });
    } catch (firstError) {
      console.warn('Primary Groq model failed; trying fallback:', firstError.message);
      const answer = await groqCall(apiKey, FALLBACK_MODEL, question, records);
      return res.status(200).json({ answer });
    }
  } catch (error) {
    console.error('AI API error:', error);
    return res.status(500).json({ error: error && error.message ? error.message : 'AI request failed.' });
  }
};
