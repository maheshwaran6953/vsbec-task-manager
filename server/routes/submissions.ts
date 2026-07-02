import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { cloudinary } from '../config/cloudinary';
import { Task, TaskSubmission, User, Notification } from '../models';
import { submissionSchemaValidator } from '../validators/schemas';

const router = Router();

// ── Submissions ───────────────────────────────────────────────────────────
router.get('/submissions', authenticate, async (req: any, res) => {
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

router.post('/submissions', authenticate, authorize(['STUDENT']), upload.single('screenshot'), async (req: any, res) => {
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

router.delete('/submissions/:id', authenticate, authorize(['SUPREME_ADMIN', 'HOD', 'CLASS_ADVISOR', 'STUDENT']), async (req: any, res) => {
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

router.patch('/submissions/:id/verify', authenticate, authorize(['HOD', 'SUPREME_ADMIN', 'STUDENT', 'CLASS_ADVISOR']), async (req: any, res) => {
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

export default router;
