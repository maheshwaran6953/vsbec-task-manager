import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Task, TaskSubmission, User, Class } from '../models';
import { taskSchemaValidator } from '../validators/schemas';

const router = Router();

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

router.get('/tasks', authenticate, async (req: any, res) => {
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
        { department_id: null, class_ids: { $size: 0 } },
        { department_id: dbUser.department_id },
        { class_ids: { $in: deptClassIds } }
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

router.post('/tasks', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
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
  const { title, description, category, external_link: rawLink, deadline, screenshot_instruction, custom_field_label, department_id, class_ids } = req.body;

  let external_link = rawLink;
  if (external_link && !external_link.startsWith('http')) {
    external_link = `https://${external_link}`;
  }

  if (req.user.role === 'STUDENT' && !req.user.is_coordinator)
    return res.status(403).json({ error: 'Only coordinators can post tasks' });

  const dbUser: any = await User.findById(req.user.id);
  if (!dbUser) return res.status(401).json({ error: 'User not found' });

  let deptId = department_id;
  let clsIds = class_ids || [];

  if (dbUser.role === 'CLASS_ADVISOR' || (dbUser.role === 'STUDENT' && dbUser.is_coordinator)) {
    deptId = dbUser.department_id;
    if (!dbUser.is_year_coordinator || (class_ids && class_ids.length > 0)) {
      clsIds = (class_ids && class_ids.length > 0) ? class_ids : [dbUser.class_id];
    }
  } else if (dbUser.role === 'HOD') {
    deptId = dbUser.department_id;
  }

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

router.patch('/tasks/:id/status', authenticate, authorize(['SUPREME_ADMIN', 'HOD']), async (req: any, res) => {
  const { status } = req.body;
  if (req.user.role === 'HOD') {
    const task: any = await Task.findById(req.params.id);
    if (!task || task.department_id?.toString() !== req.user.department_id?.toString())
      return res.status(403).json({ error: 'Forbidden' });
  }
  await Task.findByIdAndUpdate(req.params.id, { status });
  res.json({ success: true });
});

router.delete('/tasks/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
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

export default router;
