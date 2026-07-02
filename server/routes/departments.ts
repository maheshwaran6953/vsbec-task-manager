import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Department } from '../models';

const router = Router();

// ── Departments ───────────────────────────────────────────────────────────
router.get('/departments', authenticate, async (req, res) => {
  const depts = await Department.find().sort({ createdAt: 1 });
  res.json(depts.map(d => ({ id: d._id, name: d.name, created_at: d.createdAt })));
});

router.post('/departments', authenticate, authorize(['SUPREME_ADMIN']), async (req, res) => {
  const { name } = req.body;
  try {
    const d = await Department.create({ name });
    res.json({ id: d._id, name: d.name });
  } catch (e) {
    res.status(400).json({ error: 'Department already exists' });
  }
});

router.delete('/departments/:id', authenticate, authorize(['SUPREME_ADMIN']), async (req, res) => {
  await Department.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

export default router;
