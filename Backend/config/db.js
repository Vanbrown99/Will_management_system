/**
 * MongoDB Connection Configuration
 * Uses Mongoose with connection pooling and error handling
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options ensure stable connections in production
      maxPoolSize: 10,          // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Timeout after 5s if no server found
      socketTimeoutMS: 45000,   // Close sockets after 45s of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Exit process with failure — let process manager restart it
    process.exit(1);
  }
};

module.exports = connectDB;
