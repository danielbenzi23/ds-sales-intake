# DegreeSight sales intake (Vercel)

Static page + one serverless function (`api/intake.js`) that proxies to n8n with a shared key.

Deploy: `vercel --prod` from this folder (or import the folder in the Vercel dashboard), then set
the environment variable `INTAKE_KEY` (Production) to the key held in the n8n workflows' webhook
"Only run if" condition, and redeploy. Optional: `N8N_WEBHOOK_BASE` (defaults to
https://degreesight.app.n8n.cloud/webhook).

Open `/` for the demo. Real intakes open from the Slack DM: `/?deal=<HubSpot deal id>&t=<token>`.
