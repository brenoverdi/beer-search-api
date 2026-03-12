import jwt from 'jsonwebtoken';

const {
  JWT_ACCESS_SECRET = 'access-secret-change-me',
  JWT_REFRESH_SECRET = 'refresh-secret-change-me',
  JWT_ACCESS_TTL = '15m',
  JWT_REFRESH_TTL = '7d',
} = process.env;

export interface AccessPayload {
  sub: number;          // userId
  email: string;
  username: string;
}

export interface RefreshPayload {
  sub: number;
  jti: string;          // token id — maps to DB row
}

export const signAccessToken = (payload: AccessPayload): string =>
  jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'] });

export const signRefreshToken = (payload: RefreshPayload): string =>
  jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_TTL as jwt.SignOptions['expiresIn'] });

export const verifyAccessToken = (token: string): AccessPayload =>
  jwt.verify(token, JWT_ACCESS_SECRET) as unknown as AccessPayload;

export const verifyRefreshToken = (token: string): RefreshPayload =>
  jwt.verify(token, JWT_REFRESH_SECRET) as unknown as RefreshPayload;

/** ms until expiry — used to store the refresh token in DB */
export const refreshTTLms = (): number => {
  const ttl = JWT_REFRESH_TTL;
  const unit = ttl.slice(-1);
  const val = Number(ttl.slice(0, -1));
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * (multipliers[unit] ?? 86_400_000);
};
