import bcrypt from 'bcryptjs';
import { User } from './models';

// ─── Seeding ──────────────────────────────────────────────────────────────────
export async function seedData() {
  try {
    // 1. Clear out empty/null strings that collide with unique sparse indexes
    await User.updateMany({ register_number: '' }, { $unset: { register_number: "" } });
    await User.updateMany({ email: '' }, { $unset: { email: "" } });

    // 2. Universal Sync 2.0: The Deep Scrub
    const allUsers = await User.find({});
    console.log(`[SYNC] Commencing Universal Sync 2.0 for ${allUsers.length} users...`);

    let fixCount = 0;
    for (const u of allUsers) {
      try {
        let changed = false;
        const cleanUsername = (u.username || '').toString().replace(/\s+/g, '').trim();
        const cleanRegNo = (u.register_number || '').toString().replace(/\s+/g, '').trim();

        if (u.username !== cleanUsername && cleanUsername !== '') {
          u.username = cleanUsername;
          changed = true;
        }

        if (u.register_number !== cleanRegNo) {
          if (cleanRegNo === '') {
            await User.findByIdAndUpdate(u._id, { $unset: { register_number: "" } });
            u.register_number = undefined;
          } else {
            u.register_number = cleanRegNo;
            changed = true;
          }
        }

        // 3. Password Alignment: Surgical Sync for ALL ROLES
        // We ensure ANY user who hasn't finalized their account yet gets a valid default password.
        if (u.username !== 'admin') {
          // If must_change_password is NOT false, they are in a "default" or "reset" state.
          const needsSync = (u.must_change_password !== false);

          if (needsSync) {
            const defaultPass = cleanRegNo || cleanUsername;
            if (defaultPass) {
              const newHash = bcrypt.hashSync(defaultPass, 10);
              // Only update if current hash doesn't match the default (prevents re-hashing loops)
              if (!bcrypt.compareSync(defaultPass, u.password || '')) {
                u.password = newHash;
                u.must_change_password = true;
                changed = true;
                console.log(`[SYNC] Initialized password for ${u.role}: ${u.username}`);
              }
            }
          }
        }

        if (changed) {
          await User.findByIdAndUpdate(u._id, {
            username: u.username,
            register_number: u.register_number,
            password: u.password,
            must_change_password: !!u.must_change_password
          });
          fixCount++;
        }
      } catch (userErr: any) {
        console.error(`[SYNC] Error syncing user ${u.username}:`, userErr.message);
      }
    }
    console.log(`[SYNC] Completed. Cleaned/Synced ${fixCount} accounts.`);

    // 4. Role Audit Log
    const roleStats = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
    console.log("[SYNC] Role distribution:", roleStats.map(s => `${s._id}: ${s.count}`).join(', '));

    // 5. Ensure Supreme Admin exists
    const adminExists = await User.findOne({ role: 'SUPREME_ADMIN' });
    if (!adminExists) {
      const admin = new User({
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'SUPREME_ADMIN',
        full_name: 'Supreme Administrator',
        must_change_password: true
      });
      await admin.save();
      console.log('Supreme Admin seeded: admin / admin123');
    }
  } catch (err) {
    console.error('[SYNC] Critical failure in seedData:', err);
  }
}
