import dotenv from 'dotenv';
dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
export const MONGODB_URI = process.env.MONGODB_URI || '';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const FRONTEND_URL = process.env.FRONTEND_URL;
