import QRCode from 'qrcode';
import CircuitBreaker from 'opossum';
import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

async function uploadToCloudinary(tempPath) {
  return cloudinary.uploader.upload(tempPath, {
    folder: 'linkora/qrcodes',
    resource_type: 'auto',
    quality: 'auto',
  });
}

// Phase 6.3: 3s timeout, 50% error trip threshold. Once open, uploads fail
// fast to the Base64 fallback instead of waiting out Cloudinary per request.
const cloudinaryBreaker = new CircuitBreaker(uploadToCloudinary, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
});
cloudinaryBreaker.on('open', () => logger.warn({ breaker: 'cloudinary' }, 'Circuit breaker opened'));
cloudinaryBreaker.on('close', () => logger.info({ breaker: 'cloudinary' }, 'Circuit breaker closed'));

export const generateQRCode = async (url) => {
  // If Cloudinary credentials are not configured, use Base64 data URL
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY) {
    return await generateQRCodeBase64(url);
  }

  const tempPath = path.join('/tmp', `qr-${Date.now()}.png`);
  try {
    await QRCode.toFile(tempPath, url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      width: 300,
      margin: 1,
    });

    const result = await cloudinaryBreaker.fire(tempPath);
    return result.secure_url;
  } catch (error) {
    logger.warn({ err: error }, 'Cloudinary QR code upload failed, falling back to Base64');
    return await generateQRCodeBase64(url);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

export const generateQRCodeBase64 = async (url) => {
  try {
    return await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      width: 300,
      margin: 1,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating QR code');
    throw error;
  }
};
