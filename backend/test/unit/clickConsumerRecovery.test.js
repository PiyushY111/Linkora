import { describe, it, afterEach, vi } from 'vitest';
import assert from 'node:assert';
import { createClickConsumer } from '../../src/consumers/clickConsumer.js';

const MINUTE = 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
});

/** A read that stays blocked until disconnect() aborts it, like a real idle BLOCK. */
function blockedRead(state) {
  return new Promise((resolve, reject) => {
    state.abort = () => reject(new Error('Connection is closed.'));
  });
}

function stubs({ xautoclaim, xreadgroup }) {
  const acks = [];
  const state = {};
  const redis = {
    xautoclaim,
    async xack(...args) {
      acks.push(args.slice(2));
      return 1;
    },
  };
  const blockingRedis = {
    status: 'ready',
    xreadgroup: (...args) => xreadgroup(state, ...args),
    disconnect() {
      this.status = 'end';
      state.abort?.();
    },
  };
  return { redis, blockingRedis, acks };
}

describe('click consumer recovery', () => {
  it('acknowledges pending entries that XADD trimming already deleted', async () => {
    vi.useFakeTimers();
    const s = stubs({
      // Redis 7 XAUTOCLAIM: [next cursor, claimed entries, IDs deleted from the stream]
      xautoclaim: async () => ['0-0', [], ['111-0', '111-1']],
      xreadgroup: (state) => blockedRead(state),
    });
    const consumer = createClickConsumer({ ...s, consumerName: 't', blockMinMs: 1000, blockMaxMs: 1000, claimIntervalMs: 5 * MINUTE });

    consumer.start();
    await vi.advanceTimersByTimeAsync(10);
    assert.deepStrictEqual(s.acks, [['111-0', '111-1']], 'trimmed pending IDs are XACKed so the PEL cannot grow forever');
    await consumer.stop();
  });

  it('keeps polling after a read error, backing off first', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const s = stubs({
      xautoclaim: async () => ['0-0', [], []],
      xreadgroup: async (state) => {
        reads += 1;
        if (reads === 1) throw new Error('READONLY You can\'t write against a read only replica');
        return blockedRead(state);
      },
    });
    const consumer = createClickConsumer({ ...s, consumerName: 't', blockMinMs: 1000, blockMaxMs: 1000, claimIntervalMs: 5 * MINUTE });

    consumer.start();
    await vi.advanceTimersByTimeAsync(10);
    assert.strictEqual(reads, 1);
    await vi.advanceTimersByTimeAsync(1100); // ERROR_BACKOFF_MS
    assert.strictEqual(reads, 2, 'the loop survived the error and read again');
    await consumer.stop();
  });
});
