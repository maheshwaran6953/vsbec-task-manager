import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { cloudinary } from '../config/cloudinary';
import { User } from '../models';

const router = Router();

// ── Admin Debug ────────────────────────────────────────────────────────────
router.get('/admin/debug-cloudinary', authenticate, authorize(['SUPREME_ADMIN']), async (req: any, res) => {
  try {
    const testImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
    const b64 = testImage.toString('base64');
    const dataURI = `data:image/png;base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'debug-test',
      resource_type: 'auto'
    });
    res.json({ success: true, message: "Cloudinary is WORKING!", result });
  } catch (err: any) {
    console.error("DEBUG Cloudinary Error:", err);
    let hint = "Check API Key and Cloud Name.";
    if (err.message?.includes('Signature')) {
      hint = "Signature Mismatch. Check API Secret.";
      if (process.env.CLOUDINARY_API_SECRET?.length === 42) {
        hint += " IMPORTANT: Your Secret length is 42. You likely copied the 'API Environment variable' URL instead of just the 'API Secret'!";
      }
    }
    res.status(500).json({ success: false, message: err.message, hint });
  }
});

// ── Admin Rescue Tools ──────────────────────────────────────────────────────
router.get('/admin/check-user/:regNo', authenticate, authorize(['SUPREME_ADMIN']), async (req: any, res) => {
  const regNo = req.params.regNo.trim();
  const user = await User.findOne({ $or: [{ username: regNo }, { register_number: regNo }] });
  if (!user) return res.json({ exists: false });
  res.json({
    exists: true,
    id: user._id,
    username: user.username,
    register_number: user.register_number,
    role: user.role,
    must_change_password: user.must_change_password,
    has_password: !!user.password,
    created_at: (user as any).createdAt
  });
});

export default router;
