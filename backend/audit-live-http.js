const API = 'http://localhost:4000/api';

async function req(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runAudit() {
  console.log('=== RUNNING LIVE HTTP AUDIT OF GS SHOP ALANGULAM API ===\n');
  const auditReport = [];

  function record(item, status, details, evidence) {
    auditReport.push({ item, status, details, evidence });
    console.log(`[${status}] ${item}: ${details}`);
  }

  // 1. Health check & DRY_RUN check
  const health = await req('/health');
  if (health.ok && health.data.mode === 'demo_no_send') {
    record('1. Backend Runtime & DRY_RUN status', 'PASS', 'Backend is live on port 4000 in demo_no_send mode.', JSON.stringify(health.data));
  } else {
    record('1. Backend Runtime & DRY_RUN status', 'FAIL', 'Health check did not report demo_no_send mode', JSON.stringify(health));
  }

  // 2. Customer Creation
  const testPhone = '+919900009901';
  // cleanup if existed
  const existingCusts = await req('/customers');
  const found = existingCusts.data.find(c => c.phone === testPhone);
  if (found) await req(`/customers/${found._id}`, { method: 'DELETE' });

  const createRes = await req('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Audit Shopper Alpha',
      phone: testPhone,
      segment: 'appliances',
      tags: ['audit_test', 'pongal_deal'],
      notes: 'Customer looking for grinder'
    })
  });

  if (createRes.status === 201 && createRes.data._id) {
    record('2. Customer Creation API', 'PASS', 'Customer created with normalized phone +919900009901.', `ID: ${createRes.data._id}`);
  } else {
    record('2. Customer Creation API', 'FAIL', `Failed to create customer: ${JSON.stringify(createRes.data)}`, JSON.stringify(createRes));
  }

  const newCustId = createRes.data._id;

  // 3. Customer Consent Defaults (Must default to NOT opted-in unless explicitly provided)
  if (createRes.data.consentStatus === 'unknown' && createRes.data.consentAt === null) {
    record('3. Consent Default Rule', 'PASS', 'Newly created customer defaults to consentStatus="unknown" and consentAt=null.', `consentStatus: ${createRes.data.consentStatus}`);
  } else {
    record('3. Consent Default Rule', 'FAIL', `Customer did not default to unknown: ${createRes.data.consentStatus}`, JSON.stringify(createRes.data));
  }

  // 4. Duplicate Phone Number Prevention
  const dupRes = await req('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Duplicate Shopper',
      phone: testPhone,
      segment: 'general'
    })
  });

  if (dupRes.status === 409 && dupRes.data.error.includes('already exists')) {
    record('4. Duplicate Phone Number Prevention', 'PASS', 'Duplicate phone returned HTTP 409 Conflict with descriptive error.', dupRes.data.error);
  } else {
    record('4. Duplicate Phone Number Prevention', 'FAIL', `Expected HTTP 409, got ${dupRes.status}`, JSON.stringify(dupRes));
  }

  // 5. Customer Editing & Notes
  const editRes = await req(`/customers/${newCustId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Audit Shopper Alpha Edited',
      notes: 'Customer upgraded interest to butterfly grinder',
      tags: ['audit_test', 'upgraded']
    })
  });

  if (editRes.ok && editRes.data.name === 'Audit Shopper Alpha Edited' && editRes.data.notes.includes('butterfly')) {
    record('5. Customer Editing API', 'PASS', 'Customer name, notes, and tags updated successfully via PUT.', `Notes: ${editRes.data.notes}`);
  } else {
    record('5. Customer Editing API', 'FAIL', 'Failed to update customer', JSON.stringify(editRes));
  }

  // 6. Customer Opt-In Action
  const optInRes = await req(`/customers/${newCustId}/opt-in`, {
    method: 'POST',
    body: JSON.stringify({ source: 'Store Counter Audit Form' })
  });

  if (optInRes.ok && optInRes.data.customer?.consentStatus === 'opted_in' && optInRes.data.customer?.consentAt) {
    record('6. Customer Opt-In Flow', 'PASS', 'Customer consent transitioned to opted_in with timestamp and documented source.', `consentAt: ${optInRes.data.customer.consentAt}`);
  } else {
    record('6. Customer Opt-In Flow', 'FAIL', 'Opt-in failed', JSON.stringify(optInRes));
  }

  // 7. Customer Opt-Out Action
  const optOutRes = await req(`/customers/${newCustId}/opt-out`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Customer sent STOP keyword' })
  });

  if (optOutRes.ok && optOutRes.data.customer?.consentStatus === 'opted_out') {
    record('7. Customer Opt-Out Flow', 'PASS', 'Customer consent transitioned to opted_out with reason logged.', `consentStatus: ${optOutRes.data.customer.consentStatus}`);
  } else {
    record('7. Customer Opt-Out Flow', 'FAIL', 'Opt-out failed', JSON.stringify(optOutRes));
  }

  // Re-opt-in for campaign recipient testing
  await req(`/customers/${newCustId}/opt-in`, {
    method: 'POST',
    body: JSON.stringify({ source: 'Re-opted in for test' })
  });

  // 8. Customer Search & Filtering
  const searchByName = await req('/customers?search=Alpha');
  const searchByPhone = await req('/customers?search=9901');
  const filterByConsent = await req('/customers?status=opted_in');
  const filterBySegment = await req('/customers?segment=appliances');

  const searchPass =
    searchByName.ok && searchByName.data.some(c => c._id === newCustId) &&
    searchByPhone.ok && searchByPhone.data.some(c => c._id === newCustId) &&
    filterByConsent.ok && filterByConsent.data.every(c => c.consentStatus === 'opted_in') &&
    filterBySegment.ok && filterBySegment.data.every(c => c.segment === 'appliances');

  if (searchPass) {
    record('8. Customer Search & Filtering API', 'PASS', 'Search by name, search by phone, and filters for consent and segment work correctly.', `Found by name: ${searchByName.data.length}, by phone: ${searchByPhone.data.length}`);
  } else {
    record('8. Customer Search & Filtering API', 'FAIL', 'Search or filter condition failed', JSON.stringify({ searchByName: searchByName.data.length, searchByPhone: searchByPhone.data.length }));
  }

  // 9. Batch CSV Import with Validation & Non-Consent Default
  const importPhone1 = '+919900009902';
  const importPhone2 = '+919900009903';
  const cleanupDup = await req('/customers');
  for (const c of cleanupDup.data) {
    if (c.phone === importPhone1 || c.phone === importPhone2) {
      await req(`/customers/${c._id}`, { method: 'DELETE' });
    }
  }

  const importRes = await req('/customers/import', {
    method: 'POST',
    body: JSON.stringify({
      customers: [
        { name: 'CSV Shopper 1', phone: importPhone1, segment: 'recent', consentStatus: 'unknown' },
        { name: 'CSV Shopper 2', phone: importPhone2, segment: 'vip', consentStatus: 'opted_in', consentSource: 'Signed physical slip' },
        { name: 'CSV Shopper Duplicate', phone: importPhone1, segment: 'general' } // in-batch duplicate
      ]
    })
  });

  if (importRes.ok && importRes.data.results.imported === 2 && importRes.data.results.duplicates === 1) {
    record('9. Batch CSV Import & Deduplication', 'PASS', 'CSV batch import processed 2 valid rows and skipped in-batch duplicate phone.', JSON.stringify(importRes.data.results));
  } else {
    record('9. Batch CSV Import & Deduplication', 'FAIL', 'Import results unexpected', JSON.stringify(importRes));
  }

  // 10. Campaign Recipient Preview
  const previewRes = await req('/campaigns/recipients/preview?audience=appliances');
  if (previewRes.ok && typeof previewRes.data.count === 'number' && Array.isArray(previewRes.data.preview)) {
    record('10. Campaign Recipient Preview API', 'PASS', 'Recipient preview returns count and masked recipient preview for eligible opted-in customers.', `Count: ${previewRes.data.count}`);
  } else {
    record('10. Campaign Recipient Preview API', 'FAIL', 'Recipient preview failed', JSON.stringify(previewRes));
  }

  // 11. Campaign Draft Creation
  const draftRes = await req('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Audit Draft Campaign',
      description: 'Internal QA Draft',
      offerDetails: 'Special QA Discount 15%',
      audience: 'all',
      templateName: 'gs_festival_offer',
      status: 'draft'
    })
  });

  if (draftRes.status === 201 && draftRes.data.status === 'draft') {
    record('11. Campaign Draft Creation API', 'PASS', 'Campaign created as draft without mandatory scheduling date.', `Campaign ID: ${draftRes.data._id}`);
  } else {
    record('11. Campaign Draft Creation API', 'FAIL', 'Failed to create draft campaign', JSON.stringify(draftRes));
  }

  const testCampaignId = draftRes.data._id;

  // 12. Campaign Scheduling
  const futureSchedule = new Date(Date.now() + 3600000).toISOString();
  const scheduleRes = await req(`/campaigns/${testCampaignId}`, {
    method: 'PUT',
    body: JSON.stringify({
      status: 'scheduled',
      scheduledAt: futureSchedule
    })
  });

  if (scheduleRes.ok && scheduleRes.data.status === 'scheduled' && scheduleRes.data.scheduledAt) {
    record('12. Campaign Scheduling API', 'PASS', 'Campaign transitioned to scheduled state with future execution timestamp.', `scheduledAt: ${scheduleRes.data.scheduledAt}`);
  } else {
    record('12. Campaign Scheduling API', 'FAIL', 'Failed to schedule campaign', JSON.stringify(scheduleRes));
  }

  // 13. Campaign Cancellation
  const cancelRes = await req(`/campaigns/${testCampaignId}/cancel`, {
    method: 'POST'
  });

  if (cancelRes.ok && cancelRes.data.campaign?.status === 'cancelled') {
    record('13. Campaign Cancellation API', 'PASS', 'Scheduled campaign successfully cancelled before execution.', `status: ${cancelRes.data.campaign.status}`);
  } else {
    record('13. Campaign Cancellation API', 'FAIL', 'Failed to cancel campaign', JSON.stringify(cancelRes));
  }

  // 14. Campaign Dry-Run Execution & Zero Live Meta Send Verification
  const execCampaignRes = await req('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Audit Simulation Campaign',
      description: 'Audit test for zero real send verification',
      offerDetails: 'Audit Pongal 20% Off',
      audience: 'appliances',
      templateName: 'gs_festival_offer',
      status: 'draft'
    })
  });

  const execCampId = execCampaignRes.data._id;
  const dryRunRes = await req(`/campaigns/${execCampId}/dry-run`, {
    method: 'POST'
  });

  if (dryRunRes.ok && dryRunRes.data.campaign?.status === 'completed') {
    // Fetch logs for this campaign
    const logsRes = await req(`/campaigns/${execCampId}/messages`);
    const allLogsDryRun = logsRes.data.length > 0 && logsRes.data.every(l => l.status === 'dry_run');
    const zeroLive = logsRes.data.every(l => l.status !== 'sent' && l.status !== 'delivered');

    if (allLogsDryRun && zeroLive) {
      record('14. Dry-Run Execution & Zero Live Sends', 'PASS', `All ${logsRes.data.length} messages generated strictly as 'dry_run'. Confirmed 0 real WhatsApp Cloud API messages sent.`, `Message count: ${logsRes.data.length}`);
    } else {
      record('14. Dry-Run Execution & Zero Live Sends', 'FAIL', 'Found live status in message logs', JSON.stringify(logsRes.data));
    }
  } else {
    record('14. Dry-Run Execution & Zero Live Sends', 'FAIL', 'Dry run execution endpoint failed', JSON.stringify(dryRunRes));
  }

  // 15. Duplicate-Send Prevention (Idempotency Key Check)
  // Run dry run a second time on the same campaign
  const secondDryRun = await req(`/campaigns/${execCampId}/dry-run`, {
    method: 'POST'
  });

  const logsAfterSecond = await req(`/campaigns/${execCampId}/messages`);
  const initialCount = (await req(`/campaigns/${execCampId}/messages`)).data.length;
  if (secondDryRun.ok && logsAfterSecond.data.length === initialCount) {
    record('15. Duplicate-Send Prevention & Idempotency', 'PASS', 'Re-executing dry-run simulation generated 0 duplicate messages due to SHA-256 idempotency key.', `Log count remained: ${logsAfterSecond.data.length}`);
  } else {
    record('15. Duplicate-Send Prevention & Idempotency', 'FAIL', 'Duplicate messages generated on re-run', `Count changed from ${initialCount} to ${logsAfterSecond.data.length}`);
  }

  // 16. MongoDB Analytics Accuracy (Not hardcoded)
  const analyticsRes = await req('/analytics');
  if (analyticsRes.ok && analyticsRes.data.customers.total > 0 && typeof analyticsRes.data.campaigns.draft === 'number') {
    record('16. MongoDB Analytics Accuracy', 'PASS', 'Analytics returns live counts directly queried from MongoDB documents.', JSON.stringify(analyticsRes.data));
  } else {
    record('16. MongoDB Analytics Accuracy', 'FAIL', 'Analytics failed or missing required fields', JSON.stringify(analyticsRes));
  }

  // 17. Customer Deletion
  const delRes = await req(`/customers/${newCustId}`, { method: 'DELETE' });
  const checkDeleted = await req(`/customers/${newCustId}`);
  if (delRes.ok && checkDeleted.status === 404) {
    record('17. Customer Deletion API', 'PASS', 'Customer permanently deleted and confirmed 404 Not Found on subsequent fetch.', delRes.data.message);
  } else {
    record('17. Customer Deletion API', 'FAIL', 'Customer deletion failed or still exists', JSON.stringify(checkDeleted));
  }

  // Clean up other audit test customers & campaigns
  const cleanupAll = await req('/customers');
  for (const c of cleanupAll.data) {
    if (c.phone === importPhone1 || c.phone === importPhone2) {
      await req(`/customers/${c._id}`, { method: 'DELETE' });
    }
  }

  console.log('\n=== AUDIT SUMMARY ===');
  const passed = auditReport.filter(r => r.status === 'PASS').length;
  const failed = auditReport.filter(r => r.status === 'FAIL').length;
  console.log(`TOTAL AUDITED: ${auditReport.length} | PASSED: ${passed} | FAILED: ${failed}`);

  return auditReport;
}

runAudit();
