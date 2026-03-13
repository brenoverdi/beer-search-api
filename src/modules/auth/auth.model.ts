import { z } from 'zod';

// ── Beer style options ───────────────────────────────────────────────────────

export const BEER_STYLES = [
  'IPA', 'Pale Ale', 'Stout', 'Porter', 'Lager', 'Pilsner', 'Wheat Beer',
  'Sour', 'Belgian', 'Brown Ale', 'Amber Ale', 'Saison', 'Gose', 'Hefeweizen',
  'Bock', 'Märzen', 'Kölsch', 'Dunkel', 'Witbier', 'Tripel', 'Dubbel',
  'Barleywine', 'Scottish Ale', 'Red Ale', 'Cream Ale', 'Blonde Ale'
] as const;

export const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer-not-to-say'] as const;

// ── Request schemas ──────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  username: z.string().min(3).max(50).trim(),
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
  // Optional profile fields
  dateOfBirth: z.string().optional().transform(val => val ? new Date(val) : undefined),
  gender: z.enum(GENDER_OPTIONS).optional(),
  country: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  favoriteStyles: z.array(z.string()).max(10).optional(),
});

export const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(50).trim().optional(),
  dateOfBirth: z.string().optional().transform(val => val ? new Date(val) : undefined),
  gender: z.enum(GENDER_OPTIONS).optional(),
  country: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  favoriteStyles: z.array(z.string()).max(10).optional(),
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
  dateOfBirth?: Date | null;
  gender?: string | null;
  country?: string | null;
  bio?: string | null;
  favoriteStyles?: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type RegisterResponse = { user: AuthUser; accessToken: string; refreshToken: string; message: string };
export type LoginResponse = { user: AuthUser } & TokenPair;
export type RefreshResponse = Pick<TokenPair, 'accessToken'>;
export type MeResponse = { user: AuthUser };
