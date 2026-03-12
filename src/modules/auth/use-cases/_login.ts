import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { signAccessToken, signRefreshToken, refreshTTLms } from '../../../services/auth/jwt.service';
import { cacheSet } from '../../../services/cache/cache';
import { LoginSchema, LoginResponse } from '../auth.model';

@injectable()
export class LoginUseCase {
  public async execute(body: unknown): Promise<LoginResponse> {
    const { email, password } = LoginSchema.parse(body);

    const user = await authDb.findUserByEmail(email);
    if (!user) throw new AppError(401, 'Invalid credentials');
    if (!user.password) throw new AppError(400, 'This account uses Google sign-in');
    if (!user.emailVerified) throw new AppError(403, 'Please verify your email before logging in');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AppError(401, 'Invalid credentials');

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
