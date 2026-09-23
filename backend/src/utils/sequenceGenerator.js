import crypto from 'crypto';
import Counter from '../models/Counter.js';
import { env } from '../config/env.js';

/**
 * Distributed, collision-resistant short code generator.
 *
 * Sequence numbers come from an atomic Mongo counter (findOneAndUpdate +
 * $inc + upsert), allocated in blocks of 1,000 per app instance, then run
 * through a Feistel-network permutation before Base62 encoding so codes
 * don't reveal creation order.
 *
 * Why Mongo and not Redis: this counter must never repeat or go backwards.
 * Redis is treated as a cache (a flush, a failover without persistence, or
 * a move to an evicting policy can drop any key), and for a counter that
 * means a silent reset back toward zero and duplicate short codes handed
 * out afterward. Mongo's atomic increment doesn't have that failure mode.
 */

const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * @param {bigint} num
 * @returns {string}
 */
export function encodeBase62(num) {
  let str = '';
  let n = num;
  while (n > 0n) {
    str = BASE62_CHARS[Number(n % 62n)] + str;
    n = n / 62n;
  }
  return str.padStart(6, '0');
}

const FEISTEL_ROUNDS = 4;
const HALF_BITS = 16n;
const HALF_MASK = (1n << HALF_BITS) - 1n;
// Domain is 2^32 (~4.29B codes); values are truncated to this width before
// permutation, which is comfortably above any realistic link volume for a
// single deployment while keeping codes at a fixed 6 Base62 characters.
const DOMAIN_MASK = (1n << (HALF_BITS * 2n)) - 1n;

function deriveRoundKeys(secret) {
  const keys = [];
  for (let i = 0; i < FEISTEL_ROUNDS; i++) {
    const digest = crypto.createHash('sha256').update(`${secret}:feistel-round:${i}`).digest();
    keys.push(BigInt(digest.readUInt32BE(0)) & HALF_MASK);
  }
  return keys;
}

const roundKeys = deriveRoundKeys(env.LINK_SEQUENCE_CIPHER_KEY || env.JWT_SECRET);

function roundFunction(half, roundKey) {
  let x = (half ^ roundKey) & HALF_MASK;
  x = (x * 2654435761n) & HALF_MASK; // Knuth multiplicative hash constant
  x = (x ^ (x >> 7n)) & HALF_MASK;
  return x;
}

/**
 * Feistel-network permutation over the 32-bit domain, so sequential counter
 * values don't produce sequentially-guessable short codes.
 * @param {bigint} n
 * @returns {bigint}
 */
export function feistelPermute(n) {
  let left = (n >> HALF_BITS) & HALF_MASK;
  let right = n & HALF_MASK;

  for (let i = 0; i < FEISTEL_ROUNDS; i++) {
    const nextLeft = right;
    const nextRight = left ^ roundFunction(right, roundKeys[i]);
    left = nextLeft;
    right = nextRight;
  }

  return ((left << HALF_BITS) | right) & DOMAIN_MASK;
}

const BATCH_SIZE = 1000n;
const COUNTER_ID = 'linkSequence';

let blockNext = 0n;
let blockEnd = 0n; // exclusive upper bound of the currently-held block

// Serializes concurrent block refills within this process: without this,
// N concurrent callers that all observe an exhausted block before any of
// them finishes refilling would each independently $inc the Mongo counter
// by a full BATCH_SIZE, burning through sequence space N times faster than
// necessary. Every caller that arrives while a refill is already in flight
// awaits that same promise instead of starting its own.
let refillPromise = null;

async function refillBlock() {
  const doc = await Counter.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: Number(BATCH_SIZE) } },
    { upsert: true, new: true }
  );
  const maxBig = BigInt(doc.seq);
  blockNext = maxBig - BATCH_SIZE + 1n;
  blockEnd = maxBig + 1n;
}

/**
 * Allocates the next raw sequence value, pulling a fresh block from Mongo
 * only when the in-memory block is exhausted.
 * @returns {Promise<bigint>}
 */
async function nextSequenceValue() {
  // A `while`, not an `if`: a caller that joins an in-flight refill must
  // re-check afterward, since more callers than BATCH_SIZE could have been
  // queued behind that single refill and already exhausted it by the time
  // this one resumes.
  while (blockNext >= blockEnd) {
    if (!refillPromise) {
      refillPromise = refillBlock().finally(() => {
        refillPromise = null;
      });
    }
    await refillPromise;
  }
  const value = blockNext;
  blockNext += 1n;
  return value;
}

/**
 * Generates the next collision-resistant, non-sequential short code.
 * @returns {Promise<string>}
 */
export async function generateSequencedShortCode() {
  const seq = await nextSequenceValue();
  const permuted = feistelPermute(seq & DOMAIN_MASK);
  return encodeBase62(permuted);
}

export default generateSequencedShortCode;
