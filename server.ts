import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose, { Schema, Document, Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import fs from 'fs';
import { z } from 'zod';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// ─── Cloudinary Config & Diagnostics ──────────────────────────────────────────
const cloudinaryConfig = {
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
};

// Diagnostic logging (visible in Render logs)
const maskSecret = (s: string) => s ? `${s.substring(0, 3)}...${s.substring(s.length - 3)} (Len: ${s.length})` : "MISSING";
console.log("--- Cloudinary Diagnostic ---");
console.log("Cloud Name:", cloudinaryConfig.cloud_name || "MISSING");
console.log("API Key:", maskSecret(cloudinaryConfig.api_key));
console.log("API Secret:", maskSecret(cloudinaryConfig.api_secret));

if (cloudinaryConfig.api_secret) {
  if (cloudinaryConfig.api_secret.length === 42) {
    console.warn("⚠️ CAUTION: API Secret length is 42. Most Cloudinary secrets are 27. You may have pasted the API Key or URL into this field!");
  }
  if (/[A-Z]/.test(cloudinaryConfig.api_secret)) {
    console.log("NOTE: API Secret contains uppercase letters. Ensure this matches your Cloudinary Dashboard exactly (it usually does not).");
  }
  if (cloudinaryConfig.api_secret.includes(' ') || cloudinaryConfig.api_secret.includes('\n')) {
    console.warn("⚠️ WARNING: Cloudinary API Secret contains whitespace/newlines! Trimming applied.");
  }
}
console.log("-----------------------------");

cloudinary.config(cloudinaryConfig);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const connectDB = async () => {
  try {
    // Force Node to use Google DNS for SRV records if ISP blocks it
    const dns = await import('node:dns');
    dns.setServers(['8.8.8.8', '8.8.4.4']);

    const conn = await mongoose.connect(process.env.MONGODB_URI || '');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`MongoDB Error: ${error.message}`);
    process.exit(1);
  }
};

// ─── Mongoose Schemas ─────────────────────────────────────────────────────────

// Department
const departmentSchema = new Schema({
  name: { type: String, unique: true, required: true },
}, { timestamps: true });
const Department = mongoose.model('Department', departmentSchema);

// Class
const classSchema = new Schema({
  name: { type: String, required: true },
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  year: { type: Number },
  batch: { type: String },
}, { timestamps: true });
const Class = mongoose.model('Class', classSchema);

// User
const userSchema = new Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true }, // 'SUPREME_ADMIN','HOD','CLASS_ADVISOR','STUDENT'
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  class_id: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  full_name: { type: String },
  email: { type: String },
  register_number: { type: String, unique: true, sparse: true },
  is_coordinator: { type: Boolean, default: false },
  is_year_coordinator: { type: Boolean, default: false },
  year_scope: { type: Number, default: null },
  must_change_password: { type: Boolean, default: true },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password on save, and normalize empty strings to undefined (removes from DB)
userSchema.pre('save', async function () {
  // Set to undefined so sparse unique index ignores these fields
  if (this.register_number === '' || this.register_number === null) {
    this.register_number = undefined;
  }
  if (this.email === '' || this.email === null) {
    this.email = undefined;
  }
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});
const User = mongoose.model('User', userSchema);

// Task
const taskSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  external_link: { type: String },
  deadline: { type: Date },
  screenshot_instruction: { type: String },
  custom_field_label: { type: String },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  class_ids: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  status: { type: String, default: 'OPEN' }, // 'OPEN','CLOSED'
}, { timestamps: true });
taskSchema.index({ department_id: 1 });
taskSchema.index({ class_ids: 1 });
const Task = mongoose.model('Task', taskSchema);

// Task Submission
const taskSubmissionSchema = new Schema({
  task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  custom_field_value: { type: String },
  status: { type: String, default: 'PENDING' }, // 'PENDING','SUBMITTED','VERIFIED','REJECTED'
  screenshot_url: { type: String },
  verification_note: { type: String },
  rejection_reason: { type: String },
  resubmission_count: { type: Number, default: 0 },
  submitted_at: { type: Date },
  verified_at: { type: Date },
}, { timestamps: true });
taskSubmissionSchema.index({ task_id: 1, user_id: 1 });
const TaskSubmission = mongoose.model('TaskSubmission', taskSubmissionSchema);

// Notification
const notificationSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  is_read: { type: Boolean, default: false },
}, { timestamps: true });
const Notification = mongoose.model('Notification', notificationSchema);

// ─── Seeding ──────────────────────────────────────────────────────────────────
async function seedData() {
  try {
    // 1. Clear out empty/null strings that collide with unique sparse indexes
    await User.updateMany({ register_number: '' }, { $unset: { register_number: "" } });
    await User.updateMany({ email: '' }, { $unset: { email: "" } });

    // 2. Universal Sync 2.0: The Deep Scrub
    const allUsers = await User.find({});
    console.log(`[SYNC] Commencing Universal Sync 2.0 for ${allUsers.length} users...`);

    let fixCount = 0;
    for (const u of allUsers) {
      try {
        let changed = false;
        const cleanUsername = (u.username || '').toString().replace(/\s+/g, '').trim();
        const cleanRegNo = (u.register_number || '').toString().replace(/\s+/g, '').trim();

        if (u.username !== cleanUsername && cleanUsername !== '') {
          u.username = cleanUsername;
          changed = true;
        }

        if (u.register_number !== cleanRegNo) {
          if (cleanRegNo === '') {
            // Use findByIdAndUpdate to $unset to avoid unique index collisions with ''
            await User.findByIdAndUpdate(u._id, { $unset: { register_number: "" } });
            u.register_number = undefined;
          } else {
            u.register_number = cleanRegNo;
            changed = true;
          }
        }

        // 3. Password Alignment & Force Activation
        // If they are a student, we ALWAYS ensure they are in must_change_password state
        // unless they have explicitly been finalized. 
        // For security and synchronization, we reset them to their default ID-based password.
        if (u.username !== 'admin') {
          const isStudent = u.role === 'STUDENT';
          // Force reset if:
          // - must_change_password is true (normal case)
          // - must_change_password is false but they are a student (Fixes the default:false bug)
          // - must_change_password is undefined
          if (u.must_change_password !== false || isStudent) {
            const defaultPass = cleanRegNo || cleanUsername;
            if (defaultPass) {
              const newHash = bcrypt.hashSync(defaultPass, 10);
              // Only update if the hash is different or flag is wrong
              if (u.password !== newHash || u.must_change_password !== true) {
                u.password = newHash;
                u.must_change_password = true;
                changed = true;
              }
            }
          }
        }

        if (changed) {
          await User.findByIdAndUpdate(u._id, {
            username: u.username,
            register_number: u.register_number,
            password: u.password,
            must_change_password: u.must_change_password
          });
          fixCount++;
        }
      } catch (userErr: any) {
        console.error(`[SYNC] Error syncing user ${u.username}:`, userErr.message);
      }
    }
    console.log(`[SYNC] Completed. Cleaned/Synced ${fixCount} accounts.`);

    // 4. Ensure Supreme Admin exists
    const adminExists = await User.findOne({ role: 'SUPREME_ADMIN' });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'SUPREME_ADMIN',
        full_name: 'Supreme Administrator',
        must_change_password: true
      });
      await admin.save();
      console.log('Supreme Admin seeded: admin / admin123');
    }
  } catch (err) {
    console.error('[SYNC] Critical failure in seedData:', err);
  }
}
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
      const allowedOrigin = process.env.FRONTEND_URL;
      if (!allowedOrigin || !origin || origin === allowedOrigin) {
        callback(null, origin || true);
      } else {
        // Fallback for when origins don't match but we still want to allow it during setup
        callback(null, true);
      }
    },
    credentials: true
  }));

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch (e) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  const authorize = (roles: string[]) => (req: any, res: any, next: any) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, res) => {
    const { username: rawUsername, password: rawPassword, role } = req.body;
    const username = (rawUsername || '').toString().replace(/\s+/g, '').trim();
    const password = (rawPassword || '').toString().trim();

    const user: any = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { register_number: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ],
    });

    if (!user) {
      console.log(`[AUTH] Failure: User not found [${username}]`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let isMatch = bcrypt.compareSync(password, user.password);

    // Fallback: If no match, try scrubbing internal spaces from the password
    // This handles users who think their password (e.g. Register Number) still has spaces
    if (!isMatch && password.includes(' ')) {
      const scrubbedPassword = password.replace(/\s+/g, '');
      isMatch = bcrypt.compareSync(scrubbedPassword, user.password);
      if (isMatch) console.log(`[AUTH] Fallback Match: ${username} logged in with space-scrubbed password.`);
    }

    if (!isMatch) {
      console.log(`[AUTH] Failure: Password mismatch for ${username}. Input: [${password.substring(0, 1)}***]`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log(`[AUTH] Success: ${username} logged in as ${user.role}`);

    if (role) {
      console.log(`[AUTH] Validating role ${role} for user ${user.username} (Role: ${user.role}, Coordinator: ${user.is_coordinator})`);
      if (role === 'STUDENT_COORDINATOR') {
        if (user.role !== 'STUDENT' || !user.is_coordinator) {
          console.log(`[AUTH] Role Fail: User is ${user.role}, is_coordinator: ${user.is_coordinator}`);
          return res.status(403).json({ error: 'This account is not registered as a Coordinator' });
        }
      } else if (role === 'STUDENT') {
        if (user.role !== 'STUDENT') {
          console.log(`[AUTH] Role Fail: Expected STUDENT, got ${user.role}`);
          return res.status(403).json({ error: 'This account is not registered as a Student' });
        }
      } else if (user.role !== role) {
        console.log(`[AUTH] Role Fail: Expected ${role}, got ${user.role}`);
        const roleMap: Record<string, string> = {
          'CLASS_ADVISOR': 'Class Advisor',
          'HOD': 'Department HOD',
          'SUPREME_ADMIN': 'Supreme Admin'
        };
        return res.status(403).json({ error: `This account is not registered as a ${roleMap[role] || role}` });
      }
    }

    const token = jwt.sign({
      id: user._id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      class_id: user.class_id,
      is_coordinator: Boolean(user.is_coordinator),
      is_year_coordinator: Boolean(user.is_year_coordinator),
      year_scope: user.year_scope,
    }, JWT_SECRET);

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        department_id: user.department_id,
        class_id: user.class_id,
        must_change_password: user.must_change_password,
        is_coordinator: Boolean(user.is_coordinator),
        is_year_coordinator: Boolean(user.is_year_coordinator),
        year_scope: user.year_scope,
      }
    });
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    const user: any = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      department_id: user.department_id,
      class_id: user.class_id,
      must_change_password: user.must_change_password,
      is_coordinator: Boolean(user.is_coordinator),
      is_year_coordinator: Boolean(user.is_year_coordinator),
      year_scope: user.year_scope,
    });
  });

  app.patch('/api/auth/change-password', authenticate, async (req: any, res) => {
    const { newPassword } = req.body;
    const hashed = bcrypt.hashSync(newPassword, 10);
    await User.findByIdAndUpdate(req.user.id, { password: hashed, must_change_password: false });
    res.json({ success: true });
  });

  // ── Departments ───────────────────────────────────────────────────────────
  app.get('/api/departments', authenticate, async (req, res) => {
    const depts = await Department.find().sort({ createdAt: 1 });
    res.json(depts.map(d => ({ id: d._id, name: d.name, created_at: d.createdAt })));
  });

  app.post('/api/departments', authenticate, authorize(['SUPREME_ADMIN']), async (req, res) => {
    const { name } = req.body;
    try {
      const d = await Department.create({ name });
      res.json({ id: d._id, name: d.name });
    } catch (e) {
      res.status(400).json({ error: 'Department already exists' });
    }
  });

  app.delete('/api/departments/:id', authenticate, authorize(['SUPREME_ADMIN']), async (req, res) => {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  });

  // ── Classes ───────────────────────────────────────────────────────────────
  app.get('/api/classes', authenticate, async (req: any, res) => {
    let classes;
    if (req.user.role === 'SUPREME_ADMIN') {
      classes = await Class.find().populate('department_id', 'name').sort({ createdAt: 1 });
      return res.json(classes.map((c: any) => ({
        id: c._id, name: c.name, year: c.year, batch: c.batch,
        department_id: c.department_id?._id,
        department_name: c.department_id?.name,
      })));
    } else {
      classes = await Class.find({ department_id: req.user.department_id }).sort({ year: 1 });
      return res.json(classes.map((c: any) => ({
        id: c._id, name: c.name, year: c.year, batch: c.batch,
        department_id: c.department_id,
      })));
    }
  });

  app.post('/api/classes', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
    const { name, department_id, year, batch } = req.body;
    if (req.user.role === 'CLASS_ADVISOR') {
      if (!req.user.class_id) return res.status(400).json({ error: 'No class assigned to advisor' });
      await Class.findByIdAndUpdate(req.user.class_id, { name, year, batch });
      return res.json({ id: req.user.class_id, name, year, batch });
    }
    const deptId = req.user.role === 'SUPREME_ADMIN' ? department_id : req.user.department_id;
    const c = await Class.create({ name, department_id: deptId, year, batch });
    res.json({ id: c._id, name: c.name, department_id: deptId, year, batch });
  });

  app.delete('/api/classes/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), async (req: any, res) => {
    const classId = req.params.id;
    if (req.user.role === 'HOD') {
      const cls: any = await Class.findById(classId);
      if (!cls || cls.department_id.toString() !== req.user.department_id.toString()) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await User.deleteMany({ class_id: classId });
    await Task.deleteMany({ class_id: classId });
    await Class.findByIdAndDelete(classId);
    res.json({ success: true });
  });

  app.get('/api/my-class', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
    if (!req.user.class_id) return res.json(null);
    const cls: any = await Class.findById(req.user.class_id);
    if (!cls) return res.json(null);
    res.json({ id: cls._id, name: cls.name, year: cls.year, batch: cls.batch, department_id: cls.department_id });
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  app.get('/api/users', authenticate, async (req: any, res) => {
    let users: any[];
    const selectFields = 'username role full_name email register_number is_coordinator is_year_coordinator year_scope must_change_password is_active department_id class_id';

    if (req.user.role === 'SUPREME_ADMIN') {
      users = await User.find({ role: { $ne: 'SUPREME_ADMIN' } }).select(selectFields)
        .populate('department_id', 'name')
        .populate('class_id', 'name')
        .sort({ role: 1, createdAt: -1 });
    } else if (req.user.role === 'HOD') {
      users = await User.find({ department_id: req.user.department_id, role: { $ne: 'SUPREME_ADMIN' } })
        .select(selectFields).populate('class_id', 'name');
    } else if (req.user.role === 'CLASS_ADVISOR' || (req.user.role === 'STUDENT' && req.user.is_coordinator)) {
      users = await User.find({ class_id: req.user.class_id, role: 'STUDENT' })
        .select(selectFields).populate('class_id', 'name');
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(users.map((u: any) => ({
      id: u._id,
      username: u.username,
      role: u.role,
      full_name: u.full_name,
      email: u.email,
      register_number: u.register_number,
      is_coordinator: u.is_coordinator,
      must_change_password: u.must_change_password,
      is_active: u.is_active,
      department_id: u.department_id?._id || u.department_id,
      department_name: u.department_id?.name,
      class_id: u.class_id?._id || u.class_id,
      class_name: u.class_id?.name,
      is_year_coordinator: u.is_year_coordinator,
      year_scope: u.year_scope,
    })));
  });

  app.post('/api/users', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
    const { username, password, role, department_id, class_id, full_name, email, register_number, is_year_coordinator, year_scope } = req.body;

    let userRole = role;
    let deptId = department_id;
    let clsId = class_id;

    if (req.user.role === 'CLASS_ADVISOR') {
      userRole = 'STUDENT'; deptId = req.user.department_id; clsId = req.user.class_id;
    } else if (req.user.role === 'HOD') {
      userRole = role === 'STUDENT' ? 'STUDENT' : 'CLASS_ADVISOR';
      deptId = req.user.department_id;
    }

    const finalPassword = (password || register_number || username || "").toString().trim();
    const mustChange = (req.user.role === 'CLASS_ADVISOR' || userRole === 'STUDENT') ? true : false;

    try {
      const u = new User({
        username: username.trim(),
        password: finalPassword,
        role: userRole,
        department_id: deptId || null,
        class_id: clsId || null,
        full_name: full_name?.trim(),
        email: email?.trim() || null,
        register_number: register_number?.trim() || null,
        must_change_password: mustChange,
        is_year_coordinator: is_year_coordinator || false,
        year_scope: year_scope || null,
      });
      await u.save();
      res.json({ id: u._id, username, role: userRole, department_id: deptId, class_id: clsId, full_name, email, register_number });
    } catch (e: any) {
      const isDuplicate = e.code === 11000;
      const field = isDuplicate ? (e.keyPattern?.username ? 'Username' : 'Register Number') : '';
      res.status(400).json({ error: isDuplicate ? `${field} already exists. Please choose a different one.` : 'Failed to create user' });
    }
  });

  app.post('/api/students/bulk', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
    const { students } = req.body;
    const classId = req.user.class_id;
    const deptId = req.user.department_id;
    if (!classId) return res.status(400).json({ error: 'You are not assigned to any class.' });

    let success = 0, failed = 0;
    for (const s of students) {
      try {
        const regNo = String(s.register_number).trim();
        const u = new User({
          username: regNo, password: regNo, role: 'STUDENT',
          department_id: deptId, class_id: classId,
          full_name: s.name?.trim(), email: s.email?.trim() || null,
          register_number: regNo, must_change_password: true,
        });
        await u.save();
        success++;
      } catch { failed++; }
    }
    res.json({ success, failed });
  });

  app.patch('/api/users/:id/coordinator', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
    const { is_coordinator } = req.body;
    const classId = req.user.class_id;
    if (is_coordinator) {
      const count = await User.countDocuments({ class_id: classId, is_coordinator: true });
      if (count >= 2) return res.status(400).json({ error: 'Maximum 2 coordinators allowed per class' });
    }
    await User.findOneAndUpdate({ _id: req.params.id, class_id: classId }, { is_coordinator });
    res.json({ success: true });
  });

  app.patch('/api/users/:id/year-coordinator', authenticate, authorize(['HOD', 'SUPREME_ADMIN']), async (req: any, res) => {
    const { is_year_coordinator, year_scope } = req.body;
    const target: any = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // HOD can only manage users in their department
    if (req.user.role === 'HOD' && target.department_id?.toString() !== req.user.department_id?.toString()) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only CLASS_ADVISOR can be toggled as Year Coordinator (per original plan)
    if (target.role !== 'CLASS_ADVISOR' && is_year_coordinator) {
      return res.status(400).json({ error: 'Only Class Advisors can be assigned as Year Coordinators' });
    }

    await User.findByIdAndUpdate(req.params.id, {
      is_year_coordinator,
      year_scope: is_year_coordinator ? year_scope : null
    });
    res.json({ success: true });
  });

  app.patch('/api/users/:id/status', authenticate, authorize(['CLASS_ADVISOR', 'HOD', 'SUPREME_ADMIN']), async (req: any, res) => {
    const { is_active } = req.body;
    await User.findByIdAndUpdate(req.params.id, { is_active });
    res.json({ success: true });
  });

  app.patch('/api/users/:id/reset-password', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
    const targetUser: any = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'HOD' && targetUser.department_id?.toString() !== req.user.department_id?.toString())
      return res.status(403).json({ error: 'Forbidden' });
    if (req.user.role === 'CLASS_ADVISOR' && targetUser.class_id?.toString() !== req.user.class_id?.toString())
      return res.status(403).json({ error: 'Forbidden' });

    const newPass = targetUser.register_number || targetUser.username;
    const hashed = bcrypt.hashSync(newPass, 10);
    await User.findByIdAndUpdate(req.params.id, { password: hashed, must_change_password: true });
    res.json({ success: true, message: `Password reset to ${newPass}` });
  });

  app.delete('/api/users/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
    const target: any = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    // SA can delete anyone except themselves
    if (req.user.role === 'SUPREME_ADMIN') {
      if (target.role === 'SUPREME_ADMIN') return res.status(403).json({ error: 'Cannot delete Supreme Admin account' });
    } else if (req.user.role === 'HOD') {
      if (!target || target.department_id?.toString() !== req.user.department_id?.toString() ||
        target.role === 'SUPREME_ADMIN' || target.role === 'HOD')
        return res.status(403).json({ error: 'Forbidden' });
    } else if (req.user.role === 'CLASS_ADVISOR') {
      // Advisors can only remove students from their own class
      if (target.role !== 'STUDENT' || target.class_id?.toString() !== req.user.class_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const populateTask = (q: any) => q
    .populate('created_by', 'full_name')
    .populate('department_id', 'name');

  const formatTask = (t: any) => ({
    id: t._id,
    title: t.title,
    description: t.description,
    category: t.category,
    external_link: t.external_link,
    deadline: t.deadline,
    screenshot_instruction: t.screenshot_instruction,
    custom_field_label: t.custom_field_label,
    creator_name: t.created_by?.full_name || 'Admin',
    department_id: t.department_id?._id || t.department_id,
    department_name: t.department_id?.name || null,
    class_ids: t.class_ids || [],
    status: t.status,
    created_at: t.createdAt
  });

  app.get('/api/tasks', authenticate, async (req: any, res) => {
    let queryArgs: any;
    const dbUser: any = await User.findById(req.user.id);
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    if (dbUser.role === 'SUPREME_ADMIN') {
      queryArgs = {};
    } else if (dbUser.role === 'STUDENT' || dbUser.role === 'CLASS_ADVISOR') {
      queryArgs = {
        $or: [
          { created_by: dbUser._id },
          { department_id: null, class_ids: { $size: 0 } },
          { department_id: dbUser.department_id, class_ids: { $size: 0 } },
          { class_ids: { $in: [dbUser.class_id] } },
        ]
      };
      if (dbUser.is_year_coordinator) {
        const yearClasses = await Class.find({ department_id: dbUser.department_id, year: dbUser.year_scope });
        const yearClassIds = yearClasses.map(c => c._id);
        queryArgs.$or.push({ class_ids: { $in: yearClassIds } });
      }
    } else {
      // HOD
      const deptClasses = await Class.find({ department_id: dbUser.department_id });
      const deptClassIds = deptClasses.map(c => c._id);
      queryArgs = {
        $or: [
          { created_by: dbUser._id },
          { department_id: null, class_ids: { $size: 0 } }, // Global
          { department_id: dbUser.department_id }, // Dept wide or class within dept if dept_id set
          { class_ids: { $in: deptClassIds } } // Tasks for classes in this dept
        ]
      };
    }

    const tasks = await populateTask(Task.find(queryArgs).sort({ createdAt: -1 }));
    const taskIds = tasks.map(t => t._id);
    const subCounts = await TaskSubmission.aggregate([
      { $match: { task_id: { $in: taskIds }, status: { $in: ['SUBMITTED', 'VERIFIED'] } } },
      { $group: { _id: '$task_id', count: { $sum: 1 } } }
    ]);
    const countsMap = Object.fromEntries(subCounts.map(c => [c._id.toString(), c.count]));

    res.json(tasks.map((t: any) => ({
      ...formatTask(t),
      submission_count: countsMap[t._id.toString()] || 0
    })));
  });

  // ── Validation Schemas ───────────────────────────────────────────────────────
  const taskSchemaValidator = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    external_link: z.string().optional().nullable(),
    deadline: z.string().optional().nullable(),
    screenshot_instruction: z.string().optional().nullable(),
    custom_field_label: z.string().optional().nullable(),
    department_id: z.union([z.string(), z.number(), z.null()]).optional(),
    class_ids: z.array(z.any()).optional().nullable(),
  });

  const submissionSchemaValidator = z.object({
    task_id: z.string().min(1, 'Task ID is required'),
    custom_field_value: z.string().optional()
  });

  app.post('/api/tasks', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
    try {
      taskSchemaValidator.parse(req.body);
    } catch (e: any) {
      let errorMessage = 'Invalid task data';
      if (e && e.errors && Array.isArray(e.errors)) {
        errorMessage = e.errors.map((err: any) => err.message || String(err)).join(', ');
      } else if (e && e.message) {
        errorMessage = e.message;
      }
      console.error('Task validation failed:', errorMessage, '| Body:', JSON.stringify(req.body));
      return res.status(400).json({ error: errorMessage });
    }
    const { title, description, category, external_link, deadline, screenshot_instruction, custom_field_label, department_id, class_ids } = req.body;

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator)
      return res.status(403).json({ error: 'Only coordinators can post tasks' });

    // Fetch latest user data to avoid stale JWT issues
    const dbUser: any = await User.findById(req.user.id);
    if (!dbUser) return res.status(401).json({ error: 'User not found' });

    let deptId = department_id;
    let clsIds = class_ids || [];

    // Role-based restrictions
    if (dbUser.role === 'CLASS_ADVISOR' || (dbUser.role === 'STUDENT' && dbUser.is_coordinator)) {
      deptId = dbUser.department_id;
      // If NOT a year coordinator, OR specifically selected classes, or NOT a year-wide attempt
      if (!dbUser.is_year_coordinator || (class_ids && class_ids.length > 0)) {
        clsIds = (class_ids && class_ids.length > 0) ? class_ids : [dbUser.class_id];
      }
    } else if (dbUser.role === 'HOD') {
      deptId = dbUser.department_id;
    }

    // Year Coordinator expansion
    if (dbUser.is_year_coordinator && !department_id && (!class_ids || class_ids.length === 0)) {
      const yearClasses = await Class.find({ department_id: dbUser.department_id, year: dbUser.year_scope });
      if (yearClasses.length > 0) {
        clsIds = yearClasses.map(c => c._id);
      }
    }

    try {
      const t = await Task.create({
        title, description, category, external_link,
        deadline: deadline || null,
        screenshot_instruction, custom_field_label,
        created_by: req.user.id,
        department_id: deptId || null,
        class_ids: clsIds,
      });
      res.json(t);
    } catch (err: any) {
      console.error("Task Creation Error DB:", err);
      res.status(500).json({ error: err.message || 'Failed to create task' });
    }
  });

  app.patch('/api/tasks/:id/status', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), async (req: any, res) => {
    const { status } = req.body;
    if (req.user.role === 'HOD') {
      const task: any = await Task.findById(req.params.id);
      if (!task || task.department_id?.toString() !== req.user.department_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }
    await Task.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true });
  });

  app.delete('/api/tasks/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
    const task: any = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isOwner = task.created_by.toString() === req.user.id.toString();
    const isAdmin = req.user.role === 'SUPREME_ADMIN';
    const isDeptHOD = req.user.role === 'HOD' && task.department_id?.toString() === req.user.department_id?.toString();
    const isClassAdvisor = req.user.role === 'CLASS_ADVISOR' && task.class_ids.some((id: any) => id.toString() === req.user.class_id?.toString());
    const isCoordinator = req.user.role === 'STUDENT' && req.user.is_coordinator && task.class_ids.some((id: any) => id.toString() === req.user.class_id?.toString());

    if (!isOwner && !isAdmin && !isDeptHOD && !isClassAdvisor && !isCoordinator)
      return res.status(403).json({ error: 'Forbidden' });

    await TaskSubmission.deleteMany({ task_id: req.params.id });
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get('/api/stats/hod', authenticate, authorize(['HOD']), async (req: any, res) => {
    const deptId = req.user.department_id;

    const classes = await Class.find({ department_id: deptId });
    const studentsByClass: any = {};
    const deptStudents = await User.find({ department_id: deptId, role: 'STUDENT' });
    const deptStudentIds = deptStudents.map(s => s._id.toString());

    for (const c of classes) {
      const students = deptStudents.filter(u => u.class_id?.toString() === c._id.toString());
      studentsByClass[c._id.toString()] = students;
    }

    const classIds = classes.map(c => c._id);
    const tasks = await Task.find({
      $or: [
        { department_id: deptId },
        { class_ids: { $in: classIds } },
        { department_id: null, class_ids: { $size: 0 } }
      ]
    });
    const taskStats = await Promise.all(tasks.map(async (t) => {
      const subs = await TaskSubmission.find({ task_id: t._id });

      const class_breakdown = classes.map(c => {
        const isAssigned = !t.class_ids?.length || t.class_ids.some((id: any) => id.toString() === c._id.toString());

        if (!isAssigned) {
          return {
            class_name: c.name,
            total_students: 0,
            completed: 0,
            not_completed: 0
          };
        }

        const classStudents = studentsByClass[c._id.toString()] || [];
        const studentIds = classStudents.map((s: any) => s._id.toString());
        // Deduplicate by user_id to count unique students who completed
        const completedStudentIds = new Set(subs.filter(s =>
          (s.status === 'SUBMITTED' || s.status === 'VERIFIED') &&
          s.user_id && studentIds.includes(s.user_id.toString())
        ).map(s => s.user_id.toString()));

        return {
          class_name: c.name,
          total_students: classStudents.length,
          completed: completedStudentIds.size,
          not_completed: classStudents.length - completedStudentIds.size
        };
      });

      // Map to keep track of latest student-task-status
      const studentStatuses = new Map();
      subs.filter(s => s.user_id && deptStudentIds.includes(s.user_id.toString())).forEach(s => {
        studentStatuses.set(s.user_id.toString(), s.status);
      });
      const statuses = Array.from(studentStatuses.values());

      return {
        id: t._id, title: t.title,
        submitted: statuses.filter(s => s === 'SUBMITTED').length,
        verified: statuses.filter(s => s === 'VERIFIED').length,
        pending: statuses.filter(s => s === 'PENDING').length,
        rejected: statuses.filter(s => s === 'REJECTED').length,
        class_breakdown
      };
    }));

    const classStats = await Promise.all(classes.map(async (c) => {
      const classStudents = studentsByClass[c._id.toString()] || [];
      const studentIds = classStudents.map((s: any) => s._id);
      const participating = await TaskSubmission.distinct('user_id', { user_id: { $in: studentIds } });
      return {
        id: c._id, name: c.name,
        total_students: classStudents.length,
        participating_students: participating.length,
      };
    }));

    const total_students = await User.countDocuments({ department_id: deptId, role: 'STUDENT' });
    const total_advisors = await User.countDocuments({ department_id: deptId, role: 'CLASS_ADVISOR' });
    const total_classes = await Class.countDocuments({ department_id: deptId });

    res.json({ taskStats, classStats, total_students, total_advisors, total_classes });
  });

  app.get('/api/stats/coordinator', authenticate, async (req: any, res) => {
    if (req.user.role !== 'STUDENT' || !req.user.is_coordinator)
      return res.status(403).json({ error: 'Only coordinators can access these stats' });

    const classId = req.user.class_id;
    const deptId = req.user.department_id;

    const tasks = await Task.find({
      $or: [
        { class_ids: { $in: [classId] } },
        { class_ids: { $size: 0 }, department_id: deptId },
        { class_ids: { $size: 0 }, department_id: null },
      ]
    });
    const students = await User.find({ class_id: classId, role: 'STUDENT' });
    const studentIds = students.map(s => s._id);

    const taskStats = await Promise.all(tasks.map(async (t) => {
      // Find latest status for each student for this task
      const subs = await TaskSubmission.find({ task_id: t._id, user_id: { $in: studentIds } });
      const studentStatuses = new Map();
      subs.forEach(s => {
        studentStatuses.set(s.user_id.toString(), s.status);
      });
      const statuses = Array.from(studentStatuses.values());

      return {
        id: t._id, title: t.title,
        submitted: statuses.filter(s => s === 'SUBMITTED').length,
        verified: statuses.filter(s => s === 'VERIFIED').length,
        pending: statuses.filter(s => s === 'PENDING').length,
        rejected: statuses.filter(s => s === 'REJECTED').length,
      };
    }));

    const totalTaskCount = tasks.length;
    const studentStats = await Promise.all(students.map(async (u) => {
      const completed = await TaskSubmission.countDocuments({ user_id: u._id, status: 'VERIFIED' });
      return { full_name: u.full_name, register_number: u.register_number, completed_tasks: completed, total_tasks: totalTaskCount };
    }));

    res.json({ taskStats, studentStats });
  });

  // ── Submissions ───────────────────────────────────────────────────────────
  app.get('/api/submissions', authenticate, async (req: any, res) => {
    let subs: any[];

    const populate = (q: any) => q
      .populate('task_id', 'title')
      .populate({ path: 'user_id', select: 'full_name register_number class_id', populate: { path: 'class_id', select: 'name year' } });

    if (req.user.role === 'STUDENT') {
      if (req.user.is_coordinator) {
        const students = await User.find({ class_id: req.user.class_id }, '_id');
        const ids = students.map(s => s._id);
        subs = await populate(TaskSubmission.find({ user_id: { $in: ids } }));
      } else {
        subs = await TaskSubmission.find({ user_id: req.user.id }).populate('task_id', 'title');
      }
    } else if (req.user.role === 'CLASS_ADVISOR') {
      const students = await User.find({ class_id: req.user.class_id }, '_id');
      subs = await populate(TaskSubmission.find({ user_id: { $in: students.map(s => s._id) } }));
    } else if (req.user.role === 'HOD') {
      const students = await User.find({ department_id: req.user.department_id, role: 'STUDENT' }, '_id');
      subs = await populate(TaskSubmission.find({ user_id: { $in: students.map(s => s._id) } }));
    } else {
      subs = await populate(TaskSubmission.find());
    }

    res.json(subs.map((s: any) => ({
      id: s._id,
      task_id: s.task_id?._id,
      task_title: s.task_id?.title,
      user_id: s.user_id?._id,
      student_name: s.user_id?.full_name,
      register_number: s.user_id?.register_number,
      class_id: s.user_id?.class_id?._id,
      class_name: s.user_id?.class_id?.name,
      class_year: s.user_id?.class_id?.year,
      status: s.status,
      screenshot_url: s.screenshot_url,
      custom_field_value: s.custom_field_value,
      verification_note: s.verification_note,
      rejection_reason: s.rejection_reason,
      submitted_at: s.submitted_at,
      verified_at: s.verified_at,
      resubmission_count: s.resubmission_count,
    })));
  });

  app.post('/api/submissions', authenticate, authorize(['STUDENT']), upload.single('screenshot'), async (req: any, res) => {
    try {
      submissionSchemaValidator.parse(req.body);
    } catch (e: any) {
      console.error("Submission Validation Error:", e);
      let errorMessage = 'Invalid submission data provided';
      if (e && e.name === 'ZodError') {
        errorMessage = e.errors?.[0]?.message || errorMessage;
      } else if (e && e.message) {
        errorMessage = e.message;
      }
      return res.status(400).json({ error: errorMessage });
    }
    const { task_id, custom_field_value } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Screenshot is required' });

    let screenshot_url;
    try {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const uploadResponse = await cloudinary.uploader.upload(dataURI, {
        folder: 'academic-task-uploads',
        resource_type: 'auto'
      });
      screenshot_url = uploadResponse.secure_url;
    } catch (uploadErr: any) {
      console.error("Cloudinary Upload Error:", uploadErr);
      return res.status(500).json({
        error: `Upload failed: ${uploadErr.message || 'Signature/Secret mismatch'}. Please verify Cloudinary ENV on Render.`
      });
    }

    if (!screenshot_url) return res.status(400).json({ error: 'Screenshot processing failed.' });

    const task: any = await Task.findById(task_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.deadline && new Date() > new Date(task.deadline))
      return res.status(400).json({ error: 'Hard deadline block — no late uploads possible' });

    const existing: any = await TaskSubmission.findOne({ task_id, user_id: req.user.id });
    if (existing) {
      if (existing.status === 'VERIFIED') return res.status(400).json({ error: 'Already verified' });
      if (existing.status === 'REJECTED' && existing.resubmission_count >= 2)
        return res.status(400).json({ error: 'Maximum 2 resubmissions allowed. Submission locked.' });

      const newCount = existing.status === 'REJECTED' ? existing.resubmission_count + 1 : existing.resubmission_count;
      await TaskSubmission.findByIdAndUpdate(existing._id, {
        status: 'SUBMITTED', screenshot_url, custom_field_value,
        submitted_at: new Date(), resubmission_count: newCount,
      });
      return res.json({ success: true, id: existing._id });
    }

    const sub = await TaskSubmission.create({
      task_id, user_id: req.user.id, status: 'SUBMITTED',
      screenshot_url, custom_field_value, submitted_at: new Date(),
    });
    res.json({ success: true, id: sub._id });
  });

  app.delete('/api/submissions/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
    const subId = req.params.id;
    if (req.user.role === 'STUDENT' && !req.user.is_coordinator)
      return res.status(403).json({ error: 'Only coordinators can delete submissions' });

    const sub: any = await TaskSubmission.findById(subId).populate('user_id', 'class_id department_id');

    if (req.user.role === 'STUDENT' && req.user.is_coordinator) {
      if (!sub || sub.user_id?.class_id?.toString() !== req.user.class_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'CLASS_ADVISOR') {
      if (!sub || sub.user_id?.class_id?.toString() !== req.user.class_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'HOD') {
      if (!sub || sub.user_id?.department_id?.toString() !== req.user.department_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }

    await TaskSubmission.findByIdAndDelete(subId);
    res.json({ success: true });
  });

  app.patch('/api/submissions/:id/verify', authenticate, authorize(['HOD', 'SUPREME_ADMIN', 'STUDENT', 'CLASS_ADVISOR']), async (req: any, res) => {
    const { status, verification_note, rejection_reason } = req.body;

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator)
      return res.status(403).json({ error: 'Only coordinators can verify' });

    if (req.user.role === 'STUDENT' && req.user.is_coordinator) {
      const sub: any = await TaskSubmission.findById(req.params.id).populate('user_id', 'class_id');
      if (!sub || sub.user_id?.class_id?.toString() !== req.user.class_id?.toString())
        return res.status(403).json({ error: 'Forbidden' });
    }

    await TaskSubmission.findByIdAndUpdate(req.params.id, {
      status, verification_note: verification_note || null,
      rejection_reason: rejection_reason || null, verified_at: new Date(),
    });

    const sub: any = await TaskSubmission.findById(req.params.id);
    const task: any = await Task.findById(sub.task_id);
    const message = status === 'VERIFIED'
      ? `Your submission for "${task.title}" has been verified.${verification_note ? ` Note: ${verification_note}` : ''}`
      : `Your submission for "${task.title}" has been rejected. Reason: ${rejection_reason}`;

    await Notification.create({ user_id: sub.user_id, message, type: status });
    res.json({ success: true });
  });

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get('/api/notifications', authenticate, async (req: any, res) => {
    const notifications = await Notification.find({ user_id: req.user.id })
      .sort({ createdAt: -1 }).limit(50);
    res.json(notifications.map(n => ({
      id: n._id, message: n.message, type: n.type,
      is_read: n.is_read, created_at: n.createdAt,
    })));
  });

  app.patch('/api/notifications/read', authenticate, async (req: any, res) => {
    await Notification.updateMany({ user_id: req.user.id }, { is_read: true });
    res.json({ success: true });
  });

  // ── Stats: Advisor ────────────────────────────────────────────────────────
  app.get('/api/stats/advisor', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
    const classId = req.user.class_id;
    const deptId = req.user.department_id;

    const tasks = await Task.find({
      $or: [{ class_ids: { $in: [classId] } }, { class_ids: { $size: 0 }, department_id: deptId }, { class_ids: { $size: 0 }, department_id: null }]
    });
    const students = await User.find({ class_id: classId, role: 'STUDENT' }, '_id');
    const studentIds = students.map(s => s._id);

    const taskStats = await Promise.all(tasks.map(async (t) => {
      const subs = await TaskSubmission.find({ task_id: t._id, user_id: { $in: studentIds } });
      return {
        id: t._id, title: t.title,
        submitted: subs.filter(s => s.status === 'SUBMITTED').length,
        verified: subs.filter(s => s.status === 'VERIFIED').length,
        pending: subs.filter(s => s.status === 'PENDING').length,
        rejected: subs.filter(s => s.status === 'REJECTED').length,
      };
    }));

    const totalTasks = tasks.length;
    const allStudents = await User.find({ class_id: classId, role: 'STUDENT' });
    const studentStats = await Promise.all(allStudents.map(async (u) => {
      const completed = await TaskSubmission.countDocuments({ user_id: u._id, status: 'VERIFIED' });
      return { full_name: u.full_name, register_number: u.register_number, completed_tasks: completed, total_tasks: totalTasks };
    }));

    res.json({ taskStats, studentStats });
  });

  // ── Stats: Year Coordinator ───────────────────────────────────────────────
  app.get('/api/stats/year', authenticate, async (req: any, res) => {
    if (!req.user.is_year_coordinator)
      return res.status(403).json({ error: 'Only year coordinators can access these stats' });

    const yearScope = req.user.year_scope;
    const deptId = req.user.department_id;

    const classes = await Class.find({ department_id: deptId, year: yearScope });
    const classIds = classes.map(c => c._id);
    const students = await User.find({ class_id: { $in: classIds }, role: 'STUDENT' });
    const studentIds = students.map(s => s._id);

    const tasks = await Task.find({
      $or: [
        { class_ids: { $in: classIds } },
        { department_id: deptId, class_ids: { $size: 0 } },
        { department_id: null, class_ids: { $size: 0 } }
      ]
    });

    const taskStats = await Promise.all(tasks.map(async (t) => {
      const subs = await TaskSubmission.find({ task_id: t._id, user_id: { $in: studentIds } });
      const studentStatuses = new Map();
      subs.forEach(s => studentStatuses.set(s.user_id.toString(), s.status));
      const statuses = Array.from(studentStatuses.values());

      return {
        id: t._id, title: t.title,
        submitted: statuses.filter(s => s === 'SUBMITTED').length,
        verified: statuses.filter(s => s === 'VERIFIED').length,
        pending: studentIds.length - statuses.length,
        rejected: statuses.filter(s => s === 'REJECTED').length,
      };
    }));

    const classStats = await Promise.all(classes.map(async (c) => {
      const classStudents = students.filter(s => s.class_id?.toString() === c._id.toString());
      const classStudentIds = classStudents.map(s => s._id);
      const participating = await TaskSubmission.distinct('user_id', { user_id: { $in: classStudentIds } });

      return {
        id: c._id, name: c.name,
        total_students: classStudents.length,
        participating_students: participating.length,
      };
    }));

    res.json({ total_students: students.length, total_classes: classes.length, taskStats, classStats, year: yearScope });
  });

  // ── Stats: Student ────────────────────────────────────────────────────────
  app.get('/api/stats/student', authenticate, authorize(['STUDENT']), async (req: any, res) => {
    const userId = req.user.id;
    const deptId = req.user.department_id;
    const classId = req.user.class_id;

    const total_tasks = await Task.countDocuments({
      $or: [{ class_ids: { $size: 0 }, department_id: null }, { class_ids: { $size: 0 }, department_id: deptId }, { class_ids: { $in: [classId] } }]
    });
    const subs = await TaskSubmission.find({ user_id: userId });

    res.json({
      total_tasks,
      verified_tasks: subs.filter(s => s.status === 'VERIFIED').length,
      submitted_tasks: subs.filter(s => s.status === 'SUBMITTED').length,
      rejected_tasks: subs.filter(s => s.status === 'REJECTED').length,
    });
  });

  // ── Admin Debug ────────────────────────────────────────────────────────────
  app.get('/api/admin/debug-cloudinary', authenticate, authorize(['SUPREME_ADMIN']), async (req: any, res) => {
    try {
      const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
      const b64 = testImage.toString('base64');
      const dataURI = `data:image/png;base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'debug-test',
        resource_type: 'auto'
      });
      res.json({ success: true, message: "Cloudinary is WORKING!", result });
    } catch (err: any) {
      console.error("DEBUG Cloudinary Error:", err);
      let hint = "Check API Key and Cloud Name.";
      if (err.message?.includes('Signature')) {
        hint = "Signature Mismatch. Check API Secret.";
        if (process.env.CLOUDINARY_API_SECRET?.length === 42) {
          hint += " IMPORTANT: Your Secret length is 42. You likely copied the 'API Environment variable' URL instead of just the 'API Secret'!";
        }
      }
      res.status(500).json({ success: false, message: err.message, hint });
    }
  });

  // ── Admin Rescue Tools ──────────────────────────────────────────────────────
  app.get('/api/admin/check-user/:regNo', authenticate, authorize(['SUPREME_ADMIN']), async (req: any, res) => {
    const regNo = req.params.regNo.trim();
    const user = await User.findOne({ $or: [{ username: regNo }, { register_number: regNo }] });
    if (!user) return res.json({ exists: false });
    res.json({
      exists: true,
      id: user._id,
      username: user.username,
      register_number: user.register_number,
      role: user.role,
      must_change_password: user.must_change_password,
      has_password: !!user.password,
      created_at: (user as any).createdAt
    });
  });

  // ── Vite Middleware ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(path.join(__dirname, 'dist'))) {
    // Only serve frontend if it exists locally (not needed for Render + Vercel stack)
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  // ── Global Error Handler ─────────────────────────────────────────────────────
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  });

  let PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const startApp = (port: number) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${port}`);
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        process.stdout.write(`\rPort ${port} in use, trying ${port + 1}...\n`);
        startApp(port + 1);
      } else {
        console.error(err);
      }
    });
  };

  startApp(PORT);
}

startServer();
