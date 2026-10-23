# n8n workflows behind this page

- **Deal Stage Change -> Sales Intake Dossier** (`cGH3VM1adBmu0sAw`): on any DS Sales Team deal stage change, or `POST /webhook/sales-intake/build`, reads HubSpot (deal, stage, owner, company, contacts, meetings, notes, emails, calls), Starbridge, Confluence Meeting Transcriptions and Zoom, asks Claude to fill the checklist with quotes, applies `assess.js`, upserts the `sales_intake_dossiers` data table and DMs the rep the intake link.
- **Sales Intake API** (`WwscS3QUNjXUYdyN`): `POST /webhook/sales-intake/get` and `/save`, called only by `api/intake.js` with the `x-intake-key` header.

`spec.json` is the single source for the 18 items and their allowed values; `assess.js` holds the install-base specialist rules and the QUOTE gate. Both are embedded in the n8n Code nodes too; change them here and copy them into "Parse and Score" and "Build Claude Request".
