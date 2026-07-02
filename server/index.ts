import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import fs from 'fs';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { connectDB } from './config/database';
import { NODE_ENV, PORT, FRONTEND_URL } from './config/env';
// Import cloudinary config to trigger diagnostic logging on startup
import './config/cloudinary';
import { seedData } from './seed';

// Import routes
import authRoutes from './routes/auth';
import departmentRoutes from './routes/departments';
import classRoutes from './routes/classes';
import userRoutes from './routes/users';
import taskRoutes from './routes/tasks';
import submissionRoutes from './routes/submissions';
import notificationRoutes from './routes/notifications';
import statsRoutes from './routes/stats';
import adminRoutes from './routes/admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Express App ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();
  await seedData();

  const app = express();
  // Trust proxy for correct IP detection on Render/Vercel
  app.set('trust proxy', 1);

  // ── Security configuration ───────────────────────────────────────────────────
  // Rate limiters removed to support high user volume (1000+) and prevent lockouts.

  app.use(express.json());
  app.use(cors({
    origin: (origin, callback) => {
      // If FRONTEND_URL is set, use it. Otherwise, allow any origin (safe for debugging split deploy)
      const allowedOrigin = FRONTEND_URL;
      if (!allowedOrigin || !origin || origin === allowedOrigin) {
        callback(null, origin || true);
      } else {
        // Fallback for when origins don't match but we still want to allow it during setup
        callback(null, true);
      }
    },
    credentials: true
  }));

  // ── Mount Routes ────────────────────────────────────────────────────────────
  app.use('/api', authRoutes);
  app.use('/api', departmentRoutes);
  app.use('/api', classRoutes);
  app.use('/api', userRoutes);
  app.use('/api', taskRoutes);
  app.use('/api', submissionRoutes);
  app.use('/api', notificationRoutes);
  app.use('/api', statsRoutes);
  app.use('/api', adminRoutes);

  // ── Vite Middleware ───────────────────────────────────────────────────────
  if (NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(path.join(__dirname, '..', 'dist'))) {
    // Only serve frontend if it exists locally (not needed for Render + Vercel stack)
    app.use(express.static(path.join(__dirname, '..', 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')));
  }

  // ── Global Error Handler ─────────────────────────────────────────────────────
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      details: NODE_ENV === "development" ? err.stack : undefined
    });
  });

  let port = PORT;
  const startApp = (p: number) => {
    const server = app.listen(p, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${p}`);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        process.stdout.write(`\rPort ${p} in use, trying ${p + 1}...\n`);
        startApp(p + 1);
      } else {
        console.error(err);
      }
    });
  };

  startApp(port);
}

startServer();
