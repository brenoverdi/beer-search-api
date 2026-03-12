import { injectable } from 'tsyringe';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, POPULAR_NAMES } from '../beers.model';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const normalize = (g: Partial<GeminiResult>, query: string): NormalizedBeer => ({
  query,
  beer_name: g.beer_name ?? query,
  brewery: g.brewery ?? 'Unknown',
  style: g.style ?? 'Unknown',
  rating_score: g.rating_score ?? null,
  rating_count: g.rating_count ?? null,
});

@injectable()
export class GetPopularBeersUseCase {
  public async execute(): Promise<{ results: NormalizedBeer[] }> {
    const hit = cacheGet<NormalizedBeer[]>('popular_beers');
    if (hit) return { results: hit };

    if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const names = POPULAR_NAMES;
    const prompt =
      `Beer encyclopedia. Input:${JSON.stringify({ beers: names })}\n` +
      `Return a JSON array with exactly ${names.length} objects, same order:\n` +
      `[{"beer_name":"","brewery":"","style":"","rating_score":0.0,"rating_count":0}]\n` +
      `Rules: beer_name=canonical name, brewery=producer, style=BJCP category, ` +
      `rating_score=Untappd avg (float 0-5), rating_count=total Untappd check-ins (int). ` +
      `Output JSON array only.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    let parsed: GeminiResult[];
    try {
      parsed = JSON.parse(text) as GeminiResult[];
    } catch {
      throw new AppError(502, 'Gemini returned invalid JSON');
    }

    const results = names.map((name, i) => normalize(parsed[i] ?? {}, name));
    await Promise.all(results.map((b) => beersDb.upsertBeer(b)));
    cacheSet('popular_beers', results, 86400);

    return { results };
  }
}
