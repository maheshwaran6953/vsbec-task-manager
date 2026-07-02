import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, required: true }, // 'SUPREME_ADMIN','HOD','CLASS_ADVISOR','STUDENT'
  department_id: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
  class_id: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  full_name: { type: String },
  email: { type: String },
  register_number: { type: String, unique: true, sparse: true },
  is_coordinator: { type: Boolean, default: false },
  is_year_coordinator: { type: Boolean, default: false },
  year_scope: { type: Number, default: null },
  must_change_password: { type: Boolean, default: true },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password on save, and normalize empty strings to undefined (removes from DB)
userSchema.pre('save', async function () {
  // Set to undefined so sparse unique index ignores these fields
  if (this.register_number === '' || this.register_number === null) {
    this.register_number = undefined;
  }
  if (this.email === '' || this.email === null) {
    this.email = undefined;
  }
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

export const User = mongoose.model('User', userSchema);
