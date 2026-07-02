import { z } from 'zod';

// ── Validation Schemas ───────────────────────────────────────────────────────
export const taskSchemaValidator = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  external_link: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  screenshot_instruction: z.string().optional().nullable(),
  custom_field_label: z.string().optional().nullable(),
  department_id: z.union([z.string(), z.number(), z.null()]).optional(),
  class_ids: z.array(z.any()).optional().nullable(),
});

export const submissionSchemaValidator = z.object({
  task_id: z.string().min(1, 'Task ID is required'),
  custom_field_value: z.string().optional()
});
