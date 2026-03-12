import { z } from 'zod';

// ── Request schemas ──────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
});

export const VerifyEmailSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  code: z.string().length(6),
});

export const LoginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const GoogleSchema = z.object({
  idToken: z.string().min(1),
});

// ── Response types ───────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  emailVerified: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type RegisterResponse = { user: AuthUser; message: string };
export type LoginResponse = { user: AuthUser } & TokenPair;
export type RefreshResponse = Pick<TokenPair, 'accessToken'>;
export type MeResponse = { user: AuthUser };
