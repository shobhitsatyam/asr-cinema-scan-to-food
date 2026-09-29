const dns = require('dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = require('./app');
const { connectDatabase } = require('./config/db');
const env = require('./config/env');

async function startServer() {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`ASR Cinema backend running on port ${env.port}`);
  });
}

startServer();