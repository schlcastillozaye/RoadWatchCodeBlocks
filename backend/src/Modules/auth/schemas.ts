import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required').max(120),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(190),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
