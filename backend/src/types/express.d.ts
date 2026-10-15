import type { Role } from '@prisma/client';

export interface AuthContext {
  id: string;
  role: Role;
  email: string;
  fullName: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware. */
      auth?: AuthContext;
    }
  }
}

export {};
