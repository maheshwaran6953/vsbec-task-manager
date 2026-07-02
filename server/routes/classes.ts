import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Class, User, Task } from '../models';

const router = Router();

// ── Classes ───────────────────────────────────────────────────────────────
router.get('/classes', authenticate, async (req: any, res) => {
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

router.post('/classes', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR']), async (req: any, res) => {
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

router.delete('/classes/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), async (req: any, res) => {
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

router.get('/my-class', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
  if (!req.user.class_id) return res.json(null);
  const cls: any = await Class.findById(req.user.class_id);
  if (!cls) return res.json(null);
  res.json({ id: cls._id, name: cls.name, year: cls.year, batch: cls.batch, department_id: cls.department_id });
});

export default router;
