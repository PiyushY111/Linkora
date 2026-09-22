import QRCode from 'qrcode';
import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const generateQRCode = async (url) => {
  // If Cloudinary credentials are not configured, use Base64 data URL
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY) {
    return await generateQRCodeBase64(url);
  }

  try {
    const tempPath = path.join('/tmp', `qr-${Date.now()}.png`);
    await QRCode.toFile(tempPath, url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      width: 300,
      margin: 1,
    });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(tempPath, {
      folder: 'linkly/qrcodes',
      resource_type: 'auto',
      quality: 'auto',
    });

    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    return result.secure_url;
  } catch (error) {
    logger.warn({ err: error }, 'Cloudinary QR code upload failed, falling back to Base64');
    return await generateQRCodeBase64(url);
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
