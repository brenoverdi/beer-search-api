import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, POPULAR_NAMES } from '../beers.model';

const isRetryable = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (status === 429 || status === 503) return true;
  return (
    err.message.includes('429') ||
    err.message.includes('RESOURCE_EXHAUSTED') ||
    err.message.includes('503') ||
    err.message.includes('UNAVAILABLE')
  );
};

// Retry Gemini call on 429/503 with exponential backoff
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && isRetryable(err)) {
      await new Promise((r) => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw err;
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

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

const _callSingle = async (name: string): Promise<NormalizedBeer> => {
  const prompt =
    `Search for "${name} site:untappd.com" and find the beer's Untappd page.\n\n` +
    `Extract the EXACT data from the Untappd listing (use Google's indexed data):\n` +
    `- beer_name: the beer's official name\n` +
    `- brewery: the brewery name\n` +
    `- style: the style category (e.g. "Spiced / Herbed Beer")\n` +
    `- abv: the ABV percentage as a float (e.g. 5.0). If not found, use null.\n` +
    `- rating_score: the Untappd rating (e.g. 3.86)\n` +
    `- rating_count: the number of ratings as an integer (e.g. 1962)\n` +
    `- description: brief description of the beer; 1-2 sentences\n\n` +
    `Schema: {"beer_name":"","brewery":"","style":"","abv":0.0,"rating_score":0.0,"rating_count":0,"description":""}\n\n` +
    `Output ONLY the raw JSON object. No markdown. No extra text.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    })
  );
  const text = response.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return normalize({}, name);
  try {
    return normalize(JSON.parse(match[0]) as GeminiResult, name);
  } catch {
    return normalize({}, name);
  }
};

const callBatch = async (names: string[]): Promise<NormalizedBeer[]> => {
  const searchQueries = names
    .map((name, i) => `${i + 1}. "${name}" site:untappd.com`)
    .join('\n');

  const prompt =
    `Search for these beers on Untappd and extract their EXACT data from Google's indexed results:\n\n` +
    `${searchQueries}\n\n` +
    `For EACH beer, extract:\n` +
    `- beer_name: the beer's official name\n` +
    `- brewery: the brewery name\n` +
    `- style: the style category (e.g. "Spiced / Herbed Beer")\n` +
    `- abv: ABV as a float (e.g. 5.0). If not found, use null.\n` +
    `- rating_score: the Untappd rating (e.g. 3.86)\n` +
    `- rating_count: number of ratings as integer (e.g. 1962)\n` +
    `- description: brief description; 1-2 sentences\n\n` +
    `Return a JSON array with ${names.length} objects in the SAME ORDER as the input list.\n` +
    `Schema: [{"beer_name":"","brewery":"","style":"","abv":0.0,"rating_score":0.0,"rating_count":0,"description":""}]\n\n` +
    `Output ONLY the raw JSON array. No markdown. No extra text.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    })
  );
  const text = response.text ?? '';

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return names.map((name) => normalize({}, name));

  try {
    const parsed = JSON.parse(match[0]) as GeminiResult[];
    return names.map((name, i) => normalize(parsed[i] ?? {}, name));
  } catch {
    return names.map((name) => normalize({}, name));
  }
};

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

    // 3. Gemini — single batch call with googleSearch grounding
    if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

    const results = await callBatch(POPULAR_NAMES);

    await Promise.all(results.map((b) => beersDb.upsertBeer(b)));
    cacheSet('popular_beers', results, 86400);

    return { results };
  }
}
