import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as authDb from '../../../services/db/auth/auth.db';
import { MeResponse } from '../auth.model';

@injectable()
export class MeUseCase {
  public async execute(userId: number): Promise<MeResponse> {
    const user = await authDb.findUserById(userId);
    if (!user) throw new AppError(404, 'User not found');

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }
}
