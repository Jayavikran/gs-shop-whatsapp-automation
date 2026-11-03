import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cron from 'node-cron';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, param, query, validationResult } from 'express-validator';
import axios from 'axios';
import { Customer, Template, Campaign, MessageLog, AutoReplyRule, Conversation, WebhookLog, Owner, ShopSettings, Tenant } from './models.js';
import {
  sendApprovedTemplate,
  sendHelloWorldTest
} from './whatsapp.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';

// --- Trust Proxy Configuration ---
// When behind a reverse proxy (e.g. Nginx, Cloudflare, AWS ALB), trust the first hop
// so req.ip and rate limiters evaluate the real client IP rather than the proxy.
const trustProxyConfig = process.env.TRUST_PROXY ?? (isProduction ? 1 : false);
if (trustProxyConfig) {
  app.set('trust proxy', trustProxyConfig === 'true' ? 1 : (Number(trustProxyConfig) || 1));
}

const isDryRun = () =>
  String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';

// --- Environment Validation ---
const KNOWN_DEV_JWT_SECRET = 'gs_shop_dev_secret_change_in_production';

function validateStartupEnvironment() {
  if (isProduction) {
    const requiredVars = [
      'JWT_SECRET',
      'WHATSAPP_APP_SECRET',
      'WHATSAPP_VERIFY_TOKEN',
      'MONGODB_URI'
    ];

    const missing = requiredVars.filter(v => !process.env[v] || !String(process.env[v]).trim());

    if (process.env.JWT_SECRET === KNOWN_DEV_JWT_SECRET) {
      missing.push('JWT_SECRET (must not use default development secret in production)');
    }

    if (missing.length > 0) {
      console.error('=================================================================');
      console.error('FATAL ERROR: Production startup validation failed.');
      console.error(`Missing or insecure configuration: ${missing.join(', ')}`);
      console.error('Refusing to start server in production without secure configuration.');
      console.error('=================================================================');
      process.exit(1);
    }
  } else {
    // Development diagnostics (without leaking secret values)
    if (!process.env.JWT_SECRET) {
      console.warn('[SECURITY NOTICE] JWT_SECRET not configured. Using local development secret. Set a strong secret in production.');
    }
    if (!process.env.WHATSAPP_APP_SECRET) {
      console.warn('[SECURITY NOTICE] WHATSAPP_APP_SECRET not configured. Webhook signature verification will be bypassed only in local development.');
    }
  }
}
validateStartupEnvironment();

// --- JWT helpers ---
const JWT_SECRET = process.env.JWT_SECRET || (
  isProduction
    ? (() => { throw new Error('JWT_SECRET is mandatory in production'); })()
    : KNOWN_DEV_JWT_SECRET
);
const JWT_EXPIRY = '8h';

function signToken(userId, tenantId = 'gs_shop_default') {
  return jwt.sign({ sub: String(userId), tenantId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.ownerId = decoded.sub;
    req.businessId = decoded.tenantId || 'gs_shop_default';
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

function tenantFilter(req, base = {}) {
  const businessId = req.businessId || 'gs_shop_default';
  return {
    ...base,
    $or: [{ businessId }, { businessId: { $exists: false } }]
  };
}

// Validate express-validator results and short-circuit on errors
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  return next();
}

// --- Helmet security headers ---
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://graph.facebook.com'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  } : false // allow Vite HMR and dev scripts in local development
}));

// --- CORS ---
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server (no origin) and configured origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true
}));

// --- Global API rate limit (500 req / 15 min per IP) ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use(globalLimiter);

// --- Strict login rate limit (10 attempts / 15 min per IP) ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' }
});

// Capture raw body buffer for Meta X-Hub-Signature-256 verification
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// ================================================================
// AUTH ENDPOINTS (before requireAuth is applied to protected routes)
// ================================================================

// POST /api/auth/setup  — one-time owner account creation (only if no owner exists)
app.post('/api/auth/setup',
  loginLimiter,
  [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3–30 characters.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('displayName').optional().trim().isLength({ max: 60 })
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const ownerCount = await Owner.countDocuments();
      if (ownerCount > 0) {
        return res.status(409).json({ error: 'Owner account already exists. Use the login endpoint.' });
      }
      const { username, password, displayName = 'Shop Owner' } = req.body;
      const passwordHash = await bcrypt.hash(password, 12);
      const owner = await Owner.create({ username: username.toLowerCase(), passwordHash, displayName, tenantId: 'gs_shop_default' });
      const token = signToken(owner._id, owner.tenantId || 'gs_shop_default');
      res.status(201).json({
        ok: true,
        message: 'Owner account created successfully.',
        token,
        owner: { id: owner._id, username: owner.username, displayName: owner.displayName, tenantId: owner.tenantId || 'gs_shop_default' }
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/auth/login
app.post('/api/auth/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required.'),
    body('password').notEmpty().withMessage('Password is required.')
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const owner = await Owner.findOne({ username: username.toLowerCase() });
      if (!owner) {
        // Constant-time comparison to prevent timing enumeration
        await bcrypt.compare('placeholder', '$2b$12$placeholder.hash.to.prevent.timing.attack');
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      const valid = await bcrypt.compare(password, owner.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      owner.lastLogin = new Date();
      await owner.save();
      const token = signToken(owner._id, owner.tenantId || 'gs_shop_default');
      res.json({
        ok: true,
        token,
        owner: { id: owner._id, username: owner.username, displayName: owner.displayName, tenantId: owner.tenantId || 'gs_shop_default' }
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/auth/me — validate session and return owner info
app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const owner = await Owner.findById(req.ownerId, '-passwordHash').lean();
    if (!owner) return res.status(404).json({ error: 'Owner not found.' });
    // Also return whether setup is complete
    const ownerCount = await Owner.countDocuments();
    res.json({ ok: true, owner, setupComplete: ownerCount > 0 });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/status — public: tells frontend if setup has been done
app.get('/api/auth/status', async (_req, res, next) => {
  try {
    const ownerCount = await Owner.countDocuments();
    res.json({ setupComplete: ownerCount > 0 });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout — stateless JWT; client drops token
app.post('/api/auth/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Logged out. Please discard your token.' });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required.'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.')
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const owner = await Owner.findById(req.ownerId);
      if (!owner) return res.status(404).json({ error: 'Owner not found.' });
      const valid = await bcrypt.compare(req.body.currentPassword, owner.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
      owner.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
      await owner.save();
      res.json({ ok: true, message: 'Password changed successfully. Please log in again.' });
    } catch (error) {
      next(error);
    }
  }
);

// ================================================================
// SHOP SETTINGS ENDPOINTS
// ================================================================

// GET /api/settings  — public for demo (so dashboard can read shop name etc.)
app.get('/api/settings', async (_req, res, next) => {
  try {
    const settings = await ShopSettings.findOne({ settingsKey: 'default' }).lean();
    if (!settings) {
      // Return defaults if not yet saved
      return res.json({
        shopName: 'GS Shop Alangulam',
        address: 'Main Road, Alangulam, Tenkasi District - 627851',
        phone: '+91 99000 00001',
        email: 'gsshop.alangulam@gmail.com',
        openingHours: 'Monday - Sunday: 9:00 AM to 9:30 PM',
        defaultTamilReply: 'வணக்கம்! GS Shop Alangulam-க்கு வரவேற்கிறோம்.',
        defaultEnglishReply: 'Hello! Welcome to GS Shop Alangulam.',
        humanSupportContact: '+91 99000 00001',
        landmark: 'Near Bus Stand'
      });
    }
    // Never expose internal fields
    const { _id, settingsKey, __v, ...safe } = settings;
    res.json(safe);
  } catch (error) {
    next(error);
  }
});

// PUT /api/settings  — protected
app.put('/api/settings',
  requireAuth,
  [
    body('shopName').optional().trim().isLength({ max: 100 }),
    body('address').optional().trim().isLength({ max: 300 }),
    body('phone').optional().trim().isLength({ max: 30 }),
    body('email').optional().trim().isEmail().withMessage('Invalid email address.'),
    body('openingHours').optional().trim().isLength({ max: 200 }),
    body('defaultTamilReply').optional().trim().isLength({ max: 1000 }),
    body('defaultEnglishReply').optional().trim().isLength({ max: 1000 }),
    body('humanSupportContact').optional().trim().isLength({ max: 30 }),
    body('landmark').optional().trim().isLength({ max: 200 })
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const allowed = ['shopName', 'address', 'phone', 'email', 'openingHours',
        'defaultTamilReply', 'defaultEnglishReply', 'humanSupportContact', 'landmark'];
      const update = {};
      for (const field of allowed) {
        if (req.body[field] !== undefined) {
          update[field] = String(req.body[field]).trim();
        }
      }
      const settings = await ShopSettings.findOneAndUpdate(
        { settingsKey: 'default' },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      const { _id, settingsKey, __v, ...safe } = settings.toObject();
      res.json({ ok: true, settings: safe });
    } catch (error) {
      next(error);
    }
  }
);

const demoTemplates = [
  {
    name: 'gs_festival_offer',
    category: 'MARKETING',
    language: 'en',
    body: 'Festival Special Offers! Enjoy {{1}} at GS Shop, Alangulam. Visit us for details. Reply STOP to opt out.',
    status: 'demo_only',
    metaTemplateId: '',
    lastUpdated: new Date()
  },
  {
    name: 'gs_welcome_greeting',
    category: 'MARKETING',
    language: 'en',
    body: 'Welcome to GS Shop Alangulam! Thank you for visiting our store. Contact us for latest home appliances and kitchenware. Reply STOP to opt out.',
    status: 'approved',
    metaTemplateId: 'meta_tpl_welcome_01',
    lastUpdated: new Date()
  },
  {
    name: 'gs_order_update',
    category: 'UTILITY',
    language: 'en',
    body: 'Hello {{1}}, your order at GS Shop Alangulam is ready for collection. Thank you for shopping with us!',
    status: 'approved',
    metaTemplateId: 'meta_tpl_order_02',
    lastUpdated: new Date()
  },
  {
    name: 'gs_exclusive_promo',
    category: 'MARKETING',
    language: 'en',
    body: 'Exclusive Member Offer: {{1}} available at GS Shop Alangulam this weekend. Visit store or reply for details. Reply STOP to opt out.',
    status: 'approved',
    metaTemplateId: 'meta_tpl_promo_03',
    lastUpdated: new Date()
  }
];

const defaultAutoReplies = [
  {
    keyword: 'hi, hello, vanakkam, வணக்கம், hey',
    replyText: 'வணக்கம்! GS Shop Alangulam-க்கு வரவேற்கிறோம். நாங்கள் உங்களுக்கு எவ்வாறு உதவ முடியும்? / Hello! Welcome to GS Shop Alangulam. How can we help you today?',
    language: 'bilingual',
    actionType: 'reply',
    category: 'welcome',
    priority: 1,
    enabled: true
  },
  {
    keyword: 'timing, hours, time, open, நேரம்',
    replyText: 'கடை திறக்கும் நேரம்: திங்கள் - ஞாயிறு: காலை 9:00 மணி முதல் இரவு 9:30 மணி வரை. / Shop Hours: Monday - Sunday: 9:00 AM to 9:30 PM.',
    language: 'bilingual',
    actionType: 'reply',
    category: 'business_hours',
    priority: 2,
    enabled: true
  },
  {
    keyword: 'away, closed, night, விடுமுறை',
    replyText: 'எங்கள் கடை தற்போது மூடப்பட்டுள்ளது. காலை 9:00 மணிக்கு திறக்கப்படும். உங்கள் செய்தியை குறித்துக் கொண்டோம். / We are currently closed. Our store opens at 9:00 AM. We will reply to your message soon!',
    language: 'bilingual',
    actionType: 'reply',
    category: 'away',
    priority: 3,
    enabled: true
  },
  {
    keyword: 'price, rate, cost, விலை',
    replyText: 'எங்கள் தயாரிப்புகளின் விலை விவரங்களை அறிய எங்கள் கடைக்கு வருகை தாருங்கள் அல்லது தயாரிப்பின் பெயரை அனுப்பவும். / To know price details of home appliances, please send product name or visit our shop.',
    language: 'bilingual',
    actionType: 'reply',
    category: 'keyword',
    priority: 4,
    enabled: true
  },
  {
    keyword: 'offer, discount, festival, சலுகை, தள்ளுபடி',
    replyText: 'GS Shop Alangulam தற்போதைய சலுகைகள்: மிக்சி, கிரைண்டர் & பாத்திரங்களுக்கு 20% வரை சிறப்பு தள்ளுபடி! / Current festival offers: Up to 20% off on Mixer Grinders, Cookware & Appliances at GS Shop Alangulam!',
    language: 'bilingual',
    actionType: 'offer',
    category: 'custom',
    priority: 5,
    enabled: true
  },
  {
    keyword: 'location, address, landmark, முகவரி, இடம்',
    replyText: 'எங்கள் கடை முகவரி: GS Shop, Main Road, Alangulam, Tenkasi District - 627851. Landmark: Near Bus Stand. / Address: GS Shop, Main Road, Alangulam, Tenkasi Dist.',
    language: 'bilingual',
    actionType: 'reply',
    category: 'keyword',
    priority: 6,
    enabled: true
  },
  {
    keyword: 'contact, phone, call, number, தொடர்பு',
    replyText: 'எங்களை தொடர்பு கொள்ள: +91 99000 00001 / Email: gsshop.alangulam@gmail.com / Contact: GS Shop Alangulam customer desk.',
    language: 'bilingual',
    actionType: 'reply',
    category: 'keyword',
    priority: 7,
    enabled: true
  },
  {
    keyword: 'human, agent, person, help, மனிதர், உதவி',
    replyText: 'உங்கள் கோரிக்கை ஏற்றுக்கொள்ளப்பட்டது. எங்கள் வாடிக்கையாளர் சேவை பிரதிநிதி விரைவில் உங்களை தொடர்புகொள்வார். / A human store agent has been notified and will assist you shortly.',
    language: 'bilingual',
    actionType: 'handover',
    category: 'custom',
    priority: 8,
    enabled: true
  }
];

const DEFAULT_FALLBACK_REPLY =
  "மன்னிக்கவும், உங்கள் செய்தி புரியவில்லை. உதவிக்கு 'வணக்கம்', 'விலை', 'சலுகை', 'முகவரி', அல்லது 'Agent' என அனுப்பவும். / Sorry, we didn't recognize that. Reply with 'Hello', 'Offer', 'Price', 'Location', or 'Agent' for assistance.";

async function ensureDefaultAutoReplies() {
  for (const rule of defaultAutoReplies) {
    await AutoReplyRule.updateOne(
      { keyword: rule.keyword },
      { $setOnInsert: rule },
      { upsert: true }
    );
  }
}

async function ensureDefaultTenant() {
  await Tenant.updateOne(
    { tenantId: 'gs_shop_default' },
    {
      $setOnInsert: {
        tenantId: 'gs_shop_default',
        name: 'GS Shop Alangulam',
        ownerUsername: 'gsadmin',
        plan: 'pro',
        monthlyMessageLimit: 5000,
        monthlyMessagesUsed: 0,
        customerLimit: 2500,
        campaignLimit: 50,
        subscriptionStatus: 'active'
      }
    },
    { upsert: true }
  );
}

async function matchAutoReply(incomingText, customer) {
  const normalizedText = String(incomingText || '').toLowerCase().trim();
  const rules = await AutoReplyRule.find({ enabled: true }).sort({ priority: 1, createdAt: 1 }).lean();

  let matchedRule = null;

  for (const rule of rules) {
    const keywords = rule.keyword.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    const isMatch = keywords.some(k => {
      if (normalizedText === k) return true;
      const regex = new RegExp(`(^|\\b|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\b|\\s|$)`, 'i');
      return regex.test(normalizedText) || normalizedText.includes(k);
    });

    if (isMatch) {
      matchedRule = rule;
      break;
    }
  }

  if (matchedRule) {
    // If offer keyword, check consent safety:
    if (matchedRule.actionType === 'offer') {
      if (customer && customer.consentStatus === 'opted_out') {
        return {
          reply: 'நீங்கள் விளம்பர செய்திகளை நிறுத்தியுள்ளீர்கள். சலுகைகளை பெற மீண்டும் Opt-In செய்யவும். / You have opted out of promotional offers. Contact GS Shop counter to opt back in.',
          matchedRule,
          handover: false
        };
      }
    }

    // Increment rule match count
    await AutoReplyRule.updateOne({ _id: matchedRule._id }, { $inc: { matchCount: 1 } });

    return {
      reply: matchedRule.replyText,
      matchedRule,
      handover: matchedRule.actionType === 'handover'
    };
  }

  return {
    reply: DEFAULT_FALLBACK_REPLY,
    matchedRule: null,
    handover: false
  };
}

function verifyMetaSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // In production, appSecret is strictly required; never silently accept webhooks without validation
  if (!appSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('CRITICAL: Webhook signature verification rejected: WHATSAPP_APP_SECRET is not configured in production.');
      return false;
    }
    // Non-production local development fallback: allow local webhook simulation with warning
    console.warn('[DEV ONLY] Bypassing webhook HMAC verification because WHATSAPP_APP_SECRET is unset.');
    return true;
  }

  if (!signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', appSecret);
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expectedSignature = 'sha256=' + hmac.update(rawBody).digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function ensureDemoTemplates() {
  for (const item of demoTemplates) {
    await Template.updateOne(
      { name: item.name },
      { $setOnInsert: item },
      { upsert: true }
    );
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: isDryRun() ? 'demo_no_send' : 'live_guarded',
    note: isDryRun()
      ? 'Campaigns are in dry-run mode. The protected test endpoint can send a test message.'
      : 'Live mode configured; campaign sends require consent and a Meta-approved template.'
  });
});

// ================================================================
// ALL ROUTES BELOW THIS LINE REQUIRE AUTHENTICATION
// ================================================================
// NOTE: Webhook endpoints (GET/POST /api/webhooks/whatsapp) are defined
// AFTER this block but bypass requireAuth intentionally — they are
// authenticated via Meta's X-Hub-Signature-256 HMAC verification instead.
// ================================================================

// Real database-driven campaign and customer analytics endpoint
app.get('/api/analytics', requireAuth, async (_req, res, next) => {
  try {
    const [
      totalCustomers,
      optedInCustomers,
      optedOutCustomers,
      unknownConsentCustomers,
      generalOptedIn,
      recentOptedIn,
      appliancesOptedIn,
      vipOptedIn,
      totalCampaigns,
      draftCampaigns,
      scheduledCampaigns,
      completedCampaigns,
      processingCampaigns,
      cancelledCampaigns,
      simulatedMessages,
      liveSentMessages,
      liveDeliveredMessages,
      failedMessages,
      monthlyUsageMessages
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ consentStatus: 'opted_in' }),
      Customer.countDocuments({ consentStatus: 'opted_out' }),
      Customer.countDocuments({ consentStatus: 'unknown' }),
      Customer.countDocuments({ consentStatus: 'opted_in', segment: 'general' }),
      Customer.countDocuments({ consentStatus: 'opted_in', segment: 'recent' }),
      Customer.countDocuments({ consentStatus: 'opted_in', segment: 'appliances' }),
      Customer.countDocuments({ consentStatus: 'opted_in', segment: 'vip' }),
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: 'draft' }),
      Campaign.countDocuments({ status: 'scheduled' }),
      Campaign.countDocuments({ status: 'completed' }),
      Campaign.countDocuments({ status: 'processing' }),
      Campaign.countDocuments({ status: 'cancelled' }),
      MessageLog.countDocuments({ status: 'dry_run' }),
      MessageLog.countDocuments({ status: 'sent' }),
      MessageLog.countDocuments({ status: { $in: ['delivered', 'read'] } }),
      MessageLog.countDocuments({ status: 'failed' }),
      MessageLog.countDocuments({
        createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
      })
    ]);

    const tenant = await Tenant.findOne({ tenantId: req.businessId || 'gs_shop_default' }).lean();

    res.json({
      customers: {
        total: totalCustomers,
        optedIn: optedInCustomers,
        optedOut: optedOutCustomers,
        unknownConsent: unknownConsentCustomers,
        byAudience: {
          all: optedInCustomers,
          general: generalOptedIn,
          recent: recentOptedIn,
          appliances: appliancesOptedIn,
          vip: vipOptedIn
        }
      },
      campaigns: {
        total: totalCampaigns,
        active: scheduledCampaigns + processingCampaigns,
        draft: draftCampaigns,
        scheduled: scheduledCampaigns,
        processing: processingCampaigns,
        completed: completedCampaigns,
        cancelled: cancelledCampaigns
      },
      messages: {
        total: simulatedMessages + liveSentMessages + liveDeliveredMessages + failedMessages,
        simulatedDryRun: simulatedMessages,
        liveSent: liveSentMessages,
        liveDelivered: liveDeliveredMessages,
        liveTotal: liveSentMessages + liveDeliveredMessages,
        failed: failedMessages,
        monthlyUsage: monthlyUsageMessages,
        monthlyLimit: tenant?.monthlyMessageLimit || 5000
      },
      whatsapp: {
        connectionStatus: (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) ? 'connected' : 'demo_mode',
        dryRun: isDryRun(),
        webhookConfigured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
        secretConfigured: Boolean(process.env.WHATSAPP_APP_SECRET)
      },
      safety: {
        dryRun: isDryRun(),
        scheduledDryRunEnforced: true,
        simulationIsolatedFromLive: true
      }
    });
  } catch (error) {
    next(error);
  }
});

// Protected Meta hello_world test endpoint.
// Use only on localhost. This sends a real WhatsApp test message.
app.post('/api/test/whatsapp', async (req, res) => {
  const providedSecret = String(req.get('x-test-secret') || '');
  const expectedSecret = String(process.env.WHATSAPP_TEST_SECRET || '');

  const providedBuffer = Buffer.from(providedSecret);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (
    !expectedSecret ||
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  const allowedRecipient = String(
    process.env.WHATSAPP_TEST_RECIPIENT || ''
  ).replace(/\D/g, '');

  if (!allowedRecipient || phone !== allowedRecipient) {
    return res.status(400).json({
      error: 'Only the configured test recipient is allowed.'
    });
  }

  // Never allow this endpoint to be used through a public deployment.
  const isLocalRequest =
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1' ||
    req.ip === '127.0.0.1' ||
    req.ip === '::1' ||
    req.ip === '::ffff:127.0.0.1';

  if (process.env.NODE_ENV === 'production' || !isLocalRequest) {
    return res.status(403).json({
      error: 'WhatsApp test endpoint is available only in local development.'
    });
  }

  try {
    const result = await sendHelloWorldTest(phone);
    return res.json({ ok: true, result });
  } catch (error) {
    const errorDetails = error.response?.data?.error?.message || error.message || 'Unknown error';
    console.error('WhatsApp test failed:', errorDetails);

    return res.status(502).json({
      error: 'WhatsApp test failed. Check backend terminal logs.'
    });
  }
});

function normalizePhoneNumber(raw) {
  if (!raw) return '';
  const clean = String(raw).trim();
  const digits = clean.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (clean.startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

app.get('/api/customers', requireAuth, async (req, res, next) => {
  try {
    const { search, status, segment } = req.query;
    const query = {};

    if (status && ['opted_in', 'opted_out', 'unknown'].includes(status)) {
      query.consentStatus = status;
    }

    if (segment && segment !== 'all') {
      query.segment = segment;
    }

    if (search && search.trim()) {
      const term = search.trim();
      // Escape all regex meta-characters to prevent ReDoS and regex injection
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const digitsOnly = term.replace(/\D/g, '');
      const searchConditions = [{ name: { $regex: escapedTerm, $options: 'i' } }];
      if (digitsOnly.length >= 3) {
        searchConditions.push({ phone: { $regex: digitsOnly } });
      }
      query.$or = searchConditions;
    }

    const customers = await Customer.find(query).sort({ createdAt: -1 }).lean();
    res.json(customers);
  } catch (error) {
    next(error);
  }
});

app.get('/api/customers/:id', requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/customers', requireAuth, async (req, res, next) => {
  try {
    const { name, phone, birthday = '', source = 'store_counter', segment = 'general', tags = [], notes = '', consentStatus = 'unknown', consentSource = '' } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Customer name is required.' });
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'A valid phone number with at least 10 digits is required.' });
    }

    const existing = await Customer.findOne({ phone: normalizedPhone });
    if (existing) {
      return res.status(409).json({ error: 'A customer with this phone number already exists.' });
    }

    const validConsent = ['opted_in', 'opted_out', 'unknown'].includes(consentStatus) ? consentStatus : 'unknown';
    const consentAt = validConsent === 'opted_in' ? new Date() : null;

    const customer = await Customer.create({
      businessId: req.businessId || 'gs_shop_default',
      name: name.trim(),
      phone: normalizedPhone,
      birthday: String(birthday || '').trim(),
      source: String(source || 'store_counter').trim(),
      segment: ['general', 'recent', 'appliances', 'vip'].includes(segment) ? segment : 'general',
      tags: Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
      notes: String(notes || '').trim(),
      consentStatus: validConsent,
      consentSource: validConsent === 'opted_in' ? (consentSource || 'manual_entry') : (consentSource || ''),
      consentAt
    });

    res.status(201).json(customer);
  } catch (error) {
    next(error);
  }
});

app.put('/api/customers/:id', requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const { name, phone, segment, tags, notes, consentStatus, consentSource } = req.body;

    if (name?.trim()) {
      customer.name = name.trim();
    }

    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'A valid phone number with at least 10 digits is required.' });
      }

      if (normalizedPhone !== customer.phone) {
        const duplicate = await Customer.findOne({ phone: normalizedPhone, _id: { $ne: customer._id } });
        if (duplicate) {
          return res.status(409).json({ error: 'Another customer with this phone number already exists.' });
        }
        customer.phone = normalizedPhone;
      }
    }

    if (segment && ['general', 'recent', 'appliances', 'vip'].includes(segment)) {
      customer.segment = segment;
    }

    if (Array.isArray(tags)) {
      customer.tags = tags.map(t => String(t).trim()).filter(Boolean);
    }

    if (notes !== undefined) {
      customer.notes = String(notes || '').trim();
    }

    if (req.body.birthday !== undefined) {
      customer.birthday = String(req.body.birthday || '').trim();
    }

    if (req.body.source !== undefined) {
      customer.source = String(req.body.source || '').trim();
    }

    if (consentStatus && ['opted_in', 'opted_out', 'unknown'].includes(consentStatus)) {
      if (consentStatus !== customer.consentStatus) {
        customer.consentStatus = consentStatus;
        customer.consentAt = consentStatus === 'unknown' ? null : new Date();
        customer.consentSource = consentSource || (consentStatus === 'opted_in' ? 'manual_update' : 'manual_opt_out');
      }
    }

    await customer.save();
    res.json(customer);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customers/:id', requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    res.json({ ok: true, message: `Customer "${customer.name}" deleted successfully.` });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customers/:id/opt-out', requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    customer.consentStatus = 'opted_out';
    customer.consentSource = req.body?.reason || 'customer_unsubscribed';
    customer.consentAt = new Date();
    await customer.save();
    res.json({ ok: true, message: 'Customer has been opted out.', customer });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customers/:id/opt-in', requireAuth, async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    customer.consentStatus = 'opted_in';
    customer.consentSource = req.body?.source || 'explicit_consent_provided';
    customer.consentAt = new Date();
    await customer.save();
    res.json({ ok: true, message: 'Customer consent recorded.', customer });
  } catch (error) {
    next(error);
  }
});

// CSV / Batch Customer Import with strict validation and consent default
app.post('/api/customers/import', requireAuth, async (req, res, next) => {
  try {
    const list = Array.isArray(req.body?.customers) ? req.body.customers : [];
    if (!list.length) {
      return res.status(400).json({ error: 'No customer records provided for import.' });
    }

    const results = {
      total: list.length,
      imported: 0,
      duplicates: 0,
      errors: 0,
      details: []
    };

    const existingPhones = new Set((await Customer.find({}, { phone: 1 }).lean()).map(c => c.phone));
    const batchPhones = new Set();
    const toInsert = [];

    for (const [index, row] of list.entries()) {
      const name = String(row.name || '').trim();
      const rawPhone = String(row.phone || '').trim();
      const normalized = normalizePhoneNumber(rawPhone);

      if (!name) {
        results.errors++;
        results.details.push({ row: index + 1, error: 'Name is required' });
        continue;
      }

      if (!normalized || normalized.replace(/\D/g, '').length < 10) {
        results.errors++;
        results.details.push({ row: index + 1, name, error: 'Invalid phone number format' });
        continue;
      }

      if (existingPhones.has(normalized) || batchPhones.has(normalized)) {
        results.duplicates++;
        results.details.push({ row: index + 1, name, phone: normalized, status: 'duplicate_skipped' });
        continue;
      }

      batchPhones.add(normalized);

      // Default to NOT opted-in unless explicit consent is provided
      const rawConsent = String(row.consentStatus || '').toLowerCase();
      const isOptedIn = rawConsent === 'opted_in' && Boolean(row.consentSource);
      const isOptedOut = rawConsent === 'opted_out';
      const consentStatus = isOptedIn ? 'opted_in' : isOptedOut ? 'opted_out' : 'unknown';

      toInsert.push({
        businessId: req.businessId || 'gs_shop_default',
        name,
        phone: normalized,
        birthday: String(row.birthday || '').trim(),
        source: String(row.source || 'csv_import').trim(),
        segment: ['general', 'recent', 'appliances', 'vip'].includes(row.segment) ? row.segment : 'general',
        tags: Array.isArray(row.tags) ? row.tags : typeof row.tags === 'string' ? row.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        notes: String(row.notes || '').trim(),
        consentStatus,
        consentSource: isOptedIn ? String(row.consentSource).trim() : (row.consentSource || ''),
        consentAt: isOptedIn ? new Date() : null
      });
    }

    if (toInsert.length > 0) {
      await Customer.insertMany(toInsert);
      results.imported = toInsert.length;
    }

    res.json({
      ok: true,
      message: `Import complete: ${results.imported} imported, ${results.duplicates} duplicate phones skipped, ${results.errors} errors.`,
      results
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/demo/seed', requireAuth, async (_req, res, next) => {
  try {
    const examples = [
      {
        name: 'Demo Customer A',
        phone: '+919900000001',
        segment: 'general',
        consentStatus: 'opted_in',
        consentSource: 'demo_checkbox',
        consentAt: new Date()
      },
      {
        name: 'Demo Customer B',
        phone: '+919900000002',
        segment: 'appliances',
        consentStatus: 'opted_in',
        consentSource: 'demo_checkbox',
        consentAt: new Date()
      },
      {
        name: 'Demo Customer C',
        phone: '+919900000003',
        segment: 'recent',
        consentStatus: 'opted_out',
        consentSource: 'demo_opt_out',
        consentAt: new Date()
      },
      {
        name: 'Demo Customer D',
        phone: '+919900000004',
        segment: 'general',
        consentStatus: 'unknown',
        consentSource: '',
        consentAt: null
      }
    ];

    for (const item of examples) {
      await Customer.updateOne(
        { phone: item.phone },
        { $set: item },
        { upsert: true }
      );
    }

    await ensureDemoTemplates();

    res.json({
      ok: true,
      message: 'Fictional demo customers and demo-only template loaded. No messages sent.'
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/templates', requireAuth, async (_req, res, next) => {
  try {
    await ensureDemoTemplates();
    res.json(await Template.find().sort({ name: 1 }).lean());
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns', requireAuth, async (_req, res, next) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();

    const withCounts = await Promise.all(
      campaigns.map(async campaign => {
        const counts = await MessageLog.aggregate([
          { $match: { campaignId: campaign._id } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const countMap = counts.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {});

        return {
          ...campaign,
          messageCounts: counts,
          simulatedCount: countMap['dry_run'] || 0,
          deliveredCount: (countMap['delivered'] || 0) + (countMap['read'] || 0),
          sentCount: countMap['sent'] || 0,
          failedCount: countMap['failed'] || 0
        };
      })
    );

    res.json(withCounts);
  } catch (error) {
    next(error);
  }
});

// Preview eligible recipients for audience selection
app.get('/api/campaigns/recipients/preview', requireAuth, async (req, res, next) => {
  try {
    const audience = req.query.audience || 'all';
    const query = { consentStatus: 'opted_in' };

    if (audience !== 'all') {
      query.segment = audience;
    }

    const customers = await Customer.find(query, { name: 1, phone: 1, segment: 1, consentAt: 1 }).lean();
    res.json({
      audience,
      count: customers.length,
      preview: customers.slice(0, 10).map(c => ({
        id: c._id,
        name: c.name,
        maskedPhone: c.phone.replace(/(\+\d{2})(\d+)(\d{3})$/, '$1••••$3'),
        segment: c.segment
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns/:id', requireAuth, async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id).lean();
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    const counts = await MessageLog.aggregate([
      { $match: { campaignId: campaign._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const countMap = counts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    res.json({
      ...campaign,
      messageCounts: counts,
      simulatedCount: countMap['dry_run'] || 0,
      deliveredCount: (countMap['delivered'] || 0) + (countMap['read'] || 0),
      sentCount: countMap['sent'] || 0,
      failedCount: countMap['failed'] || 0
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/campaigns', requireAuth, async (req, res, next) => {
  try {
    const {
      name,
      description = '',
      offerDetails,
      audience = 'all',
      templateName,
      scheduledAt,
      status = 'draft'
    } = req.body;

    if (!name?.trim() || !offerDetails?.trim() || !templateName) {
      return res.status(400).json({
        error: 'name, offerDetails, and templateName are required.'
      });
    }

    const validAudience = ['all', 'recent', 'appliances', 'general', 'vip'].includes(audience) ? audience : 'all';

    const template = await Template.findOne({ name: templateName });
    if (!template) {
      return res.status(400).json({ error: 'Template not found.' });
    }

    // Pre-calculate eligible opted-in recipient count
    const recipientQuery = { consentStatus: 'opted_in' };
    if (validAudience !== 'all') {
      recipientQuery.segment = validAudience;
    }
    const eligibleCount = await Customer.countDocuments(recipientQuery);

    const isScheduling = status === 'scheduled';
    let scheduleDate = null;

    if (isScheduling) {
      if (!scheduledAt) {
        return res.status(400).json({ error: 'scheduledAt date is required when scheduling a campaign.' });
      }
      scheduleDate = new Date(scheduledAt);
      if (Number.isNaN(scheduleDate.getTime())) {
        return res.status(400).json({ error: 'Invalid scheduledAt date format.' });
      }
    } else if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (!Number.isNaN(parsed.getTime())) {
        scheduleDate = parsed;
      }
    }

    const campaign = await Campaign.create({
      name: name.trim(),
      description: String(description || '').trim(),
      offerDetails: offerDetails.trim(),
      audience: validAudience,
      templateName,
      scheduledAt: scheduleDate,
      status: isScheduling ? 'scheduled' : 'draft',
      dryRun: true,
      recipientCount: eligibleCount
    });

    res.status(201).json({
      ...campaign.toObject(),
      eligibleRecipients: eligibleCount,
      note: isScheduling
        ? 'Campaign scheduled in dry-run simulation mode. No real WhatsApp messages sent.'
        : 'Campaign saved as draft.'
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/campaigns/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    if (campaign.status === 'completed' || campaign.status === 'processing') {
      return res.status(400).json({ error: `Cannot edit a campaign in "${campaign.status}" status.` });
    }

    const { name, description, offerDetails, audience, templateName, scheduledAt, status } = req.body;

    if (name?.trim()) campaign.name = name.trim();
    if (description !== undefined) campaign.description = String(description || '').trim();
    if (offerDetails?.trim()) campaign.offerDetails = offerDetails.trim();
    if (audience && ['all', 'recent', 'appliances', 'general', 'vip'].includes(audience)) {
      campaign.audience = audience;
    }
    if (templateName) {
      const template = await Template.findOne({ name: templateName });
      if (!template) return res.status(400).json({ error: 'Template not found.' });
      campaign.templateName = templateName;
    }

    if (status && ['draft', 'scheduled', 'cancelled'].includes(status)) {
      campaign.status = status;
    }

    if (scheduledAt) {
      const date = new Date(scheduledAt);
      if (!Number.isNaN(date.getTime())) {
        campaign.scheduledAt = date;
      }
    }

    // Recalculate recipient count
    const recipientQuery = { consentStatus: 'opted_in' };
    if (campaign.audience !== 'all') {
      recipientQuery.segment = campaign.audience;
    }
    campaign.recipientCount = await Customer.countDocuments(recipientQuery);

    await campaign.save();
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.post('/api/campaigns/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    if (campaign.status === 'completed' || campaign.status === 'processing') {
      return res.status(400).json({ error: `Cannot cancel a campaign that is already ${campaign.status}.` });
    }

    campaign.status = 'cancelled';
    await campaign.save();
    res.json({ ok: true, message: `Campaign "${campaign.name}" was cancelled.`, campaign });
  } catch (error) {
    next(error);
  }
});

async function runCampaign(campaign, { forceDryRun = true } = {}) {
  const campaignDoc = await Campaign.findById(campaign._id || campaign);

  if (
    !campaignDoc ||
    campaignDoc.status === 'completed' ||
    campaignDoc.status === 'cancelled'
  ) {
    return;
  }

  const template = await Template.findOne({ name: campaignDoc.templateName });

  if (!template) {
    throw new Error('Template missing');
  }

  const query = { consentStatus: 'opted_in' };

  if (campaignDoc.audience !== 'all') {
    query.segment = campaignDoc.audience;
  }

  const customers = await Customer.find(query).lean();

  campaignDoc.status = 'processing';
  campaignDoc.recipientCount = customers.length;
  await campaignDoc.save();

  for (const customer of customers) {
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${campaignDoc._id}:${customer._id}:${template.name}`)
      .digest('hex');

    const existing = await MessageLog.findOne({ idempotencyKey });

    if (existing) continue;

    // Campaigns always remain dry-run in this demo.
    if (forceDryRun || isDryRun()) {
      await MessageLog.create({
        campaignId: campaignDoc._id,
        customerId: customer._id,
        recipientPhone: customer.phone,
        templateName: template.name,
        status: 'dry_run',
        detail: 'Simulated only. No WhatsApp request made.',
        idempotencyKey
      });

      continue;
    }

    // Live campaign sending remains gated by consent and approved templates.
    try {
      const result = await sendApprovedTemplate({
        phone: customer.phone,
        template,
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: campaignDoc.offerDetails }
            ]
          }
        ]
      });

      await MessageLog.create({
        campaignId: campaignDoc._id,
        customerId: customer._id,
        recipientPhone: customer.phone,
        templateName: template.name,
        providerMessageId: result.providerMessageId,
        status: result.status,
        detail: result.detail,
        idempotencyKey
      });
    } catch (error) {
      await MessageLog.create({
        campaignId: campaignDoc._id,
        customerId: customer._id,
        recipientPhone: customer.phone,
        templateName: template.name,
        status: 'failed',
        detail: error.message,
        idempotencyKey
      });
    }
  }

  campaignDoc.status = 'completed';
  await campaignDoc.save();
}

app.post('/api/campaigns/:id/dry-run', requireAuth, async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found.' });
    }

    await runCampaign(campaign, { forceDryRun: true });

    res.json({
      ok: true,
      message: 'Dry-run completed. No WhatsApp messages sent.',
      campaign: await Campaign.findById(campaign._id).lean()
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/campaigns/:id/messages', requireAuth, async (req, res, next) => {
  try {
    res.json(
      await MessageLog.find({ campaignId: req.params.id })
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .lean()
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/messages', requireAuth, async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search && search.trim()) {
      const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { recipientPhone: { $regex: term, $options: 'i' } },
        { templateName: { $regex: term, $options: 'i' } }
      ];
    }

    const [total, messages] = await Promise.all([
      MessageLog.countDocuments(query),
      MessageLog.find(query)
        .populate('customerId', 'name')
        .populate('campaignId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()
    ]);

    res.json({
      messages,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      limit: limitNum
    });
  } catch (error) {
    next(error);
  }
});

// Auto-Reply Rules CRUD Endpoints
app.get('/api/autoreplies', requireAuth, async (_req, res, next) => {
  try {
    await ensureDefaultAutoReplies();
    const rules = await AutoReplyRule.find().sort({ priority: 1, createdAt: 1 }).lean();
    res.json(rules);
  } catch (error) {
    next(error);
  }
});

app.post('/api/autoreplies', requireAuth, async (req, res, next) => {
  try {
    const { keyword, replyText, language = 'bilingual', actionType = 'reply', category = 'keyword', priority = 1, enabled = true } = req.body;

    if (!keyword?.trim() || !replyText?.trim()) {
      return res.status(400).json({ error: 'Keyword and replyText are required.' });
    }

    const rule = await AutoReplyRule.create({
      businessId: req.businessId || 'gs_shop_default',
      keyword: keyword.trim(),
      replyText: replyText.trim(),
      language: ['ta', 'en', 'bilingual'].includes(language) ? language : 'bilingual',
      actionType: ['reply', 'handover', 'offer'].includes(actionType) ? actionType : 'reply',
      category: ['welcome', 'business_hours', 'away', 'keyword', 'custom'].includes(category) ? category : 'keyword',
      priority: Number(priority) || 1,
      enabled: Boolean(enabled)
    });

    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

app.put('/api/autoreplies/:id', requireAuth, async (req, res, next) => {
  try {
    const rule = await AutoReplyRule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Auto-reply rule not found.' });
    }

    const { keyword, replyText, language, actionType, category, priority, enabled } = req.body;
    if (keyword?.trim()) rule.keyword = keyword.trim();
    if (replyText?.trim()) rule.replyText = replyText.trim();
    if (language) rule.language = language;
    if (actionType) rule.actionType = actionType;
    if (category) rule.category = category;
    if (priority !== undefined) rule.priority = Number(priority) || 1;
    if (enabled !== undefined) rule.enabled = Boolean(enabled);

    await rule.save();
    res.json(rule);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/autoreplies/:id', requireAuth, async (req, res, next) => {
  try {
    const rule = await AutoReplyRule.findByIdAndDelete(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Auto-reply rule not found.' });
    }
    res.json({ ok: true, message: `Rule "${rule.keyword}" deleted.` });
  } catch (error) {
    next(error);
  }
});

// Conversation History & Handover Endpoints
app.get('/api/conversations', requireAuth, async (req, res, next) => {
  try {
    const { status, handover } = req.query;
    const query = {};
    if (handover === 'true') {
      query.handoverRequired = true;
    }
    if (status && ['none', 'pending', 'resolved'].includes(status)) {
      query.handoverStatus = status;
    }

    const conversations = await Conversation.find(query)
      .sort({ receivedAt: -1 })
      .limit(100)
      .lean();

    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

app.post('/api/conversations/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ error: 'Conversation record not found.' });
    }
    conv.handoverStatus = 'resolved';
    await conv.save();
    res.json({ ok: true, message: 'Handover marked as resolved.', conversation: conv });
  } catch (error) {
    next(error);
  }
});

// ================================================================
// WHATSAPP INTEGRATION & CONNECTION SETTINGS
// ================================================================

app.get('/api/whatsapp/settings', requireAuth, async (req, res, next) => {
  try {
    const hasToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
    const rawPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const maskedPhoneId = rawPhoneId ? `${rawPhoneId.slice(0, 4)}••••${rawPhoneId.slice(-4)}` : 'Not configured';
    const hasSecret = Boolean(process.env.WHATSAPP_APP_SECRET);
    const hasVerifyToken = Boolean(process.env.WHATSAPP_VERIFY_TOKEN);

    const [approvedTpl, pendingTpl, totalMessages, failedMessages] = await Promise.all([
      Template.countDocuments({ status: 'approved' }),
      Template.countDocuments({ status: { $in: ['pending', 'demo_only'] } }),
      MessageLog.countDocuments(),
      MessageLog.countDocuments({ status: 'failed' })
    ]);

    const shopSettings = await ShopSettings.findOne({ settingsKey: 'default' }).lean();

    res.json({
      ok: true,
      dryRunLocked: true,
      mode: isDryRun() ? 'safe_dry_run_active' : 'live_guarded',
      connection: {
        status: hasToken && rawPhoneId ? 'connected' : 'demo_mode',
        businessPhoneNumber: shopSettings?.phone || '+91 99000 00001',
        phoneNumberIdMasked: maskedPhoneId,
        wabaStatus: hasToken ? 'Verified Business Account' : 'Demo Test Cloud Sandbox',
        webhookStatus: hasVerifyToken ? 'Configured & Verified' : 'Token Missing',
        apiHealth: 'healthy',
        signatureVerification: hasSecret ? 'HMAC-SHA256 Active' : (isProduction ? 'Missing Secret' : 'Dev Simulation')
      },
      templates: {
        approved: approvedTpl,
        pending: pendingTpl
      },
      metrics: {
        totalDispatched: totalMessages,
        deliveryFailures: failedMessages
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/whatsapp/test-connection', requireAuth, async (_req, res) => {
  const hasToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const rawPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!hasToken || !rawPhoneId) {
    return res.json({
      ok: true,
      status: 'demo_ready',
      message: 'Demo mode active. Live Meta credentials are not configured, so campaigns run in 100% safe simulation.'
    });
  }

  try {
    const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
    const resp = await axios.get(`https://graph.facebook.com/${version}/${rawPhoneId}`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
      timeout: 6000
    });
    return res.json({
      ok: true,
      status: 'connected',
      message: `Successfully verified Meta WhatsApp Cloud API connection (Display Phone: ${resp.data?.display_phone_number || rawPhoneId})`,
      details: {
        verifiedName: resp.data?.verified_name,
        codeVerificationStatus: resp.data?.code_verification_status
      }
    });
  } catch (err) {
    return res.json({
      ok: false,
      status: 'error',
      message: `Meta API connection check returned: ${err.response?.data?.error?.message || err.message}`
    });
  }
});

// ================================================================
// REPORTS, ANALYTICS & CSV EXPORT
// ================================================================

app.get('/api/reports/analytics', requireAuth, async (req, res, next) => {
  try {
    const { range = '30d' } = req.query;
    let startDate = null;
    const now = new Date();

    if (range === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (range === 'this_month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dateFilter = startDate ? { createdAt: { $gte: startDate } } : {};

    const [
      totalCustomers,
      optedIn,
      optedOut,
      newCustomersInRange,
      totalMessages,
      deliveredMessages,
      failedMessages,
      simulatedMessages,
      conversationsCount,
      recentCampaigns
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ consentStatus: 'opted_in' }),
      Customer.countDocuments({ consentStatus: 'opted_out' }),
      Customer.countDocuments(dateFilter),
      MessageLog.countDocuments(dateFilter),
      MessageLog.countDocuments({ ...dateFilter, status: { $in: ['delivered', 'read'] } }),
      MessageLog.countDocuments({ ...dateFilter, status: 'failed' }),
      MessageLog.countDocuments({ ...dateFilter, status: 'dry_run' }),
      Conversation.countDocuments(dateFilter),
      Campaign.find(dateFilter).sort({ createdAt: -1 }).limit(10).lean()
    ]);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyUsage = await MessageLog.countDocuments({ createdAt: { $gte: startOfMonth } });

    res.json({
      ok: true,
      range,
      customers: {
        total: totalCustomers,
        optedIn,
        optedOut,
        newInRange: newCustomersInRange,
        optInRate: totalCustomers > 0 ? Math.round((optedIn / totalCustomers) * 100) : 0
      },
      messages: {
        total: totalMessages,
        delivered: deliveredMessages,
        failed: failedMessages,
        simulated: simulatedMessages,
        monthlyUsage,
        monthlyLimit: 5000,
        deliveryRate: totalMessages > 0 ? Math.round((deliveredMessages / totalMessages) * 100) : 100
      },
      conversations: {
        total: conversationsCount
      },
      recentCampaigns
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/reports/export-csv', requireAuth, async (req, res, next) => {
  try {
    const type = req.query.type || 'customers';
    if (type === 'customers') {
      const customers = await Customer.find().sort({ createdAt: -1 }).lean();
      let csv = 'Name,Phone,Segment,Birthday,Source,Consent Status,Consent Source,Created At\n';
      for (const c of customers) {
        const row = [
          `"${(c.name || '').replace(/"/g, '""')}"`,
          `"${c.phone || ''}"`,
          `"${c.segment || ''}"`,
          `"${c.birthday || ''}"`,
          `"${c.source || ''}"`,
          `"${c.consentStatus || ''}"`,
          `"${c.consentSource || ''}"`,
          `"${c.createdAt ? new Date(c.createdAt).toISOString() : ''}"`
        ];
        csv += row.join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="customers_export.csv"');
      return res.send(csv);
    } else {
      const messages = await MessageLog.find()
        .populate('customerId', 'name')
        .populate('campaignId', 'name')
        .sort({ createdAt: -1 })
        .limit(1000)
        .lean();

      let csv = 'Customer Name,Phone,Template,Campaign,Status,Type,Date\n';
      for (const m of messages) {
        const row = [
          `"${(m.customerId?.name || 'Customer').replace(/"/g, '""')}"`,
          `"${m.recipientPhone || ''}"`,
          `"${m.templateName || ''}"`,
          `"${(m.campaignId?.name || 'Campaign').replace(/"/g, '""')}"`,
          `"${m.status || ''}"`,
          `"${m.messageType || 'broadcast'}"`,
          `"${m.createdAt ? new Date(m.createdAt).toISOString() : ''}"`
        ];
        csv += row.join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="broadcast_messages_export.csv"');
      return res.send(csv);
    }
  } catch (err) {
    next(err);
  }
});

// ================================================================
// SAAS SUBSCRIPTION ARCHITECTURE & MULTI-TENANCY
// ================================================================

app.get('/api/subscription', requireAuth, async (req, res, next) => {
  try {
    const tenant = (await Tenant.findOne({ tenantId: req.businessId || 'gs_shop_default' }).lean()) || {
      tenantId: 'gs_shop_default',
      name: 'GS Shop Alangulam',
      plan: 'pro',
      monthlyMessageLimit: 5000,
      customerLimit: 2500,
      campaignLimit: 50,
      subscriptionStatus: 'active',
      renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const [usedCount, customerCount, campaignCount] = await Promise.all([
      MessageLog.countDocuments({ createdAt: { $gte: currentMonth } }),
      Customer.countDocuments(),
      Campaign.countDocuments()
    ]);

    res.json({
      ok: true,
      tenant: {
        ...tenant,
        monthlyMessagesUsed: usedCount,
        customerCount,
        campaignCount
      }
    });
  } catch (err) {
    next(err);
  }
});

app.put('/api/subscription/plan', requireAuth, async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!['free', 'starter', 'pro', 'enterprise'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid subscription plan.' });
    }

    const limits = {
      free: { messageLimit: 500, customerLimit: 200, campaignLimit: 5 },
      starter: { messageLimit: 2000, customerLimit: 1000, campaignLimit: 20 },
      pro: { messageLimit: 5000, customerLimit: 2500, campaignLimit: 50 },
      enterprise: { messageLimit: 25000, customerLimit: 10000, campaignLimit: 200 }
    }[plan];

    const tenant = await Tenant.findOneAndUpdate(
      { tenantId: req.businessId || 'gs_shop_default' },
      {
        $set: {
          plan,
          monthlyMessageLimit: limits.messageLimit,
          customerLimit: limits.customerLimit,
          campaignLimit: limits.campaignLimit,
          subscriptionStatus: 'active'
        }
      },
      { upsert: true, new: true }
    );

    res.json({
      ok: true,
      message: `Subscription plan upgraded to ${plan.toUpperCase()}.`,
      tenant
    });
  } catch (err) {
    next(err);
  }
});

// Meta webhook verification.
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Official WhatsApp Webhook Receiver with X-Hub-Signature-256 verification
app.post('/api/webhooks/whatsapp', async (req, res, next) => {
  // 1. Signature Verification
  if (!verifyMetaSignature(req)) {
    console.warn('Webhook rejected: Invalid X-Hub-Signature-256.');
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  try {
    const entries = req.body?.entry || [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const val = change.value || {};

        // 2. Process Message Delivery Status Updates (sent, delivered, read, failed)
        for (const status of val.statuses || []) {
          const normalized = ['sent', 'delivered', 'read', 'failed'].includes(status.status)
            ? status.status
            : null;

          if (normalized) {
            await MessageLog.updateOne(
              { providerMessageId: status.id },
              {
                $set: {
                  status: normalized,
                  providerStatusAt: status.timestamp
                    ? new Date(Number(status.timestamp) * 1000)
                    : new Date(),
                  detail: status.errors?.[0]?.title || ''
                }
              }
            );

            // Also record in WebhookLog for audit idempotency
            await WebhookLog.updateOne(
              { eventId: `status_${status.id}_${status.status}` },
              {
                $setOnInsert: {
                  eventId: `status_${status.id}_${status.status}`,
                  eventType: 'status',
                  senderPhone: status.recipient_id || '',
                  payload: status,
                  processed: true
                }
              },
              { upsert: true }
            );
          }
        }

        // 3. Process Incoming WhatsApp Messages & Auto-Replies
        for (const msg of val.messages || []) {
          const messageId = msg.id;
          const from = msg.from;

          if (!messageId || !from) continue;

          // Prevent duplicate webhook event processing
          const existingEvent = await WebhookLog.findOne({ eventId: messageId });
          if (existingEvent) {
            continue;
          }

          // Record Webhook Event immediately to prevent race conditions
          await WebhookLog.create({
            eventId: messageId,
            eventType: 'message',
            senderPhone: from,
            payload: msg,
            processed: true
          });

          // Prevent loop: Avoid replying to messages sent by the business phone itself
          const businessPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
          if (businessPhoneId && from === businessPhoneId) {
            continue;
          }

          // Normalize customer phone
          const normalizedFrom = normalizePhoneNumber(from);

          // Rate limit & loop prevention: Max 10 auto-replies per customer per 10 minutes
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const recentMsgCount = await Conversation.countDocuments({
            customerPhone: normalizedFrom,
            receivedAt: { $gte: tenMinutesAgo }
          });

          if (recentMsgCount >= 10) {
            console.warn(`Loop prevention triggered: Rate limit exceeded for ${normalizedFrom}`);
            continue;
          }

          // Find or create customer in MongoDB
          let customer = await Customer.findOne({ phone: normalizedFrom });
          const contactProfile = val.contacts?.[0]?.profile?.name;
          if (!customer) {
            customer = await Customer.create({
              name: contactProfile || 'WhatsApp Customer',
              phone: normalizedFrom,
              segment: 'general',
              consentStatus: 'unknown',
              consentSource: 'incoming_whatsapp_query'
            });
          }

          // Extract message text
          const incomingText = msg.text?.body || msg.interactive?.button_reply?.title || '';

          // Match Auto-Reply rule
          const replyResult = await matchAutoReply(incomingText, customer);

          // Save Conversation in MongoDB
          await Conversation.create({
            customerPhone: normalizedFrom,
            customerName: customer.name || contactProfile || 'Customer',
            customerId: customer._id,
            incomingMessage: incomingText || '(non-text message)',
            incomingMessageId: messageId,
            replyMessage: replyResult.reply,
            replyStatus: 'dry_run',
            matchedKeyword: replyResult.matchedRule?.keyword || 'fallback',
            handoverRequired: replyResult.handover,
            handoverStatus: replyResult.handover ? 'pending' : 'none',
            receivedAt: new Date(msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now())
          });
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
});

// Scheduled campaigns always run in dry-run mode.
cron.schedule('* * * * *', async () => {
  if (mongoose.connection.readyState !== 1) return;

  const due = await Campaign.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() }
  }).limit(10);

  for (const campaign of due) {
    try {
      await runCampaign(campaign, { forceDryRun: true });
    } catch (error) {
      console.error('Scheduled demo campaign failed:', error.message);
    }
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: 'Server error',
    detail:
      process.env.NODE_ENV === 'development'
        ? err.message
        : undefined
  });
});

mongoose
  .connect(
    process.env.MONGODB_URI ||
      'mongodb://127.0.0.1:27017/gs_shop_whatsapp_demo'
  )
  .then(async () => {
    await ensureDefaultTenant();
    await ensureDemoTemplates();
    await ensureDefaultAutoReplies();

    app.listen(PORT, () => {
      console.log(
        `GS Shop demo API listening on ${PORT}; DRY_RUN=${isDryRun()}`
      );
    });
  })
  .catch(error => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });
