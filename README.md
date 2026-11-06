# DegreeSight sales intake (Vercel)

Static page + one serverless function (`api/intake.js`) that proxies to n8n with a shared key.

Deploy: `vercel --prod` from this folder (or import the folder in the Vercel dashboard), then set
the environment variable `INTAKE_KEY` (Production) to the key held in the n8n workflows' webhook
"Only run if" condition, and redeploy. Optional: `N8N_WEBHOOK_BASE` (defaults to
https://degreesight.app.n8n.cloud/webhook).

Open `/` for the demo. Real intakes open from the Slack DM: `/?deal=<HubSpot deal id>&t=<token>`.

`/feedback` is the rep feedback form (duplicates, attribution, bad data...). Same sign-in as `/`; `api/feedback.js` forwards to the n8n workflow **Sales Rep Feedback API** (`Mxg7MhjFRNP2NLuB`), which appends a row to the Google Sheet *SalesRep Feedback* and DMs Daniel. Prefill: `/feedback?institution=<name>&deal=<HubSpot deal id>`.

`/feedback/board` is the feedback board (KPIs, charts, ticket table, weekly reviews for admins). Data: n8n `sales-intake/feedback-board`; weekly reviews come from the **Feedback Weekly Review** workflow (`HsnVLmVJNYYqkp4F`, Monday 08:00 SP) and the **Feedback Triage Agent** (`pYxaD01xyOQehXOV`) handles each new ticket with Slack approval.
