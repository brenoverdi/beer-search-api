import { injectable } from 'tsyringe';
import crypto from 'crypto';
import * as authDb from '../../../services/db/auth/auth.db';
import { verifyRefreshToken } from '../../../services/auth/jwt.service';
import { cacheDel } from '../../../services/cache/cache';
import { RefreshSchema } from '../auth.model';

@injectable()
export class LogoutUseCase {
  public async execute(body: unknown, accessToken?: string): Promise<{ message: string }> {
    const { refreshToken } = RefreshSchema.parse(body);

    try {
      verifyRefreshToken(refreshToken);
    } catch {
      // Even if invalid, we proceed gracefully
      return { message: 'Logged out' };
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await authDb.findActiveRefreshToken(tokenHash);
    if (stored) await authDb.revokeRefreshToken(stored.id);

    if (accessToken) cacheDel(`auth:${accessToken}`);

    return { message: 'Logged out successfully' };
  }
}
