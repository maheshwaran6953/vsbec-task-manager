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

async function debug() {
    try {
        const dns = await import('node:dns');
        dns.setServers(['8.8.8.8', '8.8.4.4']);

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const dept = await mongoose.connection.db.collection('departments').findOne({});
        if (!dept) throw new Error('No department found');

        // Create a real class advisor who is also a year coordinator
        const advisorClass = await Class.create({ name: 'Advisor Class', department_id: dept._id, year: 3 });
        const otherClass = await Class.create({ name: 'Other Year 3 Class', department_id: dept._id, year: 3 });

        const user = await User.create({
            username: 'advisor_coord',
            role: 'CLASS_ADVISOR',
            department_id: dept._id,
            class_id: advisorClass._id,
            is_year_coordinator: true,
            year_scope: 3
        });

        console.log(`Testing with user: ${user.username}, Role: ${user.role}, Year Scope: ${user.year_scope}`);

        // Simulation of POST /api/tasks logic
        const body = { title: 'Test Year Task', class_ids: [] };
        const reqUser = {
            id: user._id,
            role: user.role,
            department_id: user.department_id,
            class_id: user.class_id,
            is_year_coordinator: user.is_year_coordinator,
            year_scope: user.year_scope
        };

        let deptId = body.department_id;
        let clsIds = body.class_ids || [];

        console.log('Phase 1: Role-based assignments');
        if (reqUser.role === 'CLASS_ADVISOR') {
            deptId = reqUser.department_id;
            clsIds = [reqUser.class_id];
            console.log('Assigned to own class:', clsIds);
        }

        console.log('Phase 2: Year Coordinator expansion');
        if (reqUser.is_year_coordinator && !body.department_id && (!body.class_ids || body.class_ids.length === 0)) {
            console.log(`Searching for classes in Dept: ${reqUser.department_id}, Year: ${reqUser.year_scope}`);
            const yearClasses = await Class.find({ department_id: reqUser.department_id, year: reqUser.year_scope });
            console.log(`Found ${yearClasses.length} classes`);
            clsIds = yearClasses.map(c => c._id);
        }

        console.log('Final Result clsIds:', clsIds.map(id => id.toString()));

        if (clsIds.length > 1) {
            console.log('✅ SUCCESS: Logic expanded to all classes.');
        } else {
            console.log('❌ FAILURE: Logic stuck with a single class.');
        }

        // Cleanup
        await User.deleteOne({ _id: user._id });
        await Class.deleteMany({ _id: { $in: [advisorClass._id, otherClass._id] } });
        console.log('Cleanup done.');

    } catch (error) {
        console.error('Debug failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debug();
