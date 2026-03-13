import { injectable } from 'tsyringe';
import { AppError } from '../../../middlewares/error.middleware';
import * as festivalsDb from '../../../services/db/festivals/festivals.db';
import { FestivalResponse } from '../festivals.model';

@injectable()
export class GetFestivalUseCase {
  public async execute(id: number): Promise<{ festival: FestivalResponse }> {
    const festival = await festivalsDb.findFestivalById(id);
    
    if (!festival) {
      throw new AppError(404, 'Festival not found');
    }

    return {
      festival: {
        id: festival.id,
        name: festival.name,
        city: festival.city,
        country: festival.country,
        continent: festival.continent,
        startDate: festival.startDate.toISOString(),
        endDate: festival.endDate.toISOString(),
        description: festival.description,
        website: festival.website,
        imageUrl: festival.imageUrl,
        latitude: festival.latitude,
        longitude: festival.longitude,
      },
    };
  }
}
