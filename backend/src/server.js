const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = require('./app');
const { connectDatabase } = require('./config/db');
const env = require('./config/env');

async function startServer() {
  const isConnected = await connectDatabase();

  if (!isConnected && env.nodeEnv === 'production') {
    console.error('Fatal: Cannot start server in production mode without a verified MongoDB connection.');
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`ASR Cinema backend running on port ${env.port}`);
  });
}

startServer();