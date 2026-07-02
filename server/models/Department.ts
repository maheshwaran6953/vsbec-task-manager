import mongoose, { Schema } from 'mongoose';

const departmentSchema = new Schema({
  name: { type: String, unique: true, required: true },
}, { timestamps: true });

export const Department = mongoose.model('Department', departmentSchema);
