import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth';
import { User } from '../models';

const router = Router();

// ── Users ─────────────────────────────────────────────────────────────────
router.get('/users', authenticate, async (req: any, res) => {
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

router.post('/users', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
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

router.post('/students/bulk', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
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

router.patch('/users/:id/coordinator', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
  const { is_coordinator } = req.body;
  const classId = req.user.class_id;
  if (is_coordinator) {
    const count = await User.countDocuments({ class_id: classId, is_coordinator: true });
    if (count >= 2) return res.status(400).json({ error: 'Maximum 2 coordinators allowed per class' });
  }
  await User.findOneAndUpdate({ _id: req.params.id, class_id: classId }, { is_coordinator });
  res.json({ success: true });
});

router.patch('/users/:id/year-coordinator', authenticate, authorize(['HOD', 'SUPREME_ADMIN']), async (req: any, res) => {
  const { is_year_coordinator, year_scope } = req.body;
  const target: any = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  if (req.user.role === 'HOD' && target.department_id?.toString() !== req.user.department_id?.toString()) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (target.role !== 'CLASS_ADVISOR' && is_year_coordinator) {
    return res.status(400).json({ error: 'Only Class Advisors can be assigned as Year Coordinators' });
  }

  await User.findByIdAndUpdate(req.params.id, {
    is_year_coordinator,
    year_scope: is_year_coordinator ? year_scope : null
  });
  res.json({ success: true });
});

router.patch('/users/:id/status', authenticate, authorize(['CLASS_ADVISOR', 'HOD', 'SUPREME_ADMIN']), async (req: any, res) => {
  const { is_active } = req.body;
  await User.findByIdAndUpdate(req.params.id, { is_active });
  res.json({ success: true });
});

router.patch('/users/:id/reset-password', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
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

router.delete('/users/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
  const target: any = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (req.user.role === 'SUPREME_ADMIN') {
    if (target.role === 'SUPREME_ADMIN') return res.status(403).json({ error: 'Cannot delete Supreme Admin account' });
  } else if (req.user.role === 'HOD') {
    if (!target || target.department_id?.toString() !== req.user.department_id?.toString() ||
      target.role === 'SUPREME_ADMIN' || target.role === 'HOD')
      return res.status(403).json({ error: 'Forbidden' });
  } else if (req.user.role === 'CLASS_ADVISOR') {
    if (target.role !== 'STUDENT' || target.class_id?.toString() !== req.user.class_id?.toString())
      return res.status(403).json({ error: 'Forbidden' });
  }
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default router;
