/**
 * Script to inject `requireAuth` into all unprotected routes in server.js
 * Runs once, then can be deleted.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'src', 'server.js');

let src = readFileSync(serverPath, 'utf8');

// Routes that should NOT get requireAuth added (public or already handled):
// - /api/health                — public health check
// - /api/auth/*                — already handled
// - /api/settings GET          — already public (written above)
// - /api/settings PUT          — already has requireAuth
// - /api/webhooks/whatsapp    — authenticated via X-Hub-Signature-256
// - /api/test/whatsapp         — uses its own X-Test-Secret header guard

const PROTECTED_ROUTES = [
  // analytics
  { from: `app.get('/api/analytics', requireAuth, async`, to: null },  // already done

  // customers
  { from: `app.get('/api/customers', async`, to: `app.get('/api/customers', requireAuth, async` },
  { from: `app.get('/api/customers/:id', async`, to: `app.get('/api/customers/:id', requireAuth, async` },
  { from: `app.post('/api/customers', async`, to: `app.post('/api/customers', requireAuth, async` },
  { from: `app.put('/api/customers/:id', async`, to: `app.put('/api/customers/:id', requireAuth, async` },
  { from: `app.delete('/api/customers/:id', async`, to: `app.delete('/api/customers/:id', requireAuth, async` },
  { from: `app.post('/api/customers/:id/opt-out', async`, to: `app.post('/api/customers/:id/opt-out', requireAuth, async` },
  { from: `app.post('/api/customers/:id/opt-in', async`, to: `app.post('/api/customers/:id/opt-in', requireAuth, async` },
  { from: `app.post('/api/customers/import', async`, to: `app.post('/api/customers/import', requireAuth, async` },

  // demo seed
  { from: `app.post('/api/demo/seed', async`, to: `app.post('/api/demo/seed', requireAuth, async` },

  // templates
  { from: `app.get('/api/templates', async`, to: `app.get('/api/templates', requireAuth, async` },

  // campaigns
  { from: `app.get('/api/campaigns', async`, to: `app.get('/api/campaigns', requireAuth, async` },
  { from: `app.get('/api/campaigns/recipients/preview', async`, to: `app.get('/api/campaigns/recipients/preview', requireAuth, async` },
  { from: `app.get('/api/campaigns/:id', async`, to: `app.get('/api/campaigns/:id', requireAuth, async` },
  { from: `app.post('/api/campaigns', async`, to: `app.post('/api/campaigns', requireAuth, async` },
  { from: `app.post('/api/campaigns/:id/cancel', async`, to: `app.post('/api/campaigns/:id/cancel', requireAuth, async` },
  { from: `app.post('/api/campaigns/:id/dry-run', async`, to: `app.post('/api/campaigns/:id/dry-run', requireAuth, async` },
  { from: `app.get('/api/campaigns/:id/messages', async`, to: `app.get('/api/campaigns/:id/messages', requireAuth, async` },

  // messages
  { from: `app.get('/api/messages', async`, to: `app.get('/api/messages', requireAuth, async` },

  // auto-replies
  { from: `app.get('/api/autoreplies', async`, to: `app.get('/api/autoreplies', requireAuth, async` },
  { from: `app.post('/api/autoreplies', async`, to: `app.post('/api/autoreplies', requireAuth, async` },
  { from: `app.put('/api/autoreplies/:id', async`, to: `app.put('/api/autoreplies/:id', requireAuth, async` },
  { from: `app.delete('/api/autoreplies/:id', async`, to: `app.delete('/api/autoreplies/:id', requireAuth, async` },

  // conversations
  { from: `app.get('/api/conversations', async`, to: `app.get('/api/conversations', requireAuth, async` },
  { from: `app.post('/api/conversations/:id/resolve', async`, to: `app.post('/api/conversations/:id/resolve', requireAuth, async` },
];

let changed = 0;
for (const rule of PROTECTED_ROUTES) {
  if (!rule.to) continue;  // already correct
  if (src.includes(rule.to)) {
    console.log(`[SKIP] Already has requireAuth: ${rule.to.slice(0, 60)}`);
    continue;
  }
  if (src.includes(rule.from)) {
    src = src.replaceAll(rule.from, rule.to);
    changed++;
    console.log(`[ADD]  requireAuth → ${rule.to.slice(0, 60)}`);
  } else {
    console.warn(`[MISS] Pattern not found: ${rule.from.slice(0, 60)}`);
  }
}

writeFileSync(serverPath, src, 'utf8');
console.log(`\nDone. Modified ${changed} routes.`);
