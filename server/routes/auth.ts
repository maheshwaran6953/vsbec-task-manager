import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '../config/env';
import { authenticate } from '../middleware/auth';
import { User } from '../models';

const router = Router();

// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req, res) => {
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
    console.log(`[AUTH] Role check for ${username}: Requested [${role}] | DB User has [${user.role}] (isCoord: ${user.is_coordinator})`);

    let roleAllowed = false;
    if (role === 'SUPREME_ADMIN' && user.role === 'SUPREME_ADMIN') roleAllowed = true;
    else if (role === 'HOD' && user.role === 'HOD') roleAllowed = true;
    else if (role === 'CLASS_ADVISOR' && user.role === 'CLASS_ADVISOR') roleAllowed = true;
    else if (role === 'STUDENT' && user.role === 'STUDENT') roleAllowed = true;
    else if (role === 'STUDENT_COORDINATOR' && user.role === 'STUDENT' && user.is_coordinator) roleAllowed = true;

    if (!roleAllowed) {
      console.log(`[AUTH] Role Mismatch: ${username} attempted as ${role}`);
      const roleNames: any = {
        'CLASS_ADVISOR': 'Class Advisor',
        'HOD': 'Department HOD',
        'SUPREME_ADMIN': 'Supreme Admin',
        'STUDENT_COORDINATOR': 'Coordinator'
      };
      return res.status(403).json({ error: `Access denied: This account is registered as a ${roleNames[user.role] || user.role}` });
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

router.get('/auth/me', authenticate, async (req: any, res) => {
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

router.patch('/auth/change-password', authenticate, async (req: any, res) => {
  const { newPassword } = req.body;
  const hashed = bcrypt.hashSync(newPassword, 10);
  await User.findByIdAndUpdate(req.user.id, { password: hashed, must_change_password: false });
  res.json({ success: true });
});

export default router;
