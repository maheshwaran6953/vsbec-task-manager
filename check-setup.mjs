import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

console.log('--- Academic Task Management System Setup Check ---');

// 1. Check Node version
console.log(`[1/3] Checking Node.js version: ${process.version}`);
const versionMajor = parseInt(process.version.slice(1).split('.')[0]);
if (versionMajor < 18) {
    console.warn('  [!] Highly recommended to use Node.js v18 or higher.');
} else {
    console.log('  [OK] Node.js version is compatible.');
}

// 2. Check node_modules
const nodeModulesPath = path.join(__dirname, 'node_modules');
console.log(`[2/3] Checking node_modules: ${nodeModulesPath}`);
if (fs.existsSync(nodeModulesPath)) {
    console.log('  [OK] node_modules folder found.');
} else {
    console.error('  [ERROR] node_modules folder NOT found. Run "npm install" first.');
}

// 3. Check MongoDB connection
console.log('[3/3] Checking MongoDB connection...');
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
    console.error('  [ERROR] MONGODB_URI not found in .env file.');
    process.exit(1);
}

const maskedUri = mongoUri.replace(/\/\/.*@/, '//****:****@');
console.log(`  Connecting to: ${maskedUri}`);

try {
    // Use a timeout for the connection attempt
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('  [OK] Successfully connected to MongoDB.');
    await mongoose.disconnect();
} catch (error) {
    console.error(`  [ERROR] Could not connect to MongoDB: ${error.message}`);
    console.error('  Check your internet connection and verify your MONGODB_URI in the .env file.');
}

console.log('\nSetup check complete.');
