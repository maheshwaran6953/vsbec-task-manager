import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

async function reset() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB. Wiping Tasks and Submissions...');
        await mongoose.connection.db.collection('tasks').deleteMany({});
        await mongoose.connection.db.collection('tasksubmissions').deleteMany({});
        console.log('Successfully wiped Tasks & Submissions collections.');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}

reset();
