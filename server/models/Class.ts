import mongoose, { Schema } from 'mongoose';

const classSchema = new Schema({
  name: { type: String, required: true },
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  year: { type: Number },
  batch: { type: String },
}, { timestamps: true });

export const Class = mongoose.model('Class', classSchema);
