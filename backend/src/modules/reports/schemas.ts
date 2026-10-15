import { z } from 'zod';

export const CATEGORIES = [
  'POTHOLE',
  'DAMAGED_PAVEMENT',
  'ROAD_CRACK',
  'FLOODING',
  'DAMAGED_DRAINAGE',
  'OTHER',
] as const;

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const MODERATION_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const REPAIR_STATUSES = ['NOT_ASSIGNED', 'AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED'] as const;

const categoryEnum = z.enum(CATEGORIES);
const priorityEnum = z.enum(PRIORITIES);
const moderationEnum = z.enum(MODERATION_STATUSES);
const repairEnum = z.enum(REPAIR_STATUSES);

/**
 * Multipart form fields arrive as strings, hence the coercions.
 */
export const createReportSchema = z.object({
  title: z.string().trim().min(4, 'Title must be at least 4 characters').max(160),
  description: z.string().trim().min(10, 'Please describe the issue (min 10 characters)').max(4000),
  category: categoryEnum,
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  addressText: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
  areaLabel: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v ? v : undefined)),
  priority: priorityEnum.optional(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  category: categoryEnum.optional(),
  priority: priorityEnum.optional(),
  moderationStatus: moderationEnum.optional(),
  repairStatus: repairEnum.optional(),
  areaLabel: z.string().trim().max(160).optional(),
  assignedOfficerId: z.string().trim().max(40).optional(),
  citizenId: z.string().trim().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'priority']).default('newest'),
});

export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;

export const idParamSchema = z.object({ id: z.string().trim().min(1) });

export const moderationSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v ? v : undefined)),
    priority: priorityEnum.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.decision === 'REJECT' && (!val.reason || val.reason.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A rejection reason (min 5 characters) is required.',
      });
    }
  });

export const assignSchema = z.object({
  officerId: z.string().trim().min(1, 'Select a maintenance officer'),
  priority: priorityEnum.optional(),
  note: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  dueDate: z.coerce.date().optional(),
});

export const repairUpdateSchema = z.object({
  repairStatus: z.enum(['AWAITING_MAINTENANCE', 'IN_PROGRESS', 'COMPLETED']).optional(),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  completionNotes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** Admin-only: allow completion without an after photo. */
  overrideCompletion: z.coerce.boolean().optional(),
});

export type RepairUpdateInput = z.infer<typeof repairUpdateSchema>;
