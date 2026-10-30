import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const CustomerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  segment: { type: String, enum: ['general', 'recent', 'appliances', 'vip'], default: 'general' },
  tags: { type: [String], default: [] },
  notes: { type: String, default: '' },
  consentStatus: { type: String, enum: ['opted_in', 'opted_out', 'unknown'], default: 'unknown' },
  consentSource: { type: String, default: '' },
  consentAt: { type: Date, default: null }
}, { timestamps: true });

CustomerSchema.index({ phone: 1 }, { unique: true });

const TemplateSchema = new Schema({
  name: { type: String, required: true, unique: true },
  category: { type: String, enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'], default: 'MARKETING' },
  language: { type: String, default: 'en' },
  body: { type: String, required: true },
  status: { type: String, enum: ['approved', 'pending', 'rejected', 'demo_only'], default: 'demo_only' },
  metaTemplateId: { type: String, default: '' }
}, { timestamps: true });

const CampaignSchema = new Schema({
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

CampaignSchema.index({ status: 1, scheduledAt: 1 });

const MessageLogSchema = new Schema({
  campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  recipientPhone: { type: String, required: true },
  templateName: { type: String, required: true },
  providerMessageId: { type: String, default: '' },
  status: { type: String, enum: ['dry_run', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped'], default: 'dry_run' },
  detail: { type: String, default: '' },
  providerStatusAt: { type: Date, default: null },
  idempotencyKey: { type: String, required: true, unique: true }
}, { timestamps: true });

const AutoReplyRuleSchema = new Schema({
  keyword: { type: String, required: true, trim: true },
  replyText: { type: String, required: true, trim: true },
  language: { type: String, enum: ['ta', 'en', 'bilingual'], default: 'bilingual' },
  actionType: { type: String, enum: ['reply', 'handover', 'offer'], default: 'reply' },
  enabled: { type: Boolean, default: true },
  matchCount: { type: Number, default: 0 }
}, { timestamps: true });

const ConversationSchema = new Schema({
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
  lastLogin: { type: Date, default: null }
}, { timestamps: true });

// Business settings (single document, upserted by username 'default')
const ShopSettingsSchema = new Schema({
  settingsKey: { type: String, required: true, unique: true, default: 'default' },
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

export const Customer = model('Customer', CustomerSchema);
export const Template = model('Template', TemplateSchema);
export const Campaign = model('Campaign', CampaignSchema);
export const MessageLog = model('MessageLog', MessageLogSchema);
export const AutoReplyRule = model('AutoReplyRule', AutoReplyRuleSchema);
export const Conversation = model('Conversation', ConversationSchema);
export const WebhookLog = model('WebhookLog', WebhookLogSchema);
export const Owner = model('Owner', OwnerSchema);
export const ShopSettings = model('ShopSettings', ShopSettingsSchema);
