import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Factory function, not a side effect of importing this module: nothing
 * connects until this is called. Defaults to the configured production
 * URI, but accepts an override so tests can point it at a testcontainers
 * (or per-worker) database instead.
 *
 * By default, a connection failure exits the process — the real server
 * has no useful way to run without its database. Tests pass
 * `exitOnFailure: false` so a connection problem surfaces as a normal
 * thrown error instead of killing the test runner.
 */
const connectDB = async (uri = env.MONGODB_URI, { exitOnFailure = true } = {}) => {
  try {
    const conn = await mongoose.connect(uri, {
      maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
      minPoolSize: env.MONGODB_MIN_POOL_SIZE,
      maxIdleTimeMS: env.MONGODB_MAX_IDLE_TIME_MS,
      serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    });
    logger.info({ host: conn.connection.host }, 'MongoDB connected');
    return conn;
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection failed');
    if (exitOnFailure) {
      process.exit(1);
    }
    throw error;
  }
};

export default connectDB;
