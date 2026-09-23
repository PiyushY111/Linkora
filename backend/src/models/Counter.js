import mongoose from 'mongoose';

/**
 * Generic atomic counters, used by utils/sequenceGenerator.js for the
 * short-code sequence. Previously this counter lived in Redis
 * (key:link_sequence); Redis is an evictable cache in this deployment
 * (cacheService.js's `cacheRedis` runs allkeys-lru), so a counter that
 * must never repeat or go backwards has no business living there — an
 * eviction (or a flush) would silently restart the sequence and produce
 * duplicate/colliding short codes. Mongo's findOneAndUpdate + $inc + upsert
 * gives the same atomic-increment guarantee without that risk.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false }
);

export default mongoose.model('Counter', counterSchema);
