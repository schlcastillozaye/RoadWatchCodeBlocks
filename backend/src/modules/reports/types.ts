import type { z } from 'zod';
import type { assignSchema, createReportSchema, listReportsQuerySchema, moderationSchema, repairUpdateSchema } from './schemas';

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
export type ModerationInput = z.infer<typeof moderationSchema>;
export type AssignInput = z.infer<typeof assignSchema>;
export type RepairUpdateInput = z.infer<typeof repairUpdateSchema>;
