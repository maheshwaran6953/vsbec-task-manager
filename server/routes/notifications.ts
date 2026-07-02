import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { Notification } from '../models';

const router = Router();

// ── Notifications ─────────────────────────────────────────────────────────
router.get('/notifications', authenticate, async (req: any, res) => {
  const notifications = await Notification.find({ user_id: req.user.id })
    .sort({ createdAt: -1 }).limit(50);
  res.json(notifications.map(n => ({
    id: n._id, message: n.message, type: n.type,
    is_read: n.is_read, created_at: n.createdAt,
  })));
});

router.patch('/notifications/read', authenticate, async (req: any, res) => {
  await Notification.updateMany({ user_id: req.user.id }, { is_read: true });
  res.json({ success: true });
});

export default router;
