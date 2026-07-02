import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';

dotenv.config();

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('database.sqlite');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department_id INTEGER NOT NULL,
    year INTEGER,
    batch TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT'
    department_id INTEGER,
    class_id INTEGER,
    full_name TEXT,
    email TEXT,
    register_number TEXT,
    is_coordinator BOOLEAN DEFAULT 0,
    must_change_password BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT, -- 'Competition', 'Course', 'Workshop', 'College Work'
    external_link TEXT,
    deadline DATETIME,
    screenshot_instruction TEXT,
    custom_field_label TEXT,
    created_by INTEGER NOT NULL,
    department_id INTEGER, -- NULL means visible to all
    class_id INTEGER, -- NULL means visible to all in department
    status TEXT DEFAULT 'OPEN', -- 'OPEN', 'CLOSED'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    custom_field_value TEXT,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED'
    screenshot_url TEXT,
    verification_note TEXT,
    rejection_reason TEXT,
    submitted_at DATETIME,
    verified_at DATETIME,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL, -- 'VERIFIED', 'REJECTED', 'TASK_CREATED'
    is_read BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: Ensure necessary columns exist in users table
const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
const columns = tableInfo.map(c => c.name);

const userMigrations = [
  { name: 'class_id', type: 'INTEGER' },
  { name: 'department_id', type: 'INTEGER' },
  { name: 'full_name', type: 'TEXT' },
  { name: 'email', type: 'TEXT' },
  { name: 'register_number', type: 'TEXT' },
  { name: 'is_coordinator', type: 'BOOLEAN DEFAULT 0' },
  { name: 'must_change_password', type: 'BOOLEAN DEFAULT 0' },
  { name: 'is_active', type: 'BOOLEAN DEFAULT 1' }
];

userMigrations.forEach(m => {
  if (!columns.includes(m.name)) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${m.name} ${m.type}`);
      console.log(`Added ${m.name} column to users table`);
    } catch (e) { }
  }
});

// Migration: Ensure necessary columns exist in classes table
const classTableInfo = db.prepare("PRAGMA table_info(classes)").all() as any[];
const classColumns = classTableInfo.map(c => c.name);

if (!classColumns.includes('year')) {
  try {
    db.exec("ALTER TABLE classes ADD COLUMN year INTEGER");
  } catch (e) { }
}
if (!classColumns.includes('batch')) {
  try {
    db.exec("ALTER TABLE classes ADD COLUMN batch TEXT");
  } catch (e) { }
}

// Migration: Ensure class_id exists in tasks table
const taskTableInfo = db.prepare("PRAGMA table_info(tasks)").all() as any[];
const taskColumns = taskTableInfo.map(c => c.name);

if (!taskColumns.includes('class_id')) {
  try {
    db.exec("ALTER TABLE tasks ADD COLUMN class_id INTEGER");
  } catch (e) { }
}

const taskMigrations = [
  { name: 'category', type: 'TEXT' },
  { name: 'external_link', type: 'TEXT' },
  { name: 'deadline', type: 'DATETIME' },
  { name: 'screenshot_instruction', type: 'TEXT' },
  { name: 'custom_field_label', type: 'TEXT' }
];
taskMigrations.forEach(m => {
  if (!taskColumns.includes(m.name)) {
    try {
      db.exec(`ALTER TABLE tasks ADD COLUMN ${m.name} ${m.type}`);
    } catch (e) { }
  }
});

// Migration: Ensure necessary columns exist in task_submissions table
const subTableInfo = db.prepare("PRAGMA table_info(task_submissions)").all() as any[];
const subColumns = subTableInfo.map(c => c.name);
const subMigrations = [
  { name: 'custom_field_value', type: 'TEXT' },
  { name: 'verification_note', type: 'TEXT' },
  { name: 'rejection_reason', type: 'TEXT' },
  { name: 'resubmission_count', type: 'INTEGER DEFAULT 0' }
];
subMigrations.forEach(m => {
  if (!subColumns.includes(m.name)) {
    try {
      db.exec(`ALTER TABLE task_submissions ADD COLUMN ${m.name} ${m.type}`);
    } catch (e) { }
  }
});

// Seed Supreme Admin if not exists
const adminExists = db.prepare('SELECT * FROM users WHERE role = ?').get('SUPREME_ADMIN');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)').run(
    'admin',
    hashedPassword,
    'SUPREME_ADMIN',
    'Supreme Administrator'
  );
  console.log('Supreme Admin seeded: admin / admin123');
}

// Seed Sample Data (if empty)
const deptExists = db.prepare('SELECT * FROM departments').get();
if (!deptExists) {
  console.log('Seeding Real Academic Data (IT, CSE)...');

  const depts = [
    { name: 'Information Technology', prefix: 'IT', hod: 'Dr. Ramesh Kumar' },
    { name: 'Computer Science & Engineering', prefix: 'CSE', hod: 'Dr. Priya Dharshini' }
  ];

  const adminDoc = db.prepare('SELECT id FROM users WHERE role = ?').get('SUPREME_ADMIN') as any;
  const adminId = adminDoc.id;
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 14);
  const deadlineStr = deadline.toISOString();

  // Global Tasks
  db.prepare('INSERT INTO tasks (title, description, category, deadline, created_by) VALUES (?, ?, ?, ?, ?)').run(
    'University Semester Registration 2026',
    'All students must complete the semester registration on the university portal.',
    'College Work',
    deadlineStr,
    adminId
  );

  const studentNamesDefault = [
    'Arun Kumar', 'Bavana S', 'Chandru R', 'Deepak Raja', 'Ezhil Valavan',
    'Fathima Beevi', 'Gokul Nath', 'Hari Prasad', 'Ishwarya Lakshmi', 'Jaya Suriya',
    'Karthick Raja', 'Logeshwari K', 'Manoj Kumar', 'Naveen Raj', 'Oviya Shree',
    'Praveen Kumar', 'Rithika S', 'Sanjay Dutt', 'Tharun G', 'Uma Maheswari'
  ];

  const itY3CStudents = [
    "PRANESH", "PRASHANNAA", "PRATAP", "PRAVEEN", "RAGULGANDHI", "RAJESH", "RAJESHWARAN", "RAMESH", "RETHIKA", "RIDHU BALA",
    "RITHIKA", "RUTHRESH", "SANJAY", "SANJITH", "SANTHOSH KUMAR", "SANTHOSHKUMAR", "SAPTHAPREETHI", "SARANYA", "SARUDHARSHINI", "SASIPRABHA",
    "SELVADHARSHINI", "SELVAKISHORE", "SELVAKUMAR", "SELVAKUMAR", "SESHAN", "SHALINI", "SIVAPRAKASH", "SOUPARNIKA", "SRI NAVEENA", "SRINIVAS",
    "SRIPRASANNA", "SUBASH", "SUBASH", "SUBITHA", "SUDALAI ESWARI", "SUDHARSAN", "SUJITH", "SUJITHA", "SURIYA PRAKASH", "SWETHA",
    "TAMILSELVAN", "THAMARAI KANNAN", "THESIKAN", "THILAK ATHITHYA", "UDHAYAMOORTHI", "VAKEESH", "VARUNAN", "VARUNRAJ", "VASANTHA KUMAR", "VEERA PANDI",
    "VIDHASINI", "VIGNESH", "VIGNESH", "VIJAY KUMAR", "VINITHA", "VISHAL", "VISHNU", "VISHWA", "VISHWAA", "YAGAVI",
    "YAMUNA", "YOKESH", "YUVESHWARAN"
  ];

  for (const dept of depts) {
    const deptResult = db.prepare('INSERT INTO departments (name) VALUES (?)').run(dept.name);
    const deptId = deptResult.lastInsertRowid;

    // HOD
    const hodUsername = `${dept.prefix.toLowerCase()}_hod`;
    db.prepare('INSERT INTO users (username, password, role, department_id, full_name, email) VALUES (?, ?, ?, ?, ?, ?)').run(
      hodUsername, bcrypt.hashSync('hod123', 10), 'HOD', deptId, dept.hod, `${dept.prefix.toLowerCase()}.hod@college.edu`
    );

    // Departmental Task
    db.prepare('INSERT INTO tasks (title, description, category, deadline, created_by, department_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      `${dept.prefix} Annual Technical Symposium 'TechNova'`,
      'Register for various events in the departmental symposium.',
      'Workshop',
      deadlineStr,
      adminId,
      deptId
    );

    // Years 1 to 4
    for (let year = 1; year <= 4; year++) {
      // Sections A, B, C
      ['A', 'B', 'C'].forEach(section => {
        const className = `${dept.prefix} - Year ${year} - Section ${section}`;
        const batchStart = 2026 - year;
        const batchEnd = batchStart + 4;
        const classResult = db.prepare('INSERT INTO classes (name, department_id, year, batch) VALUES (?, ?, ?, ?)').run(
          className, deptId, year, `${batchStart}-${batchEnd}`
        );
        const classId = classResult.lastInsertRowid;

        // Advisor
        const isItY3C = dept.prefix === 'IT' && year === 3 && section === 'C';
        let advisorName = '';
        if (isItY3C) {
          advisorName = 'Safana Yasmin';
        } else {
          const advisorNames: any = {
            'IT': ['Mr. Suresh R', 'Ms. Meena K', 'Mr. Vignesh P', 'Ms. Kavitha S'],
            'CSE': ['Dr. Anand M', 'Ms. Shanthi L', 'Mr. Rajesh G', 'Dr. Lakshmi N']
          };
          advisorName = advisorNames[dept.prefix][year - 1] + (section !== 'A' ? ` (${section})` : '');
        }

        const advUsername = `${dept.prefix.toLowerCase()}_y${year}${section.toLowerCase()}_adv`;
        db.prepare('INSERT INTO users (username, password, role, department_id, class_id, full_name) VALUES (?, ?, ?, ?, ?, ?)').run(
          advUsername, bcrypt.hashSync('adv123', 10), 'CLASS_ADVISOR', deptId, classId, advisorName
        );

        // Class Specific Task
        db.prepare('INSERT INTO tasks (title, description, category, deadline, created_by, class_id) VALUES (?, ?, ?, ?, ?, ?)').run(
          `Mini Project Proposal Submission - ${className}`,
          'Submit your initial project proposal and abstract.',
          'Course',
          deadlineStr,
          adminId,
          classId
        );

        // Students
        if (isItY3C) {
          // 62 Students for IT Year 3 Section C
          itY3CStudents.forEach((name, index) => {
            const regNo = (922523205126 + index).toString();
            db.prepare('INSERT INTO users (username, password, role, department_id, class_id, full_name, email, register_number, must_change_password, is_coordinator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(
              regNo, bcrypt.hashSync(regNo, 10), 'STUDENT', deptId, classId, name, `${regNo.toLowerCase()}@college.edu`, regNo, index === 0 ? 1 : 0
            );
          });
        } else {
          // 5 Students per section for others
          for (let s = 1; s <= 5; s++) {
            const studentIdx = (year * 5 + s) % studentNamesDefault.length;
            const name = studentNamesDefault[studentIdx];
            const regNo = `${2026 - (4 - year)}${dept.prefix}${section}${s.toString().padStart(3, '0')}`;
            db.prepare('INSERT INTO users (username, password, role, department_id, class_id, full_name, email, register_number, must_change_password, is_coordinator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(
              regNo, bcrypt.hashSync(regNo, 10), 'STUDENT', deptId, classId, name, `${regNo.toLowerCase()}@college.edu`, regNo, s === 1 ? 1 : 0
            );
          }
        }
      });
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cors());

  // Serve static uploads
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

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

  // --- API Routes ---

  // Auth
  app.post('/api/auth/login', (req, res) => {
    const { username, password, role } = req.body;
    const user: any = db.prepare('SELECT * FROM users WHERE username = ? OR register_number = ?').get(username, username);

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Role Security: Ensure the user is logging into the correct portal
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
      id: user.id,
      username: user.username,
      role: user.role,
      department_id: user.department_id,
      class_id: user.class_id,
      is_coordinator: Boolean(user.is_coordinator)
    }, JWT_SECRET);
    res.json({
      token, user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        department_id: user.department_id,
        class_id: user.class_id,
        must_change_password: user.must_change_password,
        is_coordinator: Boolean(user.is_coordinator)
      }
    });
  });

  app.patch('/api/auth/change-password', authenticate, (req: any, res) => {
    const { newPassword } = req.body;
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?').run(hashedPassword, req.user.id);
    res.json({ success: true });
  });

  // Departments
  app.get('/api/departments', authenticate, (req, res) => {
    const depts = db.prepare('SELECT * FROM departments').all();
    res.json(depts);
  });

  app.post('/api/departments', authenticate, authorize(['SUPREME_ADMIN']), (req, res) => {
    const { name } = req.body;
    try {
      const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);
      res.json({ id: result.lastInsertRowid, name });
    } catch (e) {
      res.status(400).json({ error: 'Department already exists' });
    }
  });

  app.delete('/api/departments/:id', authenticate, authorize(['SUPREME_ADMIN']), (req, res) => {
    db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Classes
  app.get('/api/classes', authenticate, (req: any, res) => {
    let classes;
    if (req.user.role === 'SUPREME_ADMIN') {
      classes = db.prepare('SELECT c.*, d.name as department_name FROM classes c JOIN departments d ON c.department_id = d.id').all();
    } else {
      classes = db.prepare('SELECT * FROM classes WHERE department_id = ?').all(req.user.department_id);
    }
    res.json(classes);
  });

  app.post('/api/classes', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), (req: any, res) => {
    const { name, department_id, year, batch } = req.body;

    if (req.user.role === 'CLASS_ADVISOR') {
      // Advisor can update their own class details
      if (!req.user.class_id) return res.status(400).json({ error: 'No class assigned to advisor' });
      db.prepare('UPDATE classes SET name = ?, year = ?, batch = ? WHERE id = ?').run(name, year, batch, req.user.class_id);
      return res.json({ id: req.user.class_id, name, year, batch });
    }

    const deptId = req.user.role === 'SUPREME_ADMIN' ? department_id : req.user.department_id;
    const result = db.prepare('INSERT INTO classes (name, department_id, year, batch) VALUES (?, ?, ?, ?)').run(name, deptId, year, batch);
    res.json({ id: result.lastInsertRowid, name, department_id: deptId, year, batch });
  });

  app.delete('/api/classes/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), (req: any, res) => {
    const classId = req.params.id;
    if (req.user.role === 'HOD') {
      const cls: any = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
      if (!cls || cls.department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    db.prepare('DELETE FROM users WHERE class_id = ?').run(classId);
    db.prepare('DELETE FROM tasks WHERE class_id = ?').run(classId);
    db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
    res.json({ success: true });
  });

  app.get('/api/my-class', authenticate, authorize(['CLASS_ADVISOR']), (req: any, res) => {
    if (!req.user.class_id) return res.json(null);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(req.user.class_id);
    res.json(cls);
  });

  // Users (HOD and Class Advisor Creation)
  app.get('/api/users', authenticate, (req: any, res) => {
    let users;
    if (req.user.role === 'SUPREME_ADMIN') {
      users = db.prepare(`
        SELECT u.*, d.name as department_name, c.name as class_name
        FROM users u 
        LEFT JOIN departments d ON u.department_id = d.id
        LEFT JOIN classes c ON u.class_id = c.id
      `).all();
    } else if (req.user.role === 'HOD') {
      users = db.prepare(`
        SELECT u.*, c.name as class_name
        FROM users u 
        LEFT JOIN classes c ON u.class_id = c.id
        WHERE u.department_id = ? AND u.role != 'SUPREME_ADMIN'
      `).all(req.user.department_id);
    } else if (req.user.role === 'CLASS_ADVISOR' || (req.user.role === 'STUDENT' && req.user.is_coordinator)) {
      users = db.prepare(`
        SELECT u.*, c.name as class_name
        FROM users u 
        LEFT JOIN classes c ON u.class_id = c.id
        WHERE u.class_id = ? AND u.role = 'STUDENT'
      `).all(req.user.class_id);
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(users);
  });

  app.post('/api/users', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), (req: any, res) => {
    const { username, password, role, department_id, class_id, full_name, email, register_number } = req.body;

    let userRole = role;
    let deptId = department_id;
    let clsId = class_id;

    if (req.user.role === 'CLASS_ADVISOR') {
      userRole = 'STUDENT';
      deptId = req.user.department_id;
      clsId = req.user.class_id;
    } else if (req.user.role === 'HOD') {
      userRole = role === 'STUDENT' ? 'STUDENT' : 'CLASS_ADVISOR';
      deptId = req.user.department_id;
    }

    const finalPassword = password || register_number || username;
    const hashedPassword = bcrypt.hashSync(finalPassword, 10);
    const mustChange = (req.user.role === 'CLASS_ADVISOR' || userRole === 'STUDENT') ? 1 : 0;

    const finalDeptId = deptId === '' ? null : deptId;
    const finalClsId = clsId === '' ? null : clsId;

    try {
      const result = db.prepare(`
        INSERT INTO users (username, password, role, department_id, class_id, full_name, email, register_number, must_change_password) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        username.trim(), hashedPassword, userRole, finalDeptId, finalClsId, full_name.trim(), email ? email.trim() : null, register_number.trim(), mustChange
      );
      res.json({ id: result.lastInsertRowid, username, role: userRole, department_id: deptId, class_id: clsId, full_name, email, register_number });
    } catch (e) {
      res.status(400).json({ error: 'Username/Register Number already exists' });
    }
  });

  app.post('/api/students/bulk', authenticate, authorize(['CLASS_ADVISOR']), (req: any, res) => {
    const { students } = req.body; // Array of { register_number, name, email }
    const classId = req.user.class_id;
    const deptId = req.user.department_id;

    if (!classId) {
      return res.status(400).json({ error: 'You are not assigned to any class. Please create a class first.' });
    }

    const insert = db.prepare(`
      INSERT INTO users (username, password, role, department_id, class_id, full_name, email, register_number, must_change_password) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    const results = { success: 0, failed: 0 };

    const transaction = db.transaction((studentList) => {
      for (const s of studentList) {
        try {
          const hashedPassword = bcrypt.hashSync(String(s.register_number).trim(), 10);
          insert.run(String(s.register_number).trim(), hashedPassword, 'STUDENT', deptId, classId, s.name.trim(), s.email ? s.email.trim() : null, String(s.register_number).trim());
          results.success++;
        } catch (e) {
          console.error('Bulk insert error', e);
          results.failed++;
        }
      }
    });

    transaction(students);
    res.json(results);
  });

  app.patch('/api/users/:id/coordinator', authenticate, authorize(['CLASS_ADVISOR']), (req: any, res) => {
    const { is_coordinator } = req.body;
    const classId = req.user.class_id;

    if (is_coordinator) {
      const currentCoordinators = db.prepare('SELECT COUNT(*) as count FROM users WHERE class_id = ? AND is_coordinator = 1').get(classId) as any;
      if (currentCoordinators.count >= 2) {
        return res.status(400).json({ error: 'Maximum 2 coordinators allowed per class' });
      }
    }

    db.prepare('UPDATE users SET is_coordinator = ? WHERE id = ? AND class_id = ?').run(is_coordinator ? 1 : 0, req.params.id, classId);
    res.json({ success: true });
  });

  app.patch('/api/users/:id/status', authenticate, authorize(['CLASS_ADVISOR', 'HOD', 'SUPREME_ADMIN']), (req: any, res) => {
    const { is_active } = req.body;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/users/:id/reset-password', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), (req: any, res) => {
    const targetUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    if (req.user.role === 'HOD' && targetUser.department_id !== req.user.department_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'CLASS_ADVISOR' && targetUser.class_id !== req.user.class_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const newPasswordSource = targetUser.register_number || targetUser.username;
    const hashedPassword = bcrypt.hashSync(newPasswordSource, 10);

    db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?').run(hashedPassword, req.params.id);
    res.json({ success: true, message: `Password reset to ${newPasswordSource}` });
  });

  app.delete('/api/users/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), (req: any, res) => {
    if (req.user.role === 'HOD') {
      const targetUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!targetUser || targetUser.department_id !== req.user.department_id || targetUser.role === 'SUPREME_ADMIN' || targetUser.role === 'HOD') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Tasks
  app.get('/api/tasks', authenticate, (req: any, res) => {
    let tasks;
    if (req.user.role === 'SUPREME_ADMIN') {
      tasks = db.prepare(`
        SELECT t.*, u.full_name as creator_name, d.name as department_name, c.name as class_name
        FROM tasks t
        JOIN users u ON t.created_by = u.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN classes c ON t.class_id = c.id
        ORDER BY t.created_at DESC
      `).all();
    } else if (req.user.role === 'STUDENT' || req.user.role === 'CLASS_ADVISOR') {
      tasks = db.prepare(`
        SELECT t.*, u.full_name as creator_name, d.name as department_name, c.name as class_name
        FROM tasks t
        JOIN users u ON t.created_by = u.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN classes c ON t.class_id = c.id
        WHERE 
          (t.department_id IS NULL AND t.class_id IS NULL) OR -- Global
          (t.department_id = ? AND t.class_id IS NULL) OR -- Departmental
          (t.class_id = ?) -- Class specific
        ORDER BY t.created_at DESC
      `).all(req.user.department_id, req.user.class_id);
    } else {
      // HOD
      tasks = db.prepare(`
        SELECT t.*, u.full_name as creator_name, d.name as department_name, c.name as class_name
        FROM tasks t
        JOIN users u ON t.created_by = u.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN classes c ON t.class_id = c.id
        WHERE t.department_id IS NULL OR t.department_id = ?
        ORDER BY t.created_at DESC
      `).all(req.user.department_id);
    }
    res.json(tasks);
  });

  app.post('/api/tasks', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), (req: any, res) => {
    const { title, description, category, external_link, deadline, screenshot_instruction, custom_field_label, department_id, class_id } = req.body;

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator) {
      return res.status(403).json({ error: 'Only coordinators can post tasks' });
    }

    let deptId = department_id;
    let clsId = class_id;

    if (req.user.role === 'CLASS_ADVISOR' || (req.user.role === 'STUDENT' && req.user.is_coordinator)) {
      deptId = req.user.department_id;
      clsId = req.user.class_id;
    } else if (req.user.role === 'HOD') {
      deptId = req.user.department_id;
    }

    const finalDeptId = deptId === '' ? null : deptId;
    const finalClsId = clsId === '' ? null : clsId;

    const result = db.prepare(`
      INSERT INTO tasks (title, description, category, external_link, deadline, screenshot_instruction, custom_field_label, created_by, department_id, class_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, category, external_link, deadline, screenshot_instruction, custom_field_label, req.user.id, finalDeptId, finalClsId);

    res.json({ id: result.lastInsertRowid, title, description, department_id: finalDeptId, class_id: finalClsId });
  });

  app.patch('/api/tasks/:id/status', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), (req: any, res) => {
    const { status } = req.body;
    if (req.user.role === 'HOD') {
      const task: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
      if (!task || task.department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/tasks/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), (req: any, res) => {
    const task: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const isOwner = task.created_by === req.user.id;
    const isAdmin = req.user.role === 'SUPREME_ADMIN';
    const isDeptHOD = req.user.role === 'HOD' && task.department_id === req.user.department_id;
    const isClassAdvisor = req.user.role === 'CLASS_ADVISOR' && task.class_id === req.user.class_id;
    const isCoordinator = req.user.role === 'STUDENT' && req.user.is_coordinator && task.class_id === req.user.class_id;

    if (!isOwner && !isAdmin && !isDeptHOD && !isClassAdvisor && !isCoordinator) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.prepare('DELETE FROM task_submissions WHERE task_id = ?').run(req.params.id);
    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Statistics for HOD
  app.get('/api/stats/hod', authenticate, authorize(['HOD']), (req: any, res) => {
    const deptId = req.user.department_id;

    // Task stats
    const taskStats = db.prepare(`
      SELECT 
        t.id, t.title,
        COUNT(CASE WHEN ts.status = 'SUBMITTED' THEN 1 END) as submitted,
        COUNT(CASE WHEN ts.status = 'VERIFIED' THEN 1 END) as verified,
        COUNT(CASE WHEN ts.status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN ts.status = 'REJECTED' THEN 1 END) as rejected
      FROM tasks t
      LEFT JOIN task_submissions ts ON t.id = ts.task_id
      WHERE t.department_id = ? OR t.department_id IS NULL
      GROUP BY t.id
    `).all(deptId);

    // Class participation
    const classStats = db.prepare(`
      SELECT 
        c.id, c.name,
        COUNT(DISTINCT u.id) as total_students,
        COUNT(DISTINCT ts.user_id) as participating_students
      FROM classes c
      LEFT JOIN users u ON c.id = u.class_id AND u.role = 'STUDENT'
      LEFT JOIN task_submissions ts ON u.id = ts.user_id
      WHERE c.department_id = ?
      GROUP BY c.id
    `).all(deptId);

    const counts = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE department_id = ? AND role = 'STUDENT') as total_students,
        (SELECT COUNT(*) FROM users WHERE department_id = ? AND role = 'CLASS_ADVISOR') as total_advisors,
        (SELECT COUNT(*) FROM classes WHERE department_id = ?) as total_classes
      FROM (SELECT 1)
    `).get(deptId, deptId, deptId);

    res.json({ taskStats, classStats, ...counts });
  });

  // Statistics for Student Coordinator
  app.get('/api/stats/coordinator', authenticate, (req: any, res) => {
    if (req.user.role !== 'STUDENT' || !req.user.is_coordinator) {
      return res.status(403).json({ error: 'Only coordinators can access these stats' });
    }

    const classId = req.user.class_id;
    const deptId = req.user.department_id;

    // Task stats for the class
    const taskStats = db.prepare(`
      SELECT 
        t.id, t.title,
        COUNT(CASE WHEN ts.status = 'SUBMITTED' THEN 1 END) as submitted,
        COUNT(CASE WHEN ts.status = 'VERIFIED' THEN 1 END) as verified,
        COUNT(CASE WHEN ts.status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN ts.status = 'REJECTED' THEN 1 END) as rejected
      FROM tasks t
      LEFT JOIN task_submissions ts ON t.id = ts.task_id
      WHERE (t.class_id = ?) OR (t.class_id IS NULL AND (t.department_id = ? OR t.department_id IS NULL))
      GROUP BY t.id
    `).all(classId, deptId);

    // Individual student progress in the class
    const studentStats = db.prepare(`
      SELECT 
        u.full_name,
        u.register_number,
        COUNT(CASE WHEN ts.status = 'VERIFIED' THEN 1 END) as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE (department_id = u.department_id AND class_id IS NULL) OR (class_id = u.class_id) OR (department_id IS NULL AND class_id IS NULL)) as total_tasks
      FROM users u
      LEFT JOIN task_submissions ts ON u.id = ts.user_id
      WHERE u.class_id = ? AND u.role = 'STUDENT'
      GROUP BY u.id
    `).all(classId);

    res.json({ taskStats, studentStats });
  });

  // Task Submissions
  app.get('/api/submissions', authenticate, (req: any, res) => {
    let submissions;
    if (req.user.role === 'STUDENT') {
      if (req.user.is_coordinator) {
        // Coordinators see all submissions for their class
        submissions = db.prepare(`
          SELECT ts.*, t.title as task_title, u.full_name as student_name, u.register_number
          FROM task_submissions ts 
          JOIN tasks t ON ts.task_id = t.id 
          JOIN users u ON ts.user_id = u.id
          WHERE u.class_id = ?
        `).all(req.user.class_id);
      } else {
        // Regular students only see their own
        submissions = db.prepare('SELECT ts.*, t.title as task_title FROM task_submissions ts JOIN tasks t ON ts.task_id = t.id WHERE ts.user_id = ?').all(req.user.id);
      }
    } else if (req.user.role === 'CLASS_ADVISOR') {
      submissions = db.prepare(`
        SELECT ts.*, t.title as task_title, u.full_name as student_name, u.register_number
        FROM task_submissions ts 
        JOIN tasks t ON ts.task_id = t.id 
        JOIN users u ON ts.user_id = u.id
        WHERE u.class_id = ?
      `).all(req.user.class_id);
    } else if (req.user.role === 'HOD') {
      submissions = db.prepare(`
        SELECT 
          ts.*, 
          t.title as task_title, 
          t.category as task_category,
          u.full_name as student_name, 
          u.register_number,
          u.class_id,
          c.name as class_name,
          c.year as class_year
        FROM task_submissions ts 
        JOIN tasks t ON ts.task_id = t.id 
        JOIN users u ON ts.user_id = u.id
        LEFT JOIN classes c ON u.class_id = c.id
        WHERE u.department_id = ?
      `).all(req.user.department_id);
    } else {
      // Supreme Admin
      submissions = db.prepare(`
        SELECT ts.*, t.title as task_title, u.full_name as student_name, u.register_number
        FROM task_submissions ts 
        JOIN tasks t ON ts.task_id = t.id 
        JOIN users u ON ts.user_id = u.id
      `).all();
    }
    res.json(submissions);
  });

  app.post('/api/submissions', authenticate, authorize(['STUDENT']), upload.single('screenshot'), (req: any, res) => {
    const { task_id, custom_field_value } = req.body;
    const screenshot_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (!screenshot_url) {
      return res.status(400).json({ error: 'Screenshot is required' });
    }

    const task: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task_id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.deadline && new Date() > new Date(task.deadline)) {
      return res.status(400).json({ error: 'Hard deadline block — no late uploads possible' });
    }

    const existing = db.prepare('SELECT * FROM task_submissions WHERE task_id = ? AND user_id = ?').get(task_id, req.user.id) as any;

    if (existing) {
      if (existing.status === 'VERIFIED') return res.status(400).json({ error: 'Already verified' });
      if (existing.status === 'REJECTED' && existing.resubmission_count >= 2) {
        return res.status(400).json({ error: 'Maximum 2 resubmissions allowed. Submission locked.' });
      }

      const newResubmitCount = existing.status === 'REJECTED' ? existing.resubmission_count + 1 : existing.resubmission_count;

      db.prepare('UPDATE task_submissions SET status = ?, screenshot_url = ?, custom_field_value = ?, submitted_at = CURRENT_TIMESTAMP, resubmission_count = ? WHERE id = ?').run(
        'SUBMITTED', screenshot_url, custom_field_value, newResubmitCount, existing.id
      );
      res.json({ success: true, id: existing.id });
    } else {
      const result = db.prepare('INSERT INTO task_submissions (task_id, user_id, status, screenshot_url, custom_field_value, submitted_at, resubmission_count) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 0)').run(
        task_id, req.user.id, 'SUBMITTED', screenshot_url, custom_field_value
      );
      res.json({ success: true, id: result.lastInsertRowid });
    }
  });

  app.delete('/api/submissions/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), (req: any, res) => {
    // Basic authorization check setup
    const submissionId = req.params.id;

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator) {
      return res.status(403).json({ error: 'Only coordinators can delete submissions' });
    }

    // Coordinators can only delete submissions in their class
    if (req.user.role === 'STUDENT' && req.user.is_coordinator) {
      const sub: any = db.prepare(`
         SELECT u.class_id 
         FROM task_submissions ts 
         JOIN users u ON ts.user_id = u.id 
         WHERE ts.id = ?
       `).get(submissionId);

      if (!sub || sub.class_id !== req.user.class_id) {
        return res.status(403).json({ error: 'Forbidden. Submission not in your authorized class.' });
      }
    }

    // Advisor check
    if (req.user.role === 'CLASS_ADVISOR') {
      const sub: any = db.prepare(`
         SELECT u.class_id 
         FROM task_submissions ts 
         JOIN users u ON ts.user_id = u.id 
         WHERE ts.id = ?
       `).get(submissionId);

      if (!sub || sub.class_id !== req.user.class_id) {
        return res.status(403).json({ error: 'Forbidden. Submission not in your authorized class.' });
      }
    }

    // HOD check
    if (req.user.role === 'HOD') {
      const sub: any = db.prepare(`
         SELECT u.department_id 
         FROM task_submissions ts 
         JOIN users u ON ts.user_id = u.id 
         WHERE ts.id = ?
       `).get(submissionId);

      if (!sub || sub.department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'Forbidden. Submission not in your authorized department.' });
      }
    }

    try {
      db.prepare('DELETE FROM task_submissions WHERE id = ?').run(submissionId);
      res.json({ success: true });
    } catch (e) {
      console.error('Error deleting submission:', e);
      res.status(500).json({ error: 'Internal server error while deleting submission' });
    }
  });

  app.patch('/api/submissions/:id/verify', authenticate, authorize(['HOD', 'SUPREME_ADMIN', 'STUDENT', 'CLASS_ADVISOR']), (req: any, res) => {
    const { status, verification_note, rejection_reason } = req.body; // 'VERIFIED' or 'REJECTED'

    if (req.user.role === 'STUDENT' && !req.user.is_coordinator) {
      return res.status(403).json({ error: 'Only coordinators can verify' });
    }

    if (req.user.role === 'STUDENT' && req.user.is_coordinator) {
      const sub: any = db.prepare(`
        SELECT u.class_id 
        FROM task_submissions ts 
        JOIN users u ON ts.user_id = u.id 
        WHERE ts.id = ?
      `).get(req.params.id);
      if (!sub || sub.class_id !== req.user.class_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    db.prepare('UPDATE task_submissions SET status = ?, verification_note = ?, rejection_reason = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      status, verification_note || null, rejection_reason || null, req.params.id
    );

    const sub: any = db.prepare('SELECT user_id, task_id FROM task_submissions WHERE id = ?').get(req.params.id);
    const task: any = db.prepare('SELECT title FROM tasks WHERE id = ?').get(sub.task_id);
    const message = status === 'VERIFIED'
      ? `Your submission for "${task.title}" has been verified. ${verification_note ? `Note: ${verification_note}` : ''}`
      : `Your submission for "${task.title}" has been rejected. Reason: ${rejection_reason}`;

    db.prepare('INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)').run(sub.user_id, message, status);

    res.json({ success: true });
  });

  app.get('/api/notifications', authenticate, (req: any, res) => {
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    res.json(notifications);
  });

  app.patch('/api/notifications/read', authenticate, (req: any, res) => {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  });

  // Statistics for Class Advisor
  app.get('/api/stats/advisor', authenticate, authorize(['CLASS_ADVISOR']), (req: any, res) => {
    const classId = req.user.class_id;
    const deptId = req.user.department_id;

    const taskStats = db.prepare(`
      SELECT 
        t.id, t.title,
        COUNT(CASE WHEN ts.status = 'SUBMITTED' THEN 1 END) as submitted,
        COUNT(CASE WHEN ts.status = 'VERIFIED' THEN 1 END) as verified,
        COUNT(CASE WHEN ts.status = 'PENDING' THEN 1 END) as pending,
        COUNT(CASE WHEN ts.status = 'REJECTED' THEN 1 END) as rejected
      FROM tasks t
      LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.user_id IN (SELECT id FROM users WHERE class_id = ?)
      WHERE (t.department_id = ? AND t.class_id IS NULL) OR (t.class_id = ?) OR (t.department_id IS NULL AND t.class_id IS NULL)
      GROUP BY t.id
    `).all(classId, deptId, classId);

    const studentStats = db.prepare(`
      SELECT 
        u.full_name,
        u.register_number,
        COUNT(CASE WHEN ts.status = 'VERIFIED' THEN 1 END) as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE (department_id = u.department_id AND class_id IS NULL) OR (class_id = u.class_id) OR (department_id IS NULL AND class_id IS NULL)) as total_tasks
      FROM users u
      LEFT JOIN task_submissions ts ON u.id = ts.user_id
      WHERE u.class_id = ? AND u.role = 'STUDENT'
      GROUP BY u.id
    `).all(classId);

    res.json({ taskStats, studentStats });
  });

  // Statistics for Student
  app.get('/api/stats/student', authenticate, authorize(['STUDENT']), (req: any, res) => {
    const userId = req.user.id;
    const deptId = req.user.department_id;
    const classId = req.user.class_id;

    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM tasks WHERE (department_id = ? AND class_id IS NULL) OR (class_id = ?) OR (department_id IS NULL AND class_id IS NULL)) as total_tasks,
        COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_tasks,
        COUNT(CASE WHEN status = 'SUBMITTED' THEN 1 END) as submitted_tasks,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_tasks
      FROM task_submissions
      WHERE user_id = ?
    `).get(deptId, classId, userId);

    res.json(stats);
  });

  // --- Vite Middleware ---
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
