import mongoose from 'mongoose';
import http from 'http';
import crypto from 'crypto';
import User from '../src/models/User.js';
import Webhook from '../src/models/Webhook.js';
import WebhookDelivery from '../src/models/WebhookDelivery.js';
import { resolveActiveWorkspace } from '../src/services/workspaceService.js';
import {
  isSafeEndpointUrl,
  generateSignature,
  testWebhookEndpoint,
  retryDelivery as executeRetryDelivery,
} from '../src/services/webhookService.js';

async function run() {
  console.log('--- Starting Webhook Integration Verification ---');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/linkora');
  console.log('Connected to MongoDB');

  // 1. SSRF Protection Tests
  console.log('\n[1/6] Testing SSRF Protection...');
  const ssrfCloud = await isSafeEndpointUrl('http://169.254.169.254/latest/meta-data/');
  const ssrfGoogle = await isSafeEndpointUrl('http://metadata.google.internal/computeMetadata');
  const validHttps = await isSafeEndpointUrl('https://api.github.com/webhooks');

  console.log('AWS metadata blocked:', !ssrfCloud.safe, 'Reason:', ssrfCloud.reason);
  console.log('Google metadata blocked:', !ssrfGoogle.safe, 'Reason:', ssrfGoogle.reason);
  console.log('Valid public HTTPS allowed:', validHttps.safe);

  if (ssrfCloud.safe || ssrfGoogle.safe || !validHttps.safe) {
    throw new Error('SSRF validation failed!');
  }

  // 2. Setup Local Mock Webhook Receiver
  console.log('\n[2/6] Starting local HTTP receiver on port 9998...');
  let lastReceivedHeaders = null;
  let lastReceivedBody = null;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      lastReceivedHeaders = req.headers;
      lastReceivedBody = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, ack: 'ok' }));
    });
  });

  await new Promise((resolve) => server.listen(9998, resolve));
  console.log('Mock receiver running on http://127.0.0.1:9998');

  // 3. User & Webhook Provisioning
  console.log('\n[3/6] Provisioning test webhook endpoint...');
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      name: 'Webhook Tester',
      email: 'webhook-test@example.com',
      password: 'Password123!',
    });
  }

  const { workspace } = await resolveActiveWorkspace(user);

  const testWebhook = await Webhook.create({
    user: user._id,
    workspace: workspace._id,
    url: 'http://127.0.0.1:9998/webhook-test',
    description: 'Automated E2E Verification Webhook',
    events: ['link.clicked', 'endpoint.test', 'link.created'],
    secret: 'whsec_testsecret1234567890abcdef',
  });
  console.log('Created test webhook:', testWebhook._id, 'Secret:', testWebhook.secret);

  // 4. Test Webhook Live Ping
  console.log('\n[4/6] Dispatching live test ping...');
  const testResult = await testWebhookEndpoint(testWebhook._id, workspace._id, 'endpoint.test');
  console.log('Delivery response status:', testResult.delivery.responseStatus);
  console.log('Delivery latency:', testResult.delivery.latencyMs, 'ms');
  console.log('Delivery status:', testResult.delivery.status);

  if (testResult.delivery.status !== 'success') {
    throw new Error(`Test delivery failed: ${testResult.delivery.error}`);
  }

  // 5. Signature Verification
  console.log('\n[5/6] Verifying HMAC-SHA256 signature and replay protection...');
  const sigHeader = lastReceivedHeaders['linkly-signature'];
  console.log('Received Linkly-Signature:', sigHeader);

  if (!sigHeader) {
    throw new Error('Linkly-Signature header was not received by endpoint!');
  }

  const parts = sigHeader.split(',').reduce((acc, pair) => {
    const [k, v] = pair.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const { t: timestamp, v1: signature } = parts;
  const signedString = `${timestamp}.${lastReceivedBody}`;
  const expectedSig = crypto
    .createHmac('sha256', testWebhook.secret)
    .update(signedString)
    .digest('hex');

  console.log('Parsed timestamp:', timestamp);
  console.log('Computed HMAC:', expectedSig);
  console.log('Received HMAC:', signature);

  if (signature !== expectedSig) {
    throw new Error('Signature mismatch! HMAC verification failed.');
  }
  console.log('HMAC signature verified successfully with zero drift!');

  // 6. Test Replay / Retry Delivery
  console.log('\n[6/6] Testing delivery replay / retry...');
  const originalDeliveryId = testResult.delivery._id;
  const retryResult = await executeRetryDelivery(originalDeliveryId, user._id);

  console.log('Replay status:', retryResult.delivery.status);
  console.log('Replay response code:', retryResult.delivery.responseStatus);
  console.log('Replay attempt number:', retryResult.delivery.attempt);

  if (retryResult.delivery.attempt !== 2 || retryResult.delivery.status !== 'success') {
    throw new Error('Retry delivery failed or attempt count incorrect!');
  }

  // Clean up
  console.log('\nCleaning up test records and shutting down mock server...');
  await WebhookDelivery.deleteMany({ webhook: testWebhook._id });
  await Webhook.findByIdAndDelete(testWebhook._id);
  server.close();
  await mongoose.disconnect();

  console.log('\n>>> ALL WEBHOOK INTEGRATION TESTS PASSED PERFECTLY! <<<');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
