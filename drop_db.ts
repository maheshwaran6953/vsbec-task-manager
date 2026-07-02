import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function dropDB() {
    const dns = await import('node:dns');
    dns.setServers(['8.8.8.8', '8.8.4.4']);

    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`Connected to: ${conn.connection.host}`);

    await mongoose.connection.dropDatabase();
    console.log('Database dropped successfully!');

    process.exit(0);
}

dropDB();
