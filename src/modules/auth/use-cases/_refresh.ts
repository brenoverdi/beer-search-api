import { injectable } from 'tsyringe';
import crypto from 'crypto';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { verifyRefreshToken, signAccessToken, signRefreshToken, refreshTTLms } from '../../../services/auth/jwt.service';
import { cacheSet } from '../../../services/cache/cache';
import { RefreshSchema, RefreshResponse } from '../auth.model';

@injectable()
export class RefreshUseCase {
  public async execute(body: unknown): Promise<RefreshResponse & { refreshToken: string }> {
    const { refreshToken } = RefreshSchema.parse(body);

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await authDb.findActiveRefreshToken(tokenHash);
    if (!stored) throw new AppError(401, 'Refresh token revoked or not found');

    const user = await authDb.findUserById(payload.sub);
    if (!user) throw new AppError(401, 'User not found');

    // Rotate: revoke old, issue new
    await authDb.revokeRefreshToken(stored.id);

    const newAccessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username });
    const jti = crypto.randomUUID();
    const newRefreshToken = signRefreshToken({ sub: user.id, jti });
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTTLms());
    await authDb.createRefreshToken(user.id, newHash, expiresAt);

    cacheSet(`auth:${newAccessToken}`, { sub: user.id, email: user.email, username: user.username }, 900);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
