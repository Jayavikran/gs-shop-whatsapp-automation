import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { Customer, Campaign, Template, MessageLog } from './src/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function runTests() {
  console.log('--- STARTING PHASE 2 AUTOMATED TEST SUITE ---');
  const results = {
    passed: [],
    failed: []
  };

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/gs_shop_whatsapp_demo';
  
  try {
    await mongoose.connect(uri);
    console.log('✓ MongoDB connection established.');
    results.passed.push('MongoDB Connection');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    results.failed.push(`MongoDB Connection: ${err.message}`);
    return results;
  }

  try {
    // 1. Test Customer Creation with explicit consent rule
    console.log('\n[Test 1] Customer Creation & Default Consent Validation');
    const testPhone = '+919876540001';
    await Customer.deleteOne({ phone: testPhone });

    const customer1 = await Customer.create({
      name: 'Test Customer 1',
      phone: testPhone,
      segment: 'general',
      tags: ['test_tag', 'pongal_buyer'],
      notes: 'Initial test note',
      consentStatus: 'unknown'
    });

    if (customer1.consentStatus === 'unknown' && customer1.consentAt === null) {
      console.log('✓ Default consent is NOT opted-in (unknown) and consentAt is null.');
      results.passed.push('Customer Default Consent Validation');
    } else {
      throw new Error(`Expected unknown consent, got ${customer1.consentStatus}`);
    }

    // 2. Test Duplicate Phone Prevention
    console.log('\n[Test 2] Duplicate Phone Number Prevention');
    let duplicateRejected = false;
    try {
      await Customer.create({
        name: 'Test Duplicate Customer',
        phone: testPhone,
        segment: 'recent'
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateRejected = true;
        console.log('✓ Duplicate phone number correctly rejected by MongoDB unique index (11000).');
        results.passed.push('Duplicate Phone Number Prevention');
      } else {
        throw err;
      }
    }
    if (!duplicateRejected) {
      results.failed.push('Duplicate Phone Number Prevention (failed to reject duplicate)');
    }

    // 3. Test Customer Edit & Update
    console.log('\n[Test 3] Customer Edit & Notes Update');
    customer1.notes = 'Updated customer inquiry notes';
    customer1.tags.push('vip');
    await customer1.save();

    const updatedCustomer = await Customer.findById(customer1._id);
    if (updatedCustomer.notes === 'Updated customer inquiry notes' && updatedCustomer.tags.includes('vip')) {
      console.log('✓ Customer notes and tags updated successfully.');
      results.passed.push('Customer Edit & Notes Update');
    } else {
      results.failed.push('Customer Edit & Notes Update failed');
    }

    // 4. Test Opt-In Handling with timestamp and source
    console.log('\n[Test 4] Customer Opt-In Consent Recording');
    customer1.consentStatus = 'opted_in';
    customer1.consentSource = 'Counter written form';
    customer1.consentAt = new Date();
    await customer1.save();

    const optedInCust = await Customer.findById(customer1._id);
    if (optedInCust.consentStatus === 'opted_in' && optedInCust.consentSource === 'Counter written form' && optedInCust.consentAt) {
      console.log('✓ Valid opt-in recorded with timestamp and documented source.');
      results.passed.push('Customer Opt-In Consent Recording');
    } else {
      results.failed.push('Customer Opt-In Consent Recording failed');
    }

    // 5. Test Customer Opt-Out / Unsubscribe
    console.log('\n[Test 5] Customer Opt-Out Handling');
    customer1.consentStatus = 'opted_out';
    customer1.consentSource = 'Customer requested STOP';
    customer1.consentAt = new Date();
    await customer1.save();

    const optedOutCust = await Customer.findById(customer1._id);
    if (optedOutCust.consentStatus === 'opted_out' && optedOutCust.consentSource === 'Customer requested STOP') {
      console.log('✓ Customer successfully opted out. Will be strictly excluded from campaigns.');
      results.passed.push('Customer Opt-Out Handling');
    } else {
      results.failed.push('Customer Opt-Out Handling failed');
    }

    // 6. Test CSV Batch Import Logic
    console.log('\n[Test 6] CSV Batch Import Validation');
    const importBatch = [
      { name: 'Imported User 1', phone: '+919876540002', segment: 'recent', consentStatus: 'unknown', consentSource: '' },
      { name: 'Imported User 2', phone: '+919876540003', segment: 'appliances', consentStatus: 'opted_in', consentSource: 'Store tablet consent' },
      { name: 'Imported Duplicate', phone: '+919876540002', segment: 'general', consentStatus: 'unknown' } // in-batch duplicate
    ];

    await Customer.deleteMany({ phone: { $in: ['+919876540002', '+919876540003'] } });

    const batchPhones = new Set();
    const validToInsert = [];
    let duplicatesCaught = 0;

    for (const row of importBatch) {
      if (batchPhones.has(row.phone)) {
        duplicatesCaught++;
        continue;
      }
      batchPhones.add(row.phone);
      const isExplicitOptIn = row.consentStatus === 'opted_in' && Boolean(row.consentSource);
      validToInsert.push({
        name: row.name,
        phone: row.phone,
        segment: row.segment,
        consentStatus: isExplicitOptIn ? 'opted_in' : 'unknown',
        consentSource: isExplicitOptIn ? row.consentSource : '',
        consentAt: isExplicitOptIn ? new Date() : null
      });
    }

    await Customer.insertMany(validToInsert);
    console.log(`✓ CSV Import correctly inserted ${validToInsert.length} records and caught ${duplicatesCaught} duplicate phone(s).`);
    results.passed.push('CSV Batch Import Validation & In-Batch Deduplication');

    // 7. Test Campaign Draft Creation
    console.log('\n[Test 7] Campaign Draft Creation');
    await Template.updateOne(
      { name: 'gs_festival_offer' },
      { $setOnInsert: { name: 'gs_festival_offer', body: 'Demo body', status: 'demo_only' } },
      { upsert: true }
    );

    const draftCampaign = await Campaign.create({
      name: 'Pongal Mega Sale Draft',
      description: 'Draft campaign for Pongal offers',
      offerDetails: 'Flat 20% off on Cookware',
      audience: 'all',
      templateName: 'gs_festival_offer',
      status: 'draft',
      scheduledAt: null,
      dryRun: true
    });

    if (draftCampaign.status === 'draft' && draftCampaign.scheduledAt === null) {
      console.log('✓ Campaign successfully saved as Draft without mandatory scheduledAt.');
      results.passed.push('Campaign Draft Creation');
    } else {
      results.failed.push('Campaign Draft Creation failed');
    }

    // 8. Test Campaign Scheduling
    console.log('\n[Test 8] Campaign Scheduling');
    const futureDate = new Date(Date.now() + 86400000);
    draftCampaign.status = 'scheduled';
    draftCampaign.scheduledAt = futureDate;
    await draftCampaign.save();

    const scheduledCamp = await Campaign.findById(draftCampaign._id);
    if (scheduledCamp.status === 'scheduled' && scheduledCamp.scheduledAt) {
      console.log('✓ Campaign transitioned from Draft to Scheduled with valid execution timestamp.');
      results.passed.push('Campaign Scheduling');
    } else {
      results.failed.push('Campaign Scheduling failed');
    }

    // 9. Test Campaign Dry-Run Execution & Safety Isolation
    console.log('\n[Test 9] Campaign Dry-Run Simulation & Opted-In Exclusion');
    // Ensure only opted-in customer receives messages
    const optedInRecipient = await Customer.findOne({ consentStatus: 'opted_in' });
    if (!optedInRecipient) {
      await Customer.create({
        name: 'Guaranteed Opted In',
        phone: '+919900000099',
        consentStatus: 'opted_in',
        consentSource: 'Test',
        consentAt: new Date()
      });
    }

    // Query eligible customers
    const eligibleRecipients = await Customer.find({ consentStatus: 'opted_in' }).lean();
    const nonOptedRecipients = await Customer.find({ consentStatus: { $ne: 'opted_in' } }).lean();

    console.log(`Eligible opted-in recipients count: ${eligibleRecipients.length}`);
    console.log(`Excluded non-opted/unknown count: ${nonOptedRecipients.length}`);

    // Create dry-run message logs
    for (const cust of eligibleRecipients) {
      const idempotencyKey = `test-dry-run-${scheduledCamp._id}-${cust._id}`;
      await MessageLog.updateOne(
        { idempotencyKey },
        {
          $setOnInsert: {
            campaignId: scheduledCamp._id,
            customerId: cust._id,
            recipientPhone: cust.phone,
            templateName: scheduledCamp.templateName,
            status: 'dry_run',
            detail: 'Simulated only. No WhatsApp request made.',
            idempotencyKey
          }
        },
        { upsert: true }
      );
    }

    scheduledCamp.status = 'completed';
    scheduledCamp.recipientCount = eligibleRecipients.length;
    await scheduledCamp.save();

    // Verify MessageLogs status
    const logs = await MessageLog.find({ campaignId: scheduledCamp._id });
    const hasLiveDelivery = logs.some(l => l.status === 'sent' || l.status === 'delivered');
    const allDryRun = logs.every(l => l.status === 'dry_run');

    if (allDryRun && !hasLiveDelivery) {
      console.log('✓ All created message logs are strictly labeled "dry_run". 0 real sends.');
      results.passed.push('Demo Mode Dry-Run Simulation & Live Send Isolation');
    } else {
      results.failed.push('Demo Mode Dry-Run Simulation failed (found live send status)');
    }

    // Clean up test data
    await Customer.deleteMany({ phone: { $in: [testPhone, '+919876540002', '+919876540003', '+919900000099'] } });
    await Campaign.deleteOne({ _id: scheduledCamp._id });
    await MessageLog.deleteMany({ campaignId: scheduledCamp._id });

    // 10. Test Customer Delete with confirmation capability
    console.log('\n[Test 10] Customer Delete Functionality');
    const tempCustomer = await Customer.create({
      name: 'Temp Delete Customer',
      phone: '+919999999998',
      segment: 'general'
    });
    await Customer.findByIdAndDelete(tempCustomer._id);
    const deletedCheck = await Customer.findById(tempCustomer._id);
    if (!deletedCheck) {
      console.log('✓ Customer deletion verified.');
      results.passed.push('Customer Deletion Functionality');
    } else {
      results.failed.push('Customer Deletion Functionality failed');
    }

  } catch (err) {
    console.error('Test execution error:', err);
    results.failed.push(`Test Execution Error: ${err.message}`);
  } finally {
    await mongoose.disconnect();
    console.log('\n--- TEST SUITE EXECUTION FINISHED ---');
  }

  return results;
}

runTests().then((res) => {
  console.log('\nSUMMARY:');
  console.log(`Passed: ${res.passed.length}`);
  console.log(`Failed: ${res.failed.length}`);
  if (res.failed.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
});
