const mongoose = require('mongoose');

const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/asr-cinema';

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`MongoDB connected: ${mongoUri}`);
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed. Starting in demo mode with in-memory fallback.');
    console.warn(error.message);
    return false;
  }
};

module.exports = {
  connectDatabase,
};
