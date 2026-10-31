const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = require('./app');
const { connectDatabase } = require('./config/db');
const { ensureDefaultAdmin } = require('./services/authService');
const env = require('./config/env');

async function startServer() {
  const isConnected = await connectDatabase();

  if (!isConnected && env.nodeEnv === 'production') {
    console.error('Fatal: Cannot start server in production mode without a verified MongoDB connection.');
    process.exit(1);
  }

  if (isConnected) {
    try {
      await ensureDefaultAdmin();
    } catch (bootstrapErr) {
      if (env.nodeEnv === 'production') {
        console.error('Fatal: Admin bootstrap failed in production mode.');
        console.error(bootstrapErr.message);
        process.exit(1);
      } else {
        console.warn('Warning: Admin bootstrap failed in development mode:', bootstrapErr.message);
      }
    }
  }

  app.listen(env.port, () => {
    console.log(`ASR Cinema backend running on port ${env.port}`);
  });
}

startServer();