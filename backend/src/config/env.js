require('dotenv').config();

const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultLocalOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const checkCorsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (envOrigins.includes(origin) || defaultLocalOrigins.includes(origin)) {
    return callback(null, true);
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+):(5173|5174)$/.test(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
};

module.exports = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asr-cinema',
  corsOrigin: checkCorsOrigin,
  nodeEnv: process.env.NODE_ENV || 'development',
  paymentGatewayKeyId: process.env.PAYMENT_GATEWAY_KEY_ID || '',
  paymentGatewayKeySecret: process.env.PAYMENT_GATEWAY_KEY_SECRET || '',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
};
