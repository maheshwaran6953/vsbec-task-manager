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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// ─── Cloudinary Config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'academic-task-uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    resource_type: 'auto',
  } as any,
});

const upload = multer({
  storage: cloudinaryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
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
  must_change_password: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password on save
userSchema.pre('save', async function () {
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
  class_id: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  status: { type: String, default: 'OPEN' }, // 'OPEN','CLOSED'
}, { timestamps: true });
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
  const adminExists = await User.findOne({ role: 'SUPREME_ADMIN' });
  if (!adminExists) {
    const admin = new User({
      username: 'admin',
      password: 'admin123',
      role: 'SUPREME_ADMIN',
      full_name: 'Supreme Administrator',
    });
    await admin.save();
    console.log('Supreme Admin seeded: admin / admin123');
  }

  const deptExists = await Department.findOne();
  if (!deptExists) {
    console.log('Seeding Real Academic Data (IT, CSE)...');

    const adminUser: any = await User.findOne({ role: 'SUPREME_ADMIN' });
    const adminId = adminUser._id;

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);

    // Global Task
    await Task.create({
      title: 'University Semester Registration 2026',
      description: 'All students must complete the semester registration on the university portal.',
      category: 'College Work',
      deadline,
      created_by: adminId,
    });

    const studentNamesDefault = [
      'Arun Kumar', 'Bavana S', 'Chandru R', 'Deepak Raja', 'Ezhil Valavan',
      'Fathima Beevi', 'Gokul Nath', 'Hari Prasad', 'Ishwarya Lakshmi', 'Jaya Suriya',
      'Karthick Raja', 'Logeshwari K', 'Manoj Kumar', 'Naveen Raj', 'Oviya Shree',
      'Praveen Kumar', 'Rithika S', 'Sanjay Dutt', 'Tharun G', 'Uma Maheswari'
    ];

    const itY3CStudents = [
      "PRANESH", "PRASHANNAA", "PRATAP", "PRAVEEN", "SARANYA"
    ];

    const depts = [
      { name: 'Information Technology', prefix: 'IT', hod: 'Dr. Ramesh Kumar' },
      { name: 'Computer Science & Engineering', prefix: 'CSE', hod: 'Dr. Priya Dharshini' }
    ];

    for (const dept of depts) {
      const deptDoc = await Department.create({ name: dept.name });
      const deptId = deptDoc._id;

      // HOD
      const hod = new User({
        username: `${dept.prefix.toLowerCase()}_hod`,
        password: 'hod123',
        role: 'HOD',
        department_id: deptId,
        full_name: dept.hod,
        email: `${dept.prefix.toLowerCase()}.hod@college.edu`,
      });
      await hod.save();

      // Departmental Task
      await Task.create({
        title: `${dept.prefix} Annual Technical Symposium 'TechNova'`,
        description: 'Register for various events in the departmental symposium.',
        category: 'Workshop',
        deadline,
        created_by: adminId,
        department_id: deptId,
      });

      const advisorNames: any = {
        'IT': ['Mr. Suresh R', 'Ms. Meena K', 'Mr. Vignesh P', 'Ms. Kavitha S'],
        'CSE': ['Dr. Anand M', 'Ms. Shanthi L', 'Mr. Rajesh G', 'Dr. Lakshmi N']
      };

      for (let year = 1; year <= 4; year++) {
        for (const section of ['A', 'B', 'C']) {
          const isItY3C = dept.prefix === 'IT' && year === 3 && section === 'C';
          const className = `${dept.prefix} - Year ${year} - Section ${section}`;
          const batchStart = 2026 - year;

          const classDoc = await Class.create({
            name: className,
            department_id: deptId,
            year,
            batch: `${batchStart}-${batchStart + 4}`,
          });
          const classId = classDoc._id;

          // Advisor
          const advisorFullName = isItY3C
            ? 'Safana Yasmin'
            : advisorNames[dept.prefix][year - 1] + (section !== 'A' ? ` (${section})` : '');

          const advisor = new User({
            username: `${dept.prefix.toLowerCase()}_y${year}${section.toLowerCase()}_adv`,
            password: 'adv123',
            role: 'CLASS_ADVISOR',
            department_id: deptId,
            class_id: classId,
            full_name: advisorFullName,
          });
          await advisor.save();

          // Class Task
          await Task.create({
            title: `Mini Project Proposal Submission - ${className}`,
            description: 'Submit your initial project proposal and abstract.',
            category: 'Course',
            deadline,
            created_by: adminId,
            class_id: classId,
          });

          // Students
          if (isItY3C) {
            for (let i = 0; i < itY3CStudents.length; i++) {
              const regNo = (922523205126 + i).toString();
              const student = new User({
                username: regNo,
                password: regNo,
                role: 'STUDENT',
                department_id: deptId,
                class_id: classId,
                full_name: itY3CStudents[i],
                email: `${regNo}@college.edu`,
                register_number: regNo,
                must_change_password: true,
                is_coordinator: i === 0,
              });
              await student.save();
            }
          } else {
            for (let s = 1; s <= 5; s++) {
              const name = studentNamesDefault[(year * 5 + s) % studentNamesDefault.length];
              const regNo = `${2026 - (4 - year)}${dept.prefix}${section}${s.toString().padStart(3, '0')}`;
              const student = new User({
                username: regNo,
                password: regNo,
                role: 'STUDENT',
                department_id: deptId,
                class_id: classId,
                full_name: name,
                email: `${regNo.toLowerCase()}@college.edu`,
                register_number: regNo,
                must_change_password: true,
                is_coordinator: s === 1,
              });
              await student.save();
            }
          }
        }
      }
    }
    console.log('Seeding complete.');
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────
async function startServer() {
  await connectDB();
  await seedData();

  const app = express();
  app.use(express.json());
  app.use(cors());

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
    const { username, password, role } = req.body;
    const user: any = await User.findOne({
      $or: [{ username }, { register_number: username }],
    });

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (role) {
      if (role === 'STUDENT_COORDINATOR') {
        if (user.role !== 'STUDENT' || !user.is_coordinator) {
          return res.status(403).json({ error: 'This account is not registered as a Coordinator' });
        }
      } else if (role === 'STUDENT') {
        if (user.role !== 'STUDENT' || user.is_coordinator) {
          return res.status(403).json({ error: 'This account is not registered as a regular Student (Coordinators must use the Coordinator portal)' });
        }
      } else if (user.role !== role) {
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
      }
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
    const selectFields = 'username role full_name email register_number is_coordinator must_change_password is_active department_id class_id';

    if (req.user.role === 'SUPREME_ADMIN') {
      users = await User.find().select(selectFields)
        .populate('department_id', 'name')
        .populate('class_id', 'name');
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
    })));
  });

  app.post('/api/users', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
    const { username, password, role, department_id, class_id, full_name, email, register_number } = req.body;

    let userRole = role;
    let deptId = department_id;
    let clsId = class_id;

    if (req.user.role === 'CLASS_ADVISOR') {
      userRole = 'STUDENT'; deptId = req.user.department_id; clsId = req.user.class_id;
    } else if (req.user.role === 'HOD') {
      userRole = role === 'STUDENT' ? 'STUDENT' : 'CLASS_ADVISOR';
      deptId = req.user.department_id;
    }

    const finalPassword = password || register_number || username;
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
      });
      await u.save();
      res.json({ id: u._id, username, role: userRole, department_id: deptId, class_id: clsId, full_name, email, register_number });
    } catch (e) {
      res.status(400).json({ error: 'Username/Register Number already exists' });
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

  app.delete('/api/users/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), async (req: any, res) => {
    if (req.user.role === 'HOD') {
      const t: any = await User.findById(req.params.id);
      if (!t || t.department_id?.toString() !== req.user.department_id?.toString() ||
        t.role === 'SUPREME_ADMIN' || t.role === 'HOD')
        return res.status(403).json({ error: 'Forbidden' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const populateTask = (q: any) => q
    .populate('created_by', 'full_name')
    .populate('department_id', 'name')
    .populate('class_id', 'name');

  const formatTask = (t: any) => ({
    id: t._id,
    title: t.title,
    description: t.description,
    category: t.category,
    external_link: t.external_link,
    deadline: t.deadline,
    screenshot_instruction: t.screenshot_instruction,
    custom_field_label: t.custom_field_label,
    status: t.status,
    created_at: t.createdAt,
    created_by: t.created_by?._id,
    creator_name: t.created_by?.full_name,
    department_id: t.department_id?._id || null,
    department_name: t.department_id?.name || null,
    class_id: t.class_id?._id || null,
    class_name: t.class_id?.name || null,
  });

  app.get('/api/tasks', authenticate, async (req: any, res) => {
    let query: any;
    if (req.user.role === 'SUPREME_ADMIN') {
      query = Task.find();
    } else if (req.user.role === 'STUDENT' || req.user.role === 'CLASS_ADVISOR') {
      query = Task.find({
        $or: [
          { department_id: null, class_id: null },
          { department_id: req.user.department_id, class_id: null },
          { class_id: req.user.class_id },
        ]
      });
    } else {
      // HOD
      query = Task.find({
        $or: [
          { department_id: null },
          { department_id: req.user.department_id },
        ]
      });
    }
    const tasks = await populateTask(query.sort({ createdAt: -1 }));
    res.json(tasks.map(formatTask));
  });

  app.post('/api/tasks', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
    const { title, description, category, external_link, deadline, screenshot_instruction, custom_field_label, department_id, class_id } = req.body;

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator)
      return res.status(403).json({ error: 'Only coordinators can post tasks' });

    let deptId = department_id;
    let clsId = class_id;

    if (req.user.role === 'CLASS_ADVISOR' || (req.user.role === 'STUDENT' && req.user.is_coordinator)) {
      deptId = req.user.department_id; clsId = req.user.class_id;
    } else if (req.user.role === 'HOD') {
      deptId = req.user.department_id;
    }

    const t = await Task.create({
      title, description, category, external_link, deadline,
      screenshot_instruction, custom_field_label,
      created_by: req.user.id,
      department_id: deptId || null,
      class_id: clsId || null,
    });
    res.json({ id: t._id, title, description, department_id: deptId, class_id: clsId });
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
    const isClassAdvisor = req.user.role === 'CLASS_ADVISOR' && task.class_id?.toString() === req.user.class_id?.toString();
    const isCoordinator = req.user.role === 'STUDENT' && req.user.is_coordinator && task.class_id?.toString() === req.user.class_id?.toString();

    if (!isOwner && !isAdmin && !isDeptHOD && !isClassAdvisor && !isCoordinator)
      return res.status(403).json({ error: 'Forbidden' });

    await TaskSubmission.deleteMany({ task_id: req.params.id });
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  app.get('/api/stats/hod', authenticate, authorize(['HOD']), async (req: any, res) => {
    const deptId = req.user.department_id;

    const tasks = await Task.find({ $or: [{ department_id: deptId }, { department_id: null }] });
    const taskStats = await Promise.all(tasks.map(async (t) => {
      const subs = await TaskSubmission.find({ task_id: t._id });
      return {
        id: t._id, title: t.title,
        submitted: subs.filter(s => s.status === 'SUBMITTED').length,
        verified: subs.filter(s => s.status === 'VERIFIED').length,
        pending: subs.filter(s => s.status === 'PENDING').length,
        rejected: subs.filter(s => s.status === 'REJECTED').length,
      };
    }));

    const classes = await Class.find({ department_id: deptId });
    const classStats = await Promise.all(classes.map(async (c) => {
      const students = await User.find({ class_id: c._id, role: 'STUDENT' });
      const studentIds = students.map(s => s._id);
      const participating = await TaskSubmission.distinct('user_id', { user_id: { $in: studentIds } });
      return {
        id: c._id, name: c.name,
        total_students: students.length,
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
        { class_id: classId },
        { class_id: null, department_id: deptId },
        { class_id: null, department_id: null },
      ]
    });
    const taskStats = await Promise.all(tasks.map(async (t) => {
      const subs = await TaskSubmission.find({ task_id: t._id });
      return {
        id: t._id, title: t.title,
        submitted: subs.filter(s => s.status === 'SUBMITTED').length,
        verified: subs.filter(s => s.status === 'VERIFIED').length,
        pending: subs.filter(s => s.status === 'PENDING').length,
        rejected: subs.filter(s => s.status === 'REJECTED').length,
      };
    }));

    const students = await User.find({ class_id: classId, role: 'STUDENT' });
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
    const { task_id, custom_field_value } = req.body;
    const screenshot_url = req.file?.path || null; // Cloudinary URL

    if (!screenshot_url) return res.status(400).json({ error: 'Screenshot is required' });

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
      $or: [{ class_id: classId }, { class_id: null, department_id: deptId }, { class_id: null, department_id: null }]
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

  // ── Stats: Student ────────────────────────────────────────────────────────
  app.get('/api/stats/student', authenticate, authorize(['STUDENT']), async (req: any, res) => {
    const userId = req.user.id;
    const deptId = req.user.department_id;
    const classId = req.user.class_id;

    const total_tasks = await Task.countDocuments({
      $or: [{ class_id: null, department_id: null }, { class_id: null, department_id: deptId }, { class_id: classId }]
    });
    const subs = await TaskSubmission.find({ user_id: userId });

    res.json({
      total_tasks,
      verified_tasks: subs.filter(s => s.status === 'VERIFIED').length,
      submitted_tasks: subs.filter(s => s.status === 'SUBMITTED').length,
      rejected_tasks: subs.filter(s => s.status === 'REJECTED').length,
    });
  });

  // ── Vite Middleware ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  let PORT = 3000;
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
