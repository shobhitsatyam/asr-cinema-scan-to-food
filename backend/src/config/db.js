const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

const connectDatabase = async () => {
  const mongoUri = env.mongoUri;

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    const host = mongoose.connection.host || 'unknown-host';
    const name = mongoose.connection.name || 'unknown-db';
    console.log(`MongoDB connected successfully: host=${host}, database=${name}`);
    return true;
  } catch (error) {
    // If SRV lookup failed on local DNS resolver (common on some Windows/ISP networks), retry with public DNS
    if (error.message && error.message.includes('querySrv ECONNREFUSED')) {
      try {
        console.warn('DNS SRV lookup failed on default resolver. Retrying with public DNS resolvers (8.8.8.8, 1.1.1.1)...');
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 5000,
        });
        const host = mongoose.connection.host || 'unknown-host';
        const name = mongoose.connection.name || 'unknown-db';
        console.log(`MongoDB connected successfully via public DNS: host=${host}, database=${name}`);
        return true;
      } catch (retryError) {
        error = retryError;
      }
    }

    if (env.nodeEnv === 'production') {
      console.error('Fatal: MongoDB connection failed in production mode.');
      console.error(error.message);
      return false;
    }

    console.warn('MongoDB connection failed. Starting in development mode with in-memory fallback.');
    console.warn(error.message);
    return false;
  }
};

module.exports = {
  connectDatabase,
};
