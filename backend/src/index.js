import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { logger, httpLogger } from './config/logger.js';
import connectDB from './config/db.js';
import { errorHandler, notFound } from './middleware/error.js';
import { metricsMiddleware, metricsAuth, metricsHandler } from './middleware/metrics.js';

// Import routes
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import analyticsRoutes from './routes/analytics.js';

// Connect to database
connectDB();

const app = express();

app.set('trust proxy', true);

// Structured logging with request-ID propagation (must run before routes)
app.use(httpLogger);

// Middleware
app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

app.use(metricsMiddleware);

// Local rate limiting fallback; replaced on the redirect/auth/link-creation
// paths by the Redis-backed sliding-window limiter in Phase 5.
const limiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later',
});

app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is running' });
});

// Metrics (protected)
app.get('/metrics', metricsAuth, metricsHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/r', analyticsRoutes); // Redirect route

// Error handling
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  server.close(() => process.exit(1));
});

export default app;
