import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { Class, User, Task, TaskSubmission } from '../models';

const router = Router();

// ── Stats: HOD ──────────────────────────────────────────────────────────
router.get('/stats/hod', authenticate, authorize(['HOD']), async (req: any, res) => {
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

// ── Stats: Coordinator ──────────────────────────────────────────────────
router.get('/stats/coordinator', authenticate, async (req: any, res) => {
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

// ── Stats: Advisor ────────────────────────────────────────────────────────
router.get('/stats/advisor', authenticate, authorize(['CLASS_ADVISOR']), async (req: any, res) => {
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
router.get('/stats/year', authenticate, async (req: any, res) => {
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
router.get('/stats/student', authenticate, authorize(['STUDENT']), async (req: any, res) => {
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

export default router;
