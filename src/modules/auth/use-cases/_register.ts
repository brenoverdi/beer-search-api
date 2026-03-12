import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { sendOtpEmail } from '../../../services/email/email.service';
import { RegisterSchema, RegisterResponse } from '../auth.model';

const OTP_EXPIRY_MINUTES = 10;

@injectable()
export class RegisterUseCase {
  public async execute(body: unknown): Promise<RegisterResponse> {
    const { username, email, password } = RegisterSchema.parse(body);

    // Check duplicates
    const existing = await authDb.findUserByEmail(email);
    if (existing) throw new AppError(409, 'Email already in use');

    // Create user (unverified)
    const hashed = await bcrypt.hash(password, 12);
    const user = await authDb.createUser({ username, email, password: hashed });

    // Generate 6-digit OTP
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

    // Remove any old unused verifications first
    await authDb.deleteVerificationsForUser(user.id);
    await authDb.createEmailVerification(user.id, codeHash, expiresAt);

    // Send email (non-blocking failure: don't crash registration)
    sendOtpEmail(email, code).catch((err) =>
      console.error('[RegisterUseCase] email send failed:', err),
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
      },
      message: 'Registration successful. Check your email for the verification code.',
    };
  }
}
