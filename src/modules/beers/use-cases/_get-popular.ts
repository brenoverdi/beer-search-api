import { injectable } from 'tsyringe';
import { GoogleGenerativeAI, GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, POPULAR_NAMES } from '../beers.model';

// Retry Gemini call on 429 with exponential backoff
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && err instanceof GoogleGenerativeAIFetchError && err.status === 429) {
      await new Promise((r) => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw err;
  }
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

const normalize = (g: Partial<GeminiResult>, query: string): NormalizedBeer => ({
  query,
  beer_name: g.beer_name ?? query,
  brewery: g.brewery ?? 'Unknown',
  style: g.style ?? 'Unknown',
  abv: g.abv ?? null,
  rating_score: g.rating_score ?? null,
  rating_count: g.rating_count ?? null,
  description: g.description ?? null,
});

@injectable()
export class GetPopularBeersUseCase {
  public async execute(): Promise<{ results: NormalizedBeer[] }> {
    // 1. In-memory cache (survives within the same serverless instance lifetime)
    const hit = cacheGet<NormalizedBeer[]>('popular_beers');
    if (hit) return { results: hit };

    // 2. DB cache — persists across cold starts, avoids Gemini on every invocation
    const slugIds = POPULAR_NAMES.map((n) => beersDb.slugify(n));
    const dbRows = await beersDb.findBeersByIds(slugIds);
    if (dbRows.length === POPULAR_NAMES.length) {
      const results: NormalizedBeer[] = dbRows.map((r) => ({
        query: r.beerName,
        beer_name: r.beerName,
        brewery: r.brewery,
        style: r.style,
        abv: r.abv ?? null,
        rating_score: r.ratingScore ?? null,
        rating_count: r.ratingCount ?? null,
        description: r.description ?? null,
      }));
      cacheSet('popular_beers', results, 86400);
      return { results };
    }

    // 3. Gemini — only called when DB doesn't have all beers yet
    if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });

    const names = POPULAR_NAMES;
    const prompt =
      `You are a beer database assistant with deep knowledge of Untappd (untappd.com), the world's largest beer check-in platform.\n` +
      `For each beer name below, return its real data exactly as it appears on Untappd.\n` +
      `Input: ${JSON.stringify({ beers: names })}\n\n` +
      `Return a JSON array with exactly ${names.length} objects in the same input order.\n` +
      `Schema: [{"beer_name":"","brewery":"","style":"","abv":0.0,"rating_score":0.0,"rating_count":0,"description":""}]\n\n` +
      `Field rules:\n` +
      `- beer_name: exact beer name as listed on Untappd\n` +
      `- brewery: exact brewery name as listed on Untappd\n` +
      `- style: Untappd style (e.g. "IPA - Imperial / Double", "Stout - Imperial / Double", "Wheat Beer - Witbier")\n` +
      `- abv: alcohol by volume as float (e.g. 8.0), null if unknown\n` +
      `- rating_score: Untappd weighted average rating float 0-5, null if not on Untappd\n` +
      `- rating_count: total Untappd check-ins as integer, null if not on Untappd\n` +
      `- description: 1-2 sentence flavor profile\n\n` +
      `Output JSON array only. No markdown. No extra text.`;

    const result = await withRetry(() => model.generateContent(prompt));
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
