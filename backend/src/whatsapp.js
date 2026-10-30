
import axios from 'axios';

const dryRun = () =>
  String(process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID.'
    );
  }

  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';

  return {
    url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
}

// Existing campaign function: respects DRY_RUN.
export async function sendApprovedTemplate({
  phone,
  template,
  components = []
}) {
  if (dryRun()) {
    return {
      dryRun: true,
      status: 'dry_run',
      providerMessageId: '',
      detail: 'Demo mode: no WhatsApp message was sent.'
    };
  }

  if (!template || template.status !== 'approved' || !template.metaTemplateId) {
    throw new Error(
      'Template is not confirmed approved by Meta.'
    );
  }

  const recipient = String(phone || '').replace(/\D/g, '');

  if (!recipient) {
    throw new Error('A valid recipient phone number is required.');
  }

  const { url, headers } = getWhatsAppConfig();

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language || 'en' },
        ...(components.length ? { components } : {})
      }
    },
    { headers, timeout: 15000 }
  );

  return {
    dryRun: false,
    status: 'sent',
    providerMessageId: response.data?.messages?.[0]?.id || '',
    detail: 'Accepted by WhatsApp API; delivery status arrives via webhook.'
  };
}

// Dedicated Meta hello_world test.
// Only the configured test recipient is allowed.
// This deliberately bypasses DRY_RUN, so call it only from a
// local, secret-protected test endpoint.
export async function sendHelloWorldTest(phone) {
  const configuredRecipient =
    String(process.env.WHATSAPP_TEST_RECIPIENT || '').replace(/\D/g, '');

  const recipient = String(phone || '').replace(/\D/g, '');

  if (!configuredRecipient) {
    throw new Error('WHATSAPP_TEST_RECIPIENT is not configured.');
  }

  if (!recipient || recipient !== configuredRecipient) {
    throw new Error('Only the configured test recipient is allowed.');
  }

  const { url, headers } = getWhatsAppConfig();

  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: 'hello_world',
        language: { code: 'en_US' }
      }
    },
    { headers, timeout: 15000 }
  );

  return {
    status: 'accepted',
    providerMessageId: response.data?.messages?.[0]?.id || '',
    detail: 'Accepted by WhatsApp API; check the recipient WhatsApp for delivery.'
  };
}
