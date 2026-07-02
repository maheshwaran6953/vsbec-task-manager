import mongoose, { Schema } from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const dns = await import('node:dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// Lightweight models to read/write data
const UserModel = mongoose.model('User', new Schema({
    full_name: String, register_number: String, role: String,
    class_id: Schema.Types.ObjectId, department_id: Schema.Types.ObjectId
}, { strict: false }));

const TaskModel = mongoose.model('Task', new Schema({
    title: String, category: String, department_id: Schema.Types.ObjectId
}, { strict: false }));

const SubModel = mongoose.model('TaskSubmission', new Schema({
    task_id: Schema.Types.ObjectId, user_id: Schema.Types.ObjectId,
    student_name: String, register_number: String, class_id: Schema.Types.ObjectId,
    task_title: String, task_category: String, custom_field_value: String,
    status: String, screenshot_url: String, verification_note: String,
    rejection_reason: String, submitted_at: Date, verified_at: Date,
}, { strict: false }));

await mongoose.connect(process.env.MONGODB_URI || '');
console.log('Connected to MongoDB');

// Clear old submissions
await SubModel.deleteMany({});
console.log('Cleared existing submissions');

const students = await UserModel.find({ role: 'STUDENT' }).lean() as any[];
const tasks = await TaskModel.find({}).lean() as any[];
console.log(`Found ${students.length} students and ${tasks.length} tasks`);

if (!students.length || !tasks.length) { console.log('Nothing to seed!'); process.exit(1); }

const docs: any[] = [];
const now = new Date();

students.forEach((student, si) => {
    tasks.forEach((task, ti) => {
        const seed = (si * 7 + ti * 3) % 10;
        // 0-3 = VERIFIED (40%), 4-5 = SUBMITTED (20%), 6 = REJECTED (10%), 7-9 = not submitted (30%)
        if (seed <= 3) {
            docs.push({
                task_id: task._id, user_id: student._id,
                student_name: student.full_name, register_number: student.register_number,
                class_id: student.class_id || null, task_title: task.title, task_category: task.category,
                custom_field_value: `Completed: ${task.title}`,
                status: 'VERIFIED', screenshot_url: `https://placehold.co/400x300/4ade80/fff?text=Verified`,
                verification_note: 'Verified by class advisor.',
                submitted_at: new Date(now.getTime() - (si + ti) * 3600000),
                verified_at: new Date(now.getTime() - si * 1800000),
            });
        } else if (seed <= 5) {
            docs.push({
                task_id: task._id, user_id: student._id,
                student_name: student.full_name, register_number: student.register_number,
                class_id: student.class_id || null, task_title: task.title, task_category: task.category,
                custom_field_value: `Reg: ${student.register_number}-${ti + 1}`,
                status: 'SUBMITTED', screenshot_url: `https://placehold.co/400x300/60a5fa/fff?text=Submitted`,
                submitted_at: new Date(now.getTime() - (si + ti) * 2400000),
            });
        } else if (seed === 6) {
            docs.push({
                task_id: task._id, user_id: student._id,
                student_name: student.full_name, register_number: student.register_number,
                class_id: student.class_id || null, task_title: task.title, task_category: task.category,
                custom_field_value: `Wrong submission`,
                status: 'REJECTED', screenshot_url: `https://placehold.co/400x300/f87171/fff?text=Rejected`,
                rejection_reason: 'Screenshot unclear. Please resubmit.',
                submitted_at: new Date(now.getTime() - (si + ti) * 5000000),
            });
        }
        // else: not submitted — no record needed
    });
});

if (docs.length) await SubModel.insertMany(docs);

const v = docs.filter(d => d.status === 'VERIFIED').length;
const s = docs.filter(d => d.status === 'SUBMITTED').length;
const r = docs.filter(d => d.status === 'REJECTED').length;
const p = students.length * tasks.length - docs.length;

console.log(`\n✅ Seeded ${docs.length} submissions (${students.length} students × ${tasks.length} tasks)`);
console.log(`  VERIFIED:         ${v}`);
console.log(`  SUBMITTED:        ${s}`);
console.log(`  REJECTED:         ${r}`);
console.log(`  NOT SUBMITTED:    ${p}`);

await mongoose.disconnect();
console.log('Done!');
