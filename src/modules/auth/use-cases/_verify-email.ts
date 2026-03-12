import { injectable } from 'tsyringe';
import crypto from 'crypto';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { signAccessToken, signRefreshToken, refreshTTLms } from '../../../services/auth/jwt.service';
import { cacheSet } from '../../../services/cache/cache';
import { VerifyEmailSchema, LoginResponse } from '../auth.model';

@injectable()
export class VerifyEmailUseCase {
  public async execute(body: unknown): Promise<LoginResponse> {
    const { email, code } = VerifyEmailSchema.parse(body);

    const user = await authDb.findUserByEmail(email);
    if (!user) throw new AppError(404, 'User not found');
    if (user.emailVerified) throw new AppError(400, 'Email already verified');

    const verification = await authDb.findActiveVerification(user.id);
    if (!verification) throw new AppError(400, 'No active verification code — request a new one');

    const inputHash = crypto.createHash('sha256').update(code).digest('hex');
    if (inputHash !== verification.codeHash) throw new AppError(400, 'Invalid verification code');

    await authDb.markVerificationUsed(verification.id);
    await authDb.setEmailVerified(user.id);

    // Issue tokens
    const accessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username });
    const jti = crypto.randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTTLms());
    await authDb.createRefreshToken(user.id, tokenHash, expiresAt);

    // Cache access token payload so middleware can skip JWT parsing on hot paths
    cacheSet(`auth:${accessToken}`, { sub: user.id, email: user.email, username: user.username }, 900);

    return {
      user: { id: user.id, username: user.username, email: user.email, emailVerified: true },
      accessToken,
      refreshToken,
    };
  }
}
