import { z } from 'zod';

const roleEnum = z.enum(['CITIZEN', 'MAINTENANCE_OFFICER', 'ADMIN']);
const statusEnum = z.enum(['ACTIVE', 'SUSPENDED']);

export const createUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: roleEnum.default('MAINTENANCE_OFFICER'),
});

export const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  role: roleEnum.optional(),
  status: statusEnum.optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: roleEnum.optional(),
  status: statusEnum.optional(),
  search: z.string().trim().max(200).optional(),
});

export const idParamSchema = z.object({ id: z.string().trim().min(1) });
