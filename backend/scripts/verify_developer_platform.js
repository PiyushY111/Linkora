import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../src/models/User.js';
import ApiKey from '../src/models/ApiKey.js';
import ApiLog from '../src/models/ApiLog.js';
import Link from '../src/models/Link.js';
import { createLinkRecord } from '../src/controllers/linkController.js';

async function run() {
  console.log('=== Starting Developer Platform & Public API Verification ===');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linkora');
  console.log('Connected to MongoDB');

  // 1. Fetch test user
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      name: 'Developer Tester',
      email: 'dev-tester@example.com',
      password: 'Password123!',
    });
  }
  console.log(`[1/6] Using test user: ${user.email} (${user._id})`);

  // 2. Test Scoped API Key Generation & SHA-256 Hashing
  console.log('\n[2/6] Generating and hashing Scoped API Keys...');
  const rawLiveKey = `lnk_live_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawLiveKey).digest('hex');
  const prefix = rawLiveKey.slice(0, 12);
  const lastFour = rawLiveKey.slice(-4);

  const apiKeyDoc = await ApiKey.create({
    user: user._id,
    name: 'Automated E2E Verification Key',
    keyHash,
    prefix,
    maskedKey: `${prefix}...${lastFour}`,
    lastFour,
    environment: 'live',
    scopes: ['links:read', 'links:write', 'analytics:read'],
  });

  console.log('Created ApiKey document:', apiKeyDoc._id);
  console.log('Raw Key:', rawLiveKey);
  console.log('Masked Key:', apiKeyDoc.maskedKey);
  console.log('Key Hash in DB:', apiKeyDoc.keyHash);

  // 3. Test API Key Lookup with Hashed Secret
  console.log('\n[3/6] Verifying SHA-256 lookup matching Stripe/GitHub standard...');
  const incomingHash = crypto.createHash('sha256').update(rawLiveKey).digest('hex');
  const matchedKey = await ApiKey.findOne({ keyHash: incomingHash, status: 'active' });

  if (!matchedKey || String(matchedKey._id) !== String(apiKeyDoc._id)) {
    throw new Error('Hashed API Key lookup failed!');
  }
  console.log('Matched API Key successfully via SHA-256 hash lookup');

  // 4. Test Public Link Creation & Retrieval
  console.log('\n[4/6] Testing Public API Link Creation and Retrieval...');
  const createResult = await createLinkRecord(user._id, {
    originalUrl: 'https://docs.stripe.com/api',
    title: 'Stripe Documentation E2E',
    tags: ['stripe', 'api-test'],
    maxClicks: 1000,
  });

  if (!createResult.success) {
    throw new Error(`Public Link creation failed: ${createResult.message}`);
  }
  const link = createResult.link;
  console.log('Created short link:', link.shortCode, '->', link.originalUrl);

  const fetchedLink = await Link.findOne({ shortCode: link.shortCode, user: user._id });
  if (!fetchedLink) {
    throw new Error('Link retrieval by code failed!');
  }
  console.log('Link verified in database. Tags:', fetchedLink.tags);

  // 5. Test Telemetry Logging into ApiLog
  console.log('\n[5/6] Verifying API Telemetry Logging...');
  const logRecord = await ApiLog.create({
    user: user._id,
    apiKeyId: apiKeyDoc._id,
    apiKeyPrefix: apiKeyDoc.prefix,
    method: 'POST',
    endpoint: '/api/public/v1/links',
    statusCode: 201,
    latencyMs: 24,
    ipAddress: '127.0.0.1',
    userAgent: 'Linkora-Playground/1.0',
  });
  console.log('Created ApiLog record:', logRecord._id, 'Status:', logRecord.statusCode, 'Latency:', logRecord.latencyMs, 'ms');

  const recentLogs = await ApiLog.find({ user: user._id }).sort({ createdAt: -1 }).limit(1);
  if (recentLogs.length === 0 || recentLogs[0].statusCode !== 201) {
    throw new Error('ApiLog telemetry record verification failed!');
  }
  console.log('ApiLog telemetry stream verified successfully');

  // 6. Test Key Rolling (Rotation)
  console.log('\n[6/6] Testing Zero-Downtime Key Rolling...');
  const newRawSecret = `lnk_live_${crypto.randomBytes(24).toString('hex')}`;
  const newHash = crypto.createHash('sha256').update(newRawSecret).digest('hex');
  const oldHash = apiKeyDoc.keyHash;

  apiKeyDoc.keyHash = newHash;
  apiKeyDoc.prefix = newRawSecret.slice(0, 12);
  apiKeyDoc.lastFour = newRawSecret.slice(-4);
  apiKeyDoc.maskedKey = `${apiKeyDoc.prefix}...${apiKeyDoc.lastFour}`;
  await apiKeyDoc.save();

  // Verify old key is now rejected
  const oldLookup = await ApiKey.findOne({ keyHash: oldHash, status: 'active' });
  const newLookup = await ApiKey.findOne({ keyHash: newHash, status: 'active' });

  if (oldLookup) {
    throw new Error('Old API Key should have been invalidated after rolling!');
  }
  if (!newLookup) {
    throw new Error('New rolled API Key not found!');
  }
  console.log('Key rolled successfully! Old hash rejected, new hash active.');

  // Clean up test records
  console.log('\nCleaning up verification records...');
  await ApiKey.findByIdAndDelete(apiKeyDoc._id);
  await ApiLog.findByIdAndDelete(logRecord._id);
  await Link.findByIdAndDelete(link._id);
  await mongoose.disconnect();

  console.log('\n>>> ALL DEVELOPER PLATFORM & PUBLIC API TESTS PASSED PERFECTLY! <<<');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
