import mongoose, { Schema } from 'mongoose';

const taskSubmissionSchema = new Schema({
  task_id: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  custom_field_value: { type: String },
  status: { type: String, default: 'PENDING' }, // 'PENDING','SUBMITTED','VERIFIED','REJECTED'
  screenshot_url: { type: String },
  verification_note: { type: String },
  rejection_reason: { type: String },
  resubmission_count: { type: Number, default: 0 },
  submitted_at: { type: Date },
  verified_at: { type: Date },
}, { timestamps: true });

taskSubmissionSchema.index({ task_id: 1, user_id: 1 });

export const TaskSubmission = mongoose.model('TaskSubmission', taskSubmissionSchema);
