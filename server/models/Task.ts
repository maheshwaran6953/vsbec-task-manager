import mongoose, { Schema } from 'mongoose';

const taskSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  external_link: { type: String },
  deadline: { type: Date },
  screenshot_instruction: { type: String },
  custom_field_label: { type: String },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  class_ids: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  status: { type: String, default: 'OPEN' }, // 'OPEN','CLOSED'
}, { timestamps: true });

taskSchema.index({ department_id: 1 });
taskSchema.index({ class_ids: 1 });

export const Task = mongoose.model('Task', taskSchema);
