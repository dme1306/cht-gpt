Crius Life Science Expense Dashboard — Vercel version

**Security note:** this repository is currently public, so its source code is visible. Never commit Google service-account credentials, Groq keys, or the dashboard access key. Because this app serves financial information, consider making the repository private before production. The shared access key protects the data APIs, but it is a basic shared-key gate rather than individual user accounts.
This is the migration of the existing Apps Script dashboard to a standard website plus serverless APIs. The existing dashboard UI (charts, filters, reports, exports, and assistant panel) is retained in `public/index.html`. The `google.script.run` calls are replaced with `fetch('/api/dashboard')` and `fetch('/api/ask')`.
Project layout
`public/index.html` — dashboard frontend
`api/dashboard.js` — reads the Google Sheet and returns normalized expense rows
`api/ask.js` — AI assistant using Groq, with a small local total-expense answer shortcut
`vercel.json` — Vercel function configuration
Before deploying
1. Create a Google Cloud service account
Open Google Cloud Console and create/select a project.
Enable Google Sheets API for that project.
Create a service account and generate a JSON key.
Open the Google Sheet and share it with the service account's `client_email` as Viewer.
Keep the downloaded service-account JSON private. Never commit it to GitHub.
2. Set environment variables in Vercel
In Vercel → Project → Settings → Environment Variables, add:
`GOOGLE_SERVICE_ACCOUNT_JSON` — the entire contents of the service-account JSON key, pasted as one JSON value
`GROQ_API_KEY` — your Groq API key (optional if you only want dashboard totals; required for AI answers beyond the built-in total shortcut)
`DASHBOARD_ACCESS_KEY` — a long, private password that users must enter to read expense data
`GOOGLE_SHEET_ID` — `1GtvrpKr-ONenL2Wx8XAl61NTH-eKkQDAlqSkk_x3tbk` (optional; this is the default)
`GOOGLE_SHEET_NAME` — `Till Sep2026` (optional; this is the default)
Set them for Production and Preview if you want both environments to work. Do not put API keys in `public/index.html` or any frontend JavaScript.
3. Push to GitHub and deploy
Connect this existing GitHub repository to Vercel. Since the repository is public, consider changing it to private before production. In Vercel, choose Add New → Project, import `dme1306/cht-gpt`, and deploy the `main1` branch.
Add the environment variables before or immediately after the first deployment, then redeploy after adding/changing them.
Open the deployment URL. The dashboard should load from `/api/dashboard`; the AI assistant calls `/api/ask`.
Local development
Requires Node.js 20+.
```bash
npm install
npx vercel dev
```
Set the environment variables in a local `.env.local` file (do not commit it). Vercel CLI reads that file for local development.
Notes / validation
The backend expects a header row and maps common variants of the columns `Location`, `Particulars`, `Expenses A/C Name`/`AccountGroup`, `DESCR`, `TXNREMARK`, `Expensebal`, `MONTH`, `Month-Year`, and `Financial Year`.
Only `CRIUS`, `CHIROS`, and `CRIUS FND` locations are included, matching the original dashboard's configured company list.
If your live sheet uses a different tab name, change `GOOGLE_SHEET_NAME` in Vercel.
The first financial-year number is used if the sheet stores a value like `2025-26`. If your existing Apps Script `parseFY()` intentionally uses a different convention, compare a few known records after deployment and adjust `financialYear()` in `api/dashboard.js` accordingly.
This bundle is a migration scaffold based on the frontend and backend details provided; it has not been deployed against your private Google Sheet or tested with your live Groq key.
