// --- Types ---
export interface YearStats {
  total_students: number;
  total_classes: number;
  taskStats: { id: string; title: string; submitted: number; verified: number; pending: number; rejected: number; }[];
  classStats: { id: string; name: string; total_students: number; participating_students: number; }[];
  year: number;
}

export interface User {
  id: number;
  username: string;
  role: 'SUPREME_ADMIN' | 'HOD' | 'CLASS_ADVISOR' | 'STUDENT';
  full_name: string;
  department_id: number | null;
  department_name?: string;
  class_id?: number | null;
  class_name?: string;
  email?: string;
  register_number?: string;
  is_coordinator?: boolean;
  is_year_coordinator?: boolean;
  year_scope?: number | null;
  must_change_password?: boolean;
  is_active?: boolean;
}

export interface Department {
  id: number;
  name: string;
}

export interface Class {
  id: number;
  name: string;
  department_id: number;
  department_name?: string;
  year?: number;
  batch?: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  category?: string;
  external_link?: string;
  deadline?: string;
  screenshot_instruction?: string;
  custom_field_label?: string;
  creator_name: string;
  department_name: string | null;
  class_ids: number[];
  status: 'OPEN' | 'CLOSED';
  created_at: string;
  submission_status?: string;
  submission_count?: number;
}

export interface Submission {
  id: number;
  task_id: number;
  task_title: string;
  user_id: number;
  student_name?: string;
  register_number?: string;
  custom_field_value?: string;
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  screenshot_url: string;
  verification_note?: string;
  rejection_reason?: string;
  submitted_at: string;
  verified_at?: string;
  resubmission_count?: number;
  class_name?: string;
  class_year?: number;
  class_ids?: number[];
  task_category?: string;
}

export interface Notification {
  id: number;
  message: string;
  type: 'VERIFIED' | 'REJECTED' | 'TASK_CREATED';
  is_read: boolean;
  created_at: string;
}

export interface HODStats {
  taskStats: {
    id: number;
    title: string;
    submitted: number;
    verified: number;
    pending: number;
    rejected: number;
    class_breakdown: {
      class_name: string;
      total_students: number;
      completed: number;
      not_completed: number;
    }[];
  }[];
  classStats: {
    name: string;
    total_students: number;
    participating_students: number;
  }[];
}

export interface AdvisorStats {
  taskStats: {
    id: number;
    title: string;
    submitted: number;
    verified: number;
    pending: number;
    rejected: number;
  }[];
  studentStats: {
    full_name: string;
    completed_tasks: number;
    total_tasks: number;
  }[];
}

export interface StudentStats {
  total_tasks: number;
  verified_tasks: number;
  submitted_tasks: number;
  rejected_tasks: number;
}

export interface CoordinatorStats {
  taskStats: {
    id: number;
    title: string;
    submitted: number;
    verified: number;
    pending: number;
    rejected: number;
  }[];
  studentStats: {
    full_name: string;
    completed_tasks: number;
    total_tasks: number;
  }[];
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}
