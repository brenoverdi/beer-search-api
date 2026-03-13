import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { signAccessToken, signRefreshToken, refreshTTLms } from '../../../services/auth/jwt.service';
import { cacheSet } from '../../../services/cache/cache';
// import { sendOtpEmail } from '../../../services/email/email.service'; // TODO: Re-enable for OTP verification
import { RegisterSchema, RegisterResponse } from '../auth.model';

// const OTP_EXPIRY_MINUTES = 10; // TODO: Re-enable for OTP verification

@injectable()
export class RegisterUseCase {
  public async execute(body: unknown): Promise<RegisterResponse> {
    const { username, email, password, dateOfBirth, gender, country, bio, favoriteStyles } = RegisterSchema.parse(body);

    // Check duplicates
    const existing = await authDb.findUserByEmail(email);
    if (existing) throw new AppError(409, 'Email already in use');

    // Create user (auto-verified since OTP is disabled)
    const hashed = await bcrypt.hash(password, 12);
    const user = await authDb.createUser({ 
      username, 
      email, 
      password: hashed, 
      emailVerified: true,
      dateOfBirth: dateOfBirth ?? null,
      gender: gender ?? null,
      country: country ?? null,
      bio: bio ?? null,
      favoriteStyles: favoriteStyles ?? [],
    });

    // ─── OTP VERIFICATION DISABLED ───────────────────────────────────────────
    // TODO: Re-enable OTP verification in production
    // Generate 6-digit OTP
    // const code = String(Math.floor(100_000 + Math.random() * 900_000));
    // const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    // const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
    // await authDb.deleteVerificationsForUser(user.id);
    // await authDb.createEmailVerification(user.id, codeHash, expiresAt);
    // sendOtpEmail(email, code).catch((err) =>
    //   console.error('[RegisterUseCase] email send failed:', err),
    // );
    // ─────────────────────────────────────────────────────────────────────────

    // Issue tokens immediately (since email is auto-verified)
    const accessToken = signAccessToken({ sub: user.id, email: user.email, username: user.username });
    const jti = crypto.randomUUID();
    const refreshToken = signRefreshToken({ sub: user.id, jti });
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + refreshTTLms());
    await authDb.createRefreshToken(user.id, tokenHash, expiresAt);

    cacheSet(`auth:${accessToken}`, { sub: user.id, email: user.email, username: user.username }, 900);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        country: user.country,
        bio: user.bio,
        favoriteStyles: user.favoriteStyles,
      },
      accessToken,
      refreshToken,
      message: 'Registration successful. Welcome to BrewScout!',
    };
  }
}
