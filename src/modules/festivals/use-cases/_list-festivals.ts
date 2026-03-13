import { injectable } from 'tsyringe';
import * as festivalsDb from '../../../services/db/festivals/festivals.db';
import { FestivalFilterSchema, FestivalResponse } from '../festivals.model';

@injectable()
export class ListFestivalsUseCase {
  public async execute(query: unknown): Promise<{ festivals: FestivalResponse[] }> {
    const { continent } = FestivalFilterSchema.parse(query);
    
    const festivals = await festivalsDb.findAllFestivals({
      continent: continent === 'all' ? undefined : continent,
      fromDate: new Date(), // Only upcoming festivals
    });

    return {
      festivals: festivals.map((f) => ({
        id: f.id,
        name: f.name,
        city: f.city,
        country: f.country,
        continent: f.continent,
        startDate: f.startDate.toISOString(),
        endDate: f.endDate.toISOString(),
        description: f.description,
        website: f.website,
        imageUrl: f.imageUrl,
        latitude: f.latitude,
        longitude: f.longitude,
      })),
    };
  }
}
