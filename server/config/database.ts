import mongoose from 'mongoose';
import { MONGODB_URI } from './env';

export const connectDB = async () => {
  try {
    // Force Node to use Google DNS for SRV records if ISP blocks it
    const dns = await import('node:dns');
    dns.setServers(['8.8.8.8', '8.8.4.4']);

    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};
