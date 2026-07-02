import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const userSchema = new mongoose.Schema({
    username: String,
    role: String,
    department_id: mongoose.Schema.Types.ObjectId,
    class_id: mongoose.Schema.Types.ObjectId,
    is_year_coordinator: Boolean,
    year_scope: Number,
});
const User = mongoose.model('User', userSchema);

const classSchema = new mongoose.Schema({
    name: String,
    department_id: mongoose.Schema.Types.ObjectId,
    year: Number,
});
const Class = mongoose.model('Class', classSchema);

const taskSchema = new mongoose.Schema({
    title: String,
    created_by: mongoose.Schema.Types.ObjectId,
    department_id: mongoose.Schema.Types.ObjectId,
    class_ids: [mongoose.Schema.Types.ObjectId],
});
const Task = mongoose.model('Task', taskSchema);

async function verify() {
    console.log('--- Verification Started ---');
    try {
        // DNS fix for MongoDB SRV records
        const dns = await import('node:dns');
        dns.setServers(['8.8.8.8', '8.8.4.4']);

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI not found in .env');
        }
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected successfully');

        // 1. Find a department
        const dept = await mongoose.connection.db.collection('departments').findOne({});
        if (!dept) throw new Error('No department found');
        console.log(`Using department: ${dept.name || dept._id} (${dept._id})`);

        // 2. Create test classes for Year 3
        console.log('Creating test classes for Year 3...');
        const classA = await Class.create({ name: 'Test Class 3A', department_id: dept._id, year: 3 });
        const classB = await Class.create({ name: 'Test Class 3B', department_id: dept._id, year: 3 });
        const classC = await Class.create({ name: 'Test Class 2A', department_id: dept._id, year: 2 });

        // 3. Create a Year Coordinator for Year 3
        console.log('Creating Year Coordinator for Year 3...');
        const coord = await User.create({
            username: 'test_coord_yr3',
            role: 'CLASS_ADVISOR',
            department_id: dept._id,
            is_year_coordinator: true,
            year_scope: 3
        });

        // 4. Test Task Creation Logic (Simulating the logic in server.ts)
        console.log('Simulating task creation for Year Coordinator...');
        let targetClsIds = [];
        if (coord.is_year_coordinator) {
            const yearClasses = await Class.find({ department_id: coord.department_id, year: coord.year_scope });
            targetClsIds = yearClasses.map(c => c._id);
        }

        const task = await Task.create({
            title: 'Year 3 Mega Task',
            created_by: coord._id,
            department_id: coord.department_id,
            class_ids: targetClsIds
        });

        console.log('Task created with class_ids:', task.class_ids.map(id => id.toString()));

        // Verification
        const has3A = task.class_ids.some(id => id.equals(classA._id));
        const has3B = task.class_ids.some(id => id.equals(classB._id));
        const has2A = task.class_ids.some(id => id.equals(classC._id));

        if (has3A && has3B && !has2A) {
            console.log('✅ SUCCESS: Task correctly assigned to all Year 3 classes and skipped Year 2.');
        } else {
            console.log('❌ FAILURE: Task assignment logic incorrect.');
        }

        // Cleanup
        console.log('Cleaning up...');
        await User.deleteOne({ _id: coord._id });
        await Class.deleteMany({ _id: { $in: [classA._id, classB._id, classC._id] } });
        await Task.deleteOne({ _id: task._id });
        console.log('Cleanup complete.');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('--- Verification Finished ---');
    }
}

verify();
