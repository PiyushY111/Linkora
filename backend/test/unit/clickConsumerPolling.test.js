import { describe, it, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import { createClickConsumer } from '../../src/consumers/clickConsumer.js';

const MINUTE = 60 * 1000;

// An idle consumer must stay under this many Redis commands per 10 minutes
// (docs/redis-keys.md, "Command budget"). The old loop, a fixed 1s BLOCK
// plus XAUTOCLAIM on every iteration, spent about 1,200.
const IDLE_COMMAND_BUDGET_PER_10_MIN = 30;

/**
 * Stub clients that record every command. The blocking XREADGROUP resolves
 * with `nextRead()` (null = nothing) only once fake time has advanced by its
 * BLOCK argument, like a real idle Redis; disconnect() aborts it.
 */
function stubRedis({ nextRead = () => null } = {}) {
  const calls = [];
  const blockArgs = [];
  let pending = null;

  const redis = {
    async xautoclaim() {
      calls.push('XAUTOCLAIM');
      return ['0-0', [], []];
    },
    async xack() {
      calls.push('XACK');
      return 1;
    },
  };
  const blockingRedis = {
    status: 'ready',
    xreadgroup(...args) {
      calls.push('XREADGROUP');
      const blockMs = args[args.indexOf('BLOCK') + 1];
      blockArgs.push(blockMs);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(nextRead()), blockMs);
        pending = { timer, reject };
      });
    },
    disconnect() {
      this.status = 'end';
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Connection is closed.'));
      }
    },
  };
  return { redis, blockingRedis, calls, blockArgs };
}

function consumerWith(stubs) {
  return createClickConsumer({
    redis: stubs.redis,
    blockingRedis: stubs.blockingRedis,
    consumerName: 'test-consumer',
    blockMinMs: 1000,
    blockMaxMs: 30 * 1000,
    claimIntervalMs: 5 * MINUTE,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('click consumer: Redis command budget', () => {
  it(`an idle consumer spends fewer than ${IDLE_COMMAND_BUDGET_PER_10_MIN} commands in 10 minutes`, async () => {
    vi.useFakeTimers();
    const stubs = stubRedis();
    const consumer = consumerWith(stubs);

    consumer.start();
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    await consumer.stop();

    const count = (name) => stubs.calls.filter((c) => c === name).length;
    assert.ok(stubs.calls.length < IDLE_COMMAND_BUDGET_PER_10_MIN, `${stubs.calls.length} commands: ${stubs.calls}`);
    assert.ok(count('XAUTOCLAIM') <= 3, 'XAUTOCLAIM runs on a 5-minute timer, not every loop');
    // BLOCK doubles from 1s and caps at 30s.
    assert.deepStrictEqual(stubs.blockArgs.slice(0, 7), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    assert.strictEqual(Math.max(...stubs.blockArgs), 30000);
  });

  it('resets BLOCK to the minimum as soon as events arrive', async () => {
    vi.useFakeTimers();
    let readNumber = 0;
    const stubs = stubRedis({
      nextRead: () => {
        readNumber += 1;
        // The 5th read returns one entry. Its linkId is invalid, so the batch
        // is logged and acked without touching MongoDB.
        return readNumber === 5 ? [['stream:clicks', [['1-0', ['linkId', 'not-an-id', 'shortCode', 'x']]]]] : null;
      },
    });
    const consumer = consumerWith(stubs);

    consumer.start();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    await consumer.stop();

    assert.deepStrictEqual(stubs.blockArgs.slice(0, 7), [1000, 2000, 4000, 8000, 16000, 1000, 2000]);
    assert.ok(stubs.calls.includes('XACK'), 'the batch was acknowledged');
  });

  it('stop() aborts an idle blocking read instead of waiting out its BLOCK', async () => {
    vi.useFakeTimers();
    const stubs = stubRedis();
    const consumer = consumerWith(stubs);

    consumer.start();
    await vi.advanceTimersByTimeAsync(40 * 1000); // now inside a 30s BLOCK
    const stopped = consumer.stop();
    await vi.advanceTimersByTimeAsync(0);
    await stopped;

    assert.strictEqual(stubs.blockingRedis.status, 'end');
  });
});
