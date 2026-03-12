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

const callSingle = async (name: string): Promise<NormalizedBeer> => {
  const prompt =
    `Search Google for: ${name} beer untappd rating ABV\n\n` +
    `Find the Untappd page for this beer and extract:\n` +
    `- beer_name: exact beer name\n` +
    `- brewery: brewery name\n` +
    `- style: beer style (e.g. "IPA", "Stout", "Sour Ale")\n` +
    `- abv: ABV as number (e.g. 5.0)\n` +
    `- rating_score: Untappd rating (e.g. 3.86)\n` +
    `- rating_count: number of ratings\n` +
    `- description: 1-2 sentence description\n\n` +
    `Return JSON: {"beer_name":"","brewery":"","style":"","abv":null,"rating_score":null,"rating_count":null,"description":""}\n` +
    `Use null for any field not found. Output ONLY JSON, no markdown.`;

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
  // Process in parallel chunks of 4 for better speed while avoiding rate limits
  const CONCURRENCY = 4;
  const results: NormalizedBeer[] = [];

  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const chunk = names.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((name) => callSingle(name)));
    results.push(...chunkResults);
  }

  return results;
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
