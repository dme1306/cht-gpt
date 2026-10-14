const { google } = require('googleapis');

const DEFAULT_SHEET_ID = '1GtvrpKr-ONenL2Wx8XAl61NTH-eKkQDAlqSkk_x3tbk';
const DEFAULT_SHEET_NAME = 'Till Sep2026';
const ALLOWED_LOCATIONS = new Set(['CRIUS', 'CHIROS', 'CRIUS FND']);

function clean(value) {
  return String(value == null ? '' : value).trim();
}
function key(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}
function findColumn(headers, aliases) {
  const normalized = headers.map(key);
  for (const alias of aliases) {
    const idx = normalized.indexOf(key(alias));
    if (idx >= 0) return idx;
  }
  // Allow common export prefixes/suffixes while avoiding arbitrary column matches.
  for (const alias of aliases) {
    const wanted = key(alias);
    const idx = normalized.findIndex(h => h && (h.includes(wanted) || wanted.includes(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}
function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = clean(value).replace(/[₹,\s]/g, '');
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.+-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : 0;
}
function financialYear(value) {
  const s = clean(value);
  if (!s) return 0;
  const match = s.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : 0;
}
function monthNumber(value, monthYear) {
  const names = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const s = clean(value);
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 12) return n;
  }
  const lower = s.toLowerCase();
  for (const [prefix, n] of Object.entries(names)) if (lower.includes(prefix)) return n;
  const m = clean(monthYear).toLowerCase().match(/[a-z]{3,}/);
  return m ? (names[m[0].slice(0,3)] || 0) : 0;
}
function serviceAccountAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable. Add the service-account JSON in Vercel Project Settings → Environment Variables.');
  let credentials;
  try { credentials = JSON.parse(raw); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the complete service-account JSON as one environment-variable value.'); }
  return new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  try {
    const auth = serviceAccountAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_NAME || DEFAULT_SHEET_NAME;
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName.replace(/'/g, "''")}'!A:ZZ`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    const values = result.data.values || [];
    if (!values.length) return res.status(200).json({ rows: [], headers: [], debug: { rowCount: 0 } });
    const headers = values[0].map(clean);
    const map = {
      location: findColumn(headers, ['Location', 'Company', 'Business Unit']),
      particulars: findColumn(headers, ['Particulars', 'Particular', 'Expense Particulars']),
      account: findColumn(headers, ['Expenses A/C Name', 'Expense A/C Name', 'Account Name', 'AccountGroup', 'Account Group', 'Expenses Account']),
      descr: findColumn(headers, ['DESCR', 'Description', 'Narration']),
      txn_remark: findColumn(headers, ['TXNREMARK', 'Transaction Remark', 'Txn Remark', 'Remarks']),
      amount: findColumn(headers, ['Expensebal', 'Expense Balance', 'Amount', 'Expense Amount', 'Debit']),
      month: findColumn(headers, ['MONTH', 'Month']),
      month_year: findColumn(headers, ['Month-Year', 'Month Year', 'MonthYear']),
      fy: findColumn(headers, ['Financial Year', 'FinancialYear', 'FY', 'Financial Yr'])
    };
    const rows = [];
    for (const row of values.slice(1)) {
      const get = name => map[name] >= 0 ? row[map[name]] : '';
      const location = clean(get('location')).toUpperCase();
      if (!ALLOWED_LOCATIONS.has(location)) continue;
      const particulars = clean(get('particulars'));
      const account = clean(get('account')) || 'Uncategorized';
      const descr = clean(get('descr'));
      const txn_remark = clean(get('txn_remark'));
      const amountValue = amount(get('amount'));
      const month_year = clean(get('month_year'));
      const month_num = monthNumber(get('month'), month_year);
      const fy = financialYear(get('fy'));
      // Ignore fully blank lines; preserve zero/negative transactions if they contain meaningful fields.
      if (!particulars && !account && !descr && !txn_remark && !amountValue) continue;
      rows.push({ location, particulars, account, descr, txn_remark, amount: amountValue, fy, month_num, month_year });
    }
    return res.status(200).json({ rows, headers, debug: { sourceRows: Math.max(0, values.length - 1), returnedRows: rows.length, columnMap: map } });
  } catch (error) {
    console.error('Dashboard API error:', error);
    const message = error && error.message ? error.message : 'Could not load spreadsheet data.';
    return res.status(500).json({ error: message });
  }
};
