import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const CustomerSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  birthday: { type: String, default: '', trim: true },
  source: { type: String, default: 'store_counter', trim: true },
  segment: { type: String, enum: ['general', 'recent', 'appliances', 'vip'], default: 'general' },
  tags: { type: [String], default: [] },
  notes: { type: String, default: '' },
  consentStatus: { type: String, enum: ['opted_in', 'opted_out', 'unknown'], default: 'unknown' },
  consentSource: { type: String, default: '' },
  consentAt: { type: Date, default: null }
}, { timestamps: true });

CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ businessId: 1, phone: 1 });

const TemplateSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'], default: 'MARKETING' },
  language: { type: String, default: 'en' },
  body: { type: String, required: true },
  status: { type: String, enum: ['approved', 'pending', 'rejected', 'paused', 'demo_only'], default: 'demo_only' },
  metaTemplateId: { type: String, default: '' },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

TemplateSchema.index({ businessId: 1, name: 1 }, { unique: true });

const CampaignSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  offerDetails: { type: String, required: true, trim: true },
  audience: { type: String, enum: ['all', 'recent', 'appliances', 'general', 'vip'], default: 'all' },
  templateName: { type: String, required: true },
  scheduledAt: { type: Date, default: null },
  status: { type: String, enum: ['draft', 'scheduled', 'processing', 'completed', 'cancelled', 'failed'], default: 'draft' },
  dryRun: { type: Boolean, default: true },
  recipientCount: { type: Number, default: 0 },
  createdBy: { type: String, default: 'demo-owner' }
}, { timestamps: true });

CampaignSchema.index({ businessId: 1, status: 1, scheduledAt: 1 });

const MessageLogSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  recipientPhone: { type: String, required: true },
  templateName: { type: String, required: true },
  messageType: { type: String, enum: ['template_broadcast', 'auto_reply', 'test_message'], default: 'template_broadcast' },
  providerMessageId: { type: String, default: '' },
  status: { type: String, enum: ['dry_run', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped'], default: 'dry_run' },
  detail: { type: String, default: '' },
  providerStatusAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, unique: true }
}, { timestamps: true });

MessageLogSchema.index({ businessId: 1, status: 1 });

const AutoReplyRuleSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  keyword: { type: String, required: true, trim: true },
  replyText: { type: String, required: true, trim: true },
  language: { type: String, enum: ['ta', 'en', 'bilingual'], default: 'bilingual' },
  actionType: { type: String, enum: ['reply', 'handover', 'offer'], default: 'reply' },
  category: { type: String, enum: ['welcome', 'business_hours', 'away', 'keyword', 'custom'], default: 'keyword' },
  priority: { type: Number, default: 1 },
  enabled: { type: Boolean, default: true },
  matchCount: { type: Number, default: 0 }
}, { timestamps: true });

AutoReplyRuleSchema.index({ businessId: 1, priority: 1 });

const ConversationSchema = new Schema({
  businessId: { type: String, default: 'gs_shop_default', index: true },
  customerPhone: { type: String, required: true, trim: true, index: true },
  customerName: { type: String, default: 'Customer' },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
  incomingMessage: { type: String, required: true },
  incomingMessageId: { type: String, default: '', unique: true, sparse: true },
  replyMessage: { type: String, default: '' },
  replyStatus: { type: String, enum: ['dry_run', 'sent', 'delivered', 'read', 'failed'], default: 'dry_run' },
  matchedKeyword: { type: String, default: '' },
  handoverRequired: { type: Boolean, default: false },
  handoverStatus: { type: String, enum: ['none', 'pending', 'resolved'], default: 'none' },
  receivedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const WebhookLogSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, default: 'message' },
  senderPhone: { type: String, default: '' },
  payload: { type: Schema.Types.Mixed, default: {} },
  processed: { type: Boolean, default: true }
}, { timestamps: true });

// Owner / admin user account
const OwnerSchema = new Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, default: 'Shop Owner' },
  tenantId: { type: String, default: 'gs_shop_default' },
  lastLogin: { type: Date, default: null }
}, { timestamps: true });

// Business settings
const ShopSettingsSchema = new Schema({
  settingsKey: { type: String, required: true, unique: true, default: 'default' },
  businessId: { type: String, default: 'gs_shop_default', index: true },
  shopName: { type: String, default: 'GS Shop Alangulam' },
  address: { type: String, default: 'Main Road, Alangulam, Tenkasi District - 627851' },
  phone: { type: String, default: '+91 99000 00001' },
  email: { type: String, default: 'gsshop.alangulam@gmail.com' },
  openingHours: { type: String, default: 'Monday - Sunday: 9:00 AM to 9:30 PM' },
  defaultTamilReply: { type: String, default: 'வணக்கம்! GS Shop Alangulam-க்கு வரவேற்கிறோம்.' },
  defaultEnglishReply: { type: String, default: 'Hello! Welcome to GS Shop Alangulam.' },
  humanSupportContact: { type: String, default: '+91 99000 00001' },
  landmark: { type: String, default: 'Near Bus Stand' }
}, { timestamps: true });

// Multi-tenant SaaS Business Account & Subscription Schema
const TenantSchema = new Schema({
  tenantId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'GS Shop Alangulam' },
  ownerUsername: { type: String, default: 'gsadmin' },
  plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'pro' },
  monthlyMessageLimit: { type: Number, default: 5000 },
  monthlyMessagesUsed: { type: Number, default: 0 },
  customerLimit: { type: Number, default: 2500 },
  campaignLimit: { type: Number, default: 50 },
  subscriptionStatus: { type: String, enum: ['active', 'trial', 'past_due', 'cancelled'], default: 'active' },
  features: {
    customTemplates: { type: Boolean, default: true },
    automatedWebhooks: { type: Boolean, default: true },
    prioritySupport: { type: Boolean, default: true },
    csvExports: { type: Boolean, default: true }
  },
  renewalDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

export const Customer = model('Customer', CustomerSchema);
export const Template = model('Template', TemplateSchema);
export const Campaign = model('Campaign', CampaignSchema);
export const MessageLog = model('MessageLog', MessageLogSchema);
export const AutoReplyRule = model('AutoReplyRule', AutoReplyRuleSchema);
export const Conversation = model('Conversation', ConversationSchema);
export const WebhookLog = model('WebhookLog', WebhookLogSchema);
export const Owner = model('Owner', OwnerSchema);
export const ShopSettings = model('ShopSettings', ShopSettingsSchema);
export const Tenant = model('Tenant', TenantSchema);
