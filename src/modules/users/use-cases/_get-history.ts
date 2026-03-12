import { injectable } from 'tsyringe';
import * as usersDb from '../../../services/db/users/users.db';

@injectable()
export class GetHistoryUseCase {
  public async execute(userId: number): Promise<{ history: unknown[] }> {
    const history = await usersDb.getSearchHistory(userId, 20);
    return { history };
  }
}
