# GS Shop Alangulam — WhatsApp Campaign Demo

A demo-ready React + Express + MongoDB application for creating campaigns, checking customer opt-in, scheduling campaigns, and tracking simulated message statuses.

## Safety defaults
- `DRY_RUN=true` by default.
- This project **does not send WhatsApp messages** in demo mode. The scheduler only creates simulated `dry_run` message logs.
- No customer list is included. Seed data uses clearly fictional example contacts.
- Live sending requires explicit configuration, Meta setup, approved template validation, customer consent, and a deliberate change to `DRY_RUN=false`. Do not change this for the demo.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB / Mongoose
- Scheduling: node-cron (for this single-instance demo)
- WhatsApp: Meta Cloud API adapter, guarded by dry-run mode

## Prerequisites
- Node.js 20+
- MongoDB local or MongoDB Atlas connection
- Meta WhatsApp Business Platform account only if later enabling live mode

## Run locally

### 1. Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```
Edit `.env` and set `MONGODB_URI`. Leave `DRY_RUN=true`.

### 2. Frontend
Open another terminal:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
Open the URL printed by Vite (usually http://localhost:5173).

## Demo workflow
1. Click **Load demo customers** to create fictional opted-in and non-opted-in records.
2. Create a campaign:
   - Name: Festival Special Offers
   - Discount: Up to 20% off
   - Audience: All opted-in customers
   - Schedule: 2026-10-25 10:00 IST (the UI accepts local date/time; server stores ISO time)
   - Template: `gs_festival_offer` (demo template marked approved)
3. Preview and save campaign.
4. The dashboard shows campaign scheduling and simulated message status. No WhatsApp API request is made while dry-run is enabled.
5. For an immediate dry-run test, create a campaign scheduled a minute in the future and wait for the scheduler, or use **Run dry-run now**.

## API routes
- `GET /api/health`
- `GET /api/customers`
- `POST /api/demo/seed`
- `GET /api/templates`
- `GET /api/campaigns`
- `POST /api/campaigns`
- `POST /api/campaigns/:id/dry-run`
- `GET /api/campaigns/:id/messages`
- `GET /api/messages`
- `GET /api/webhooks/whatsapp` — Meta webhook verification endpoint
- `POST /api/webhooks/whatsapp` — delivery-status webhook receiver

## WhatsApp setup notes for a future live deployment
1. Create a Meta developer app and add WhatsApp.
2. Use a test number to verify the Cloud API independently.
3. Configure a business-owned WhatsApp Business Account and phone number.
4. Submit a correctly categorized template for approval. The demo template in MongoDB is only mock data; it is not a Meta-approved template.
5. Configure and verify webhook subscriptions.
6. Securely store `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, and business/WABA linkage. Never expose tokens in the frontend.
7. Obtain and retain valid opt-in evidence, handle opt-outs, and obey current Meta messaging rules and pricing.
8. Test webhooks, retries, deduplication and tenant separation before any live send.
9. Only after deliberate review set `DRY_RUN=false`. The API adapter is guarded and requires the correct template and consent per recipient. Never send to people who did not opt in.

## Important production limitations
This is a functional demo scaffold, not a production-hardened SaaS. Before selling it, add authentication, tenant-scoped authorization, rate limits, durable queueing (e.g. Redis/BullMQ), audit logs, secrets management, monitoring, backups, data export/deletion, billing, and an admin approval workflow. The current demo endpoints are unauthenticated and must not be exposed publicly with real data.
