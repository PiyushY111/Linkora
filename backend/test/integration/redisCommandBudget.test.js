import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import { connectTestDb, disconnectTestDb, createTestUser } from '../helpers/testUtils.js';
import Link from '../../src/models/Link.js';
import { getRedis, closeRedis } from '../../src/services/cacheService.js';

/**
 * Pins down how many Redis commands the API spends on its hottest and most
 * frequently polled paths (docs/redis-keys.md, "Command budget"), by
 * recording every command the shared client sends.
 */

let user;
let link;
const commands = [];

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeAll(async () => {
  await connectTestDb();
  ({ user } = await createTestUser());
  const shortCode = `cb${Date.now().toString(36)}`;
  link = await Link.create({
    user: user._id,
    originalUrl: 'https://example.com/budget',
    shortCode,
    shortUrl: `http://localhost/${shortCode}`,
  });

  // Record only after the connection handshake (HELLO, SELECT, CLIENT
  // SETINFO, INFO), which is a once-per-connection cost, not per request.
  const client = getRedis();
  if (client.status !== 'ready') await new Promise((resolve) => client.once('ready', resolve));
  const send = client.sendCommand.bind(client);
  client.sendCommand = (command, ...rest) => {
    commands.push(command.name);
    return send(command, ...rest);
  };
});

beforeEach(() => {
  commands.length = 0;
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

describe('Redis command budget: API paths', () => {
  it('GET /health/liveness sends no Redis commands', async () => {
    const res = await request(app).get('/health/liveness');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(commands, []);
  });

  it('GET /health/readiness sends exactly PING and XINFO, and never echoes error details', async () => {
    const res = await request(app).get('/health/readiness');
    assert.deepStrictEqual(commands, ['ping', 'xinfo']);
    assert.ok(!('error' in res.body.checks.streamConsumerGroup));
  });

  it('a cached redirect sends exactly HGETALL + XADD', async () => {
    // First request: cache miss, which populates the cache.
    await request(app).get(`/api/r/${link.shortCode}`).redirects(0);
    await waitFor(() => commands.includes('xadd'));
    assert.deepStrictEqual(commands.sort(), ['expire', 'hgetall', 'hset', 'xadd'].sort(), 'miss path');

    commands.length = 0;
    const res = await request(app).get(`/api/r/${link.shortCode}`).redirects(0);
    await waitFor(() => commands.includes('xadd'));

    assert.strictEqual(res.status, 307);
    assert.deepStrictEqual(commands, ['hgetall', 'xadd'], 'hit path');
  });
});
