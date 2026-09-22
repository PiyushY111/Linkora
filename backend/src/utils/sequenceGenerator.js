import crypto from 'crypto';
import { redis, linkSequenceKey } from '../services/cacheService.js';
import { env } from '../config/env.js';

/**
 * Distributed, collision-resistant short code generator.
 *
 * Zero database checks before insert: sequence numbers come from an atomic
 * Redis INCRBY, allocated in batches of 10,000 per app instance, then run
 * through a Feistel-network permutation before Base62 encoding so codes
 * don't reveal creation order.
 *
 * Deviation: the source spec's reference implementation is TypeScript; this
 * project has no TS toolchain (plain ESM + JSDoc throughout), so the same
 * algorithm is ported to JS with JSDoc types per the project's typescript
 * coding-style rule for .js files.
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
 * Feistel-network permutation over the 32-bit domain, so sequential Redis
 * counter values don't produce sequentially-guessable short codes.
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

const BATCH_SIZE = 10000n;

let blockNext = 0n;
let blockEnd = 0n; // exclusive upper bound of the currently-held block

/**
 * Allocates the next raw sequence value, pulling a fresh batch of
 * BATCH_SIZE from Redis only when the in-memory block is exhausted.
 * @returns {Promise<bigint>}
 */
async function nextSequenceValue() {
  if (blockNext >= blockEnd) {
    const max = await redis.incrby(linkSequenceKey(), Number(BATCH_SIZE));
    const maxBig = BigInt(max);
    blockNext = maxBig - BATCH_SIZE + 1n;
    blockEnd = maxBig + 1n;
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
