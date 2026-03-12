import { injectable } from 'tsyringe';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { signAccessToken, signRefreshToken, refreshTTLms } from '../../../services/auth/jwt.service';
import { cacheSet } from '../../../services/cache/cache';
import { GoogleSchema, LoginResponse } from '../auth.model';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const slugifyUsername = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 45);

@injectable()
export class GoogleAuthUseCase {
  public async execute(body: unknown): Promise<LoginResponse> {
    const { idToken } = GoogleSchema.parse(body);

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const googlePayload = ticket.getPayload();
    if (!googlePayload?.email || !googlePayload?.sub) {
      throw new AppError(400, 'Invalid Google token payload');
    }

    const { sub: googleId, email, name } = googlePayload;
    const normalizedEmail = email.toLowerCase();

    // 1. Find by googleId
    let user = await authDb.findUserByGoogleId(googleId);

    if (!user) {
      // 2. Find by email (link if already registered)
      user = await authDb.findUserByEmail(normalizedEmail) ?? null;

      if (user) {
        await authDb.updateUserGoogleId(user.id, googleId);
        if (!user.emailVerified) await authDb.setEmailVerified(user.id);
      } else {
        // 3. Create new user
        const base = slugifyUsername(name ?? normalizedEmail.split('@')[0]);
        let username = base;
        // ensure uniqueness by appending a random suffix if needed
        const existing = await authDb.findUserByEmail(normalizedEmail);
        if (existing) {
          username = `${base}_${crypto.randomBytes(3).toString('hex')}`;
        }

        user = await authDb.createUser({
          username,
          email: normalizedEmail,
          googleId,
          emailVerified: true,
        });
      }
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username });
    const jti = crypto.randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTTLms());
    await authDb.createRefreshToken(user.id, tokenHash, expiresAt);

    cacheSet(`auth:${accessToken}`, { sub: user.id, email: user.email, username: user.username }, 900);

    return {
      user: { id: user.id, username: user.username, email: user.email, emailVerified: user.emailVerified },
      accessToken,
      refreshToken,
    };
  }
}
