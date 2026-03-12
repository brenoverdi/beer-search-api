import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, POPULAR_NAMES } from '../beers.model';

const is429 = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: number }).status;
  if (status === 429) return true;
  return err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED');
};

// Retry Gemini call on 429 with exponential backoff
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0 && is429(err)) {
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

const callSearcher = async (name: string): Promise<string> => {
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents:
        `You are a search query optimizer for a beer application. Your goal is to find the exact Untappd URL for a specific beer.\n\n` +
        `Input: "${name}"\n\n` +
        `Task:\n` +
        `1. Construct a Google search query that targets the Untappd beer page.\n` +
        `2. If the brewery name is known, include it.\n\n` +
        `Return ONLY a JSON object in this format:\n` +
        `{"search_query": "specific beer name brewery site:untappd.com/b/"}`,
    })
  );
  const text = response.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return `${name} site:untappd.com/b/`;
  try {
    const parsed = JSON.parse(match[0]) as { search_query?: string };
    return parsed.search_query ?? `${name} site:untappd.com/b/`;
  } catch {
    return `${name} site:untappd.com/b/`;
  }
};

const callExtractor = async (name: string, searchQuery: string): Promise<NormalizedBeer> => {
  const prompt =
    `Search for "${searchQuery}" to find the Untappd page for the beer "${name}", then fetch and read that page.\n\n` +
    `You are a precision data extraction tool.\n\n` +
    `STRICT EXTRACTION RULES:\n` +
    `1. BREWERY: Extract the legal brewery name.\n` +
    `2. ABV: Look for the "%" symbol. Convert it to a float. If "N/A", use 0.0.\n` +
    `3. RATING_SCORE: This is the "Weighted Average." It must be a float between 0 and 5.\n` +
    `4. RATING_COUNT: This is the total number of "Ratings". Remove commas and return as an integer.\n` +
    `5. DESCRIPTION: Provide a 1-2 sentence English description based ONLY on the retrieved text.\n\n` +
    `If the data is missing from the retrieved page, do not guess based on your training data. Use 0.0 or 0.\n\n` +
    `Schema: {"beer_name":"","brewery":"","style":"","abv":0.0,"rating_score":0.0,"rating_count":0,"description":""}\n\n` +
    `Output ONLY the raw JSON. No markdown code blocks. No preamble.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }, { urlContext: {} }],
      },
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

const callSingle = async (name: string): Promise<NormalizedBeer> => {
  const searchQuery = await callSearcher(name);
  return callExtractor(name, searchQuery);
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

    // 3. Gemini — only called when DB doesn't have all beers yet
    if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

    // Sequential: one grounded call per beer to avoid rate-limit bursts.
    const results: NormalizedBeer[] = [];
    for (const n of POPULAR_NAMES) {
      results.push(await callSingle(n));
    }

    await Promise.all(results.map((b) => beersDb.upsertBeer(b)));
    cacheSet('popular_beers', results, 86400);

    return { results };
  }
}
