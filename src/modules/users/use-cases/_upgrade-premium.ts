import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as usersDb from '../../../services/db/users/users.db';

@injectable()
export class UpgradePremiumUseCase {
  public async execute(userId: number) {
    const user = await usersDb.getUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    if (user.isPremium) {
      throw new AppError(400, 'User is already Premium');
    }

    // Mocking premium upgrade (in reality, this would require Stripe webhook verification)
    const updatedUser = await usersDb.upgradeToPremium(userId);
    
    return {
      message: 'Successfully upgraded to Premium',
      user: {
        id: updatedUser.id,
        isPremium: updatedUser.isPremium,
        searchesRemaining: updatedUser.searchesRemaining
      }
    };
  }
}
