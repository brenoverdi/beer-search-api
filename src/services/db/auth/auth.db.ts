import prisma from '../../prisma/index';

// ── EmailVerification ────────────────────────────────────────────────────────

export const createEmailVerification = async (userId: number, codeHash: string, expiresAt: Date) =>
  prisma.emailVerification.create({ data: { userId, codeHash, expiresAt } });

export const findActiveVerification = async (userId: number) =>
  prisma.emailVerification.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

export const markVerificationUsed = async (id: number) =>
  prisma.emailVerification.update({ where: { id }, data: { usedAt: new Date() } });

export const deleteVerificationsForUser = async (userId: number) =>
  prisma.emailVerification.deleteMany({ where: { userId } });

// ── RefreshToken ──────────────────────────────────────────────────────────────

export const createRefreshToken = async (userId: number, tokenHash: string, expiresAt: Date) =>
  prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

export const findActiveRefreshToken = async (tokenHash: string) =>
  prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
  });

export const revokeRefreshToken = async (id: number) =>
  prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });

export const revokeAllUserRefreshTokens = async (userId: number) =>
  prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

// ── User helpers used in auth flows ──────────────────────────────────────────

export const findUserById = async (id: number) =>
  prisma.user.findUnique({ where: { id } });

export const findUserByEmail = async (email: string) =>
  prisma.user.findUnique({ where: { email } });

export const findUserByGoogleId = async (googleId: string) =>
  prisma.user.findUnique({ where: { googleId } });

export const createUser = async (data: {
  username: string;
  email: string;
  password?: string | null;
  googleId?: string | null;
  emailVerified?: boolean;
}) => prisma.user.create({ data });

export const setEmailVerified = async (userId: number) =>
  prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });

export const updateUserGoogleId = async (userId: number, googleId: string) =>
  prisma.user.update({ where: { id: userId }, data: { googleId } });
