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

const normalize = (g: Partial<GeminiResult>, query: string): NormalizedBeer => {
  // Validate rating_score is between 0-5
  let ratingScore = g.rating_score ?? null;
  if (ratingScore !== null && (ratingScore < 0 || ratingScore > 5)) {
    ratingScore = null;
  }
  
  return {
    query,
    beer_name: g.beer_name ?? query,
    brewery: g.brewery ?? 'Unknown',
    style: g.style ?? 'Unknown',
    abv: g.abv ?? null,
    rating_score: ratingScore,
    rating_count: g.rating_count ?? null,
    description: g.description ?? null,
  };
};

const callSingle = async (name: string, isRetryAttempt = false): Promise<NormalizedBeer> => {
  // Enhanced prompt for better rating extraction
  const prompt = isRetryAttempt
    ? `I need the Untappd rating for the beer "${name}". ` +
      `Search for this beer on Untappd.com. The rating is usually displayed as a decimal number between 1.0 and 5.0 (like 4.21 or 3.86). ` +
      `The number of check-ins/ratings is shown in parentheses like "(15,234)". ` +
      `Return ONLY this JSON: {"beer_name":"${name}","brewery":"","style":"","abv":null,"rating_score":null,"rating_count":null,"description":""} ` +
      `Fill in what you find. rating_score MUST be a decimal like 4.21. Output ONLY valid JSON.`
    : `Search for "${name}" on Untappd.com to find the beer's rating and details.\n\n` +
      `IMPORTANT: On Untappd, the rating appears as a decimal number between 1.0 and 5.0, displayed prominently near the beer name. ` +
      `It looks like "4.21" followed by the rating count in parentheses like "(15,234 Ratings)".\n\n` +
      `Extract from the Untappd page:\n` +
      `- beer_name: exact beer name as shown on Untappd\n` +
      `- brewery: brewery name\n` +
      `- style: beer style (e.g. "Imperial IPA", "Quadrupel", "Imperial Stout")\n` +
      `- abv: ABV percentage as number (e.g. 10.2, 8.0)\n` +
      `- rating_score: the Untappd rating as a decimal between 1.0 and 5.0 (e.g. 4.21, 3.86)\n` +
      `- rating_count: total number of check-ins/ratings as integer (e.g. 15234)\n` +
      `- description: brewery's description of the beer (1-2 sentences)\n\n` +
      `Return JSON: {"beer_name":"","brewery":"","style":"","abv":null,"rating_score":null,"rating_count":null,"description":""}\n` +
      `CRITICAL: rating_score must be a decimal number like 4.21, NOT null if you can find it on Untappd.\n` +
      `Output ONLY valid JSON, no markdown or explanation.`;

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
    const parsed = JSON.parse(match[0]) as GeminiResult;
    const result = normalize(parsed, name);
    
    // If rating is still null and this wasn't a retry, try once more with focused prompt
    if (result.rating_score === null && !isRetryAttempt) {
      console.log(`[GetPopular] Rating missing for "${name}", retrying with focused prompt...`);
      return callSingle(name, true);
    }
    
    return result;
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
