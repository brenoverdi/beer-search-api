import { injectable } from 'tsyringe';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchResponse, SearchSource } from '../beers.model';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

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

const callGeminiSingle = async (name: string): Promise<NormalizedBeer> => {
  const prompt =
    `Search for "${name}" on Untappd.com to find the beer's rating and details.\n\n` +
    `IMPORTANT: On Untappd, ratings appear as a decimal number (e.g., "4.21") near the beer name, often followed by the count in parentheses like "(15,234)".\n\n` +
    `Extract from the Untappd page:\n` +
    `- beer_name: exact beer name as shown on Untappd\n` +
    `- brewery: brewery name\n` +
    `- style: beer style (e.g. "IPA", "Sour - Fruited", "Stout - Imperial")\n` +
    `- abv: ABV percentage as number (e.g. 5.0, 8.5)\n` +
    `- rating_score: the Untappd rating as decimal (e.g. 3.86, 4.21). This is the average rating shown prominently on the beer page.\n` +
    `- rating_count: total number of check-ins/ratings (numeric, e.g. 15234)\n` +
    `- description: brewery's description of the beer (1-2 sentences)\n\n` +
    `Return JSON: {"beer_name":"","brewery":"","style":"","abv":null,"rating_score":null,"rating_count":null,"description":""}\n` +
    `Use null ONLY if the field truly cannot be found. Output ONLY valid JSON, no markdown or explanation.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    })
  );
  const text = response.text ?? '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return normalize({}, name);

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult;
    return normalize(parsed, name);
  } catch {
    return normalize({}, name);
  }
};

const callGeminiBatch = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  // Process in parallel chunks of 4 for better speed while avoiding rate limits
  const CONCURRENCY = 4;
  const results: NormalizedBeer[] = [];

  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const chunk = names.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((name) => callGeminiSingle(name)));
    results.push(...chunkResults);
  }

  return results;
};

const extractNamesFromImage = async (base64Data: string, mimeType: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: 'List every beer name visible in this image. IGNORE any volume indicators like "44CL", "473ML", "330ML", etc. - extract only the beer names. Return ONLY a JSON array of strings. No markdown. If no beers found, return [].' },
      ],
    }],
  });
  const text = (response.text ?? '').trim();

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const names = JSON.parse(match[0]) as unknown[];
    return names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  } catch {
    return [];
  }
};

@injectable()
export class SearchBeersUseCase {
  public async execute(
    beers: string | string[] | undefined,
    imageFile: Express.Multer.File | undefined,
    userId: number | undefined,
  ): Promise<SearchResponse> {
    let names: string[] = [];
    let source: SearchSource = 'list';

    if (imageFile) {
      source = 'image';
      const base64 = fs.readFileSync(imageFile.path).toString('base64');
      names = await extractNamesFromImage(base64, imageFile.mimetype);
      fs.unlink(imageFile.path, () => {});

      if (names.length === 0) {
        return { source, beerNames: [], results: [] };
      }
    } else {
      if (!beers || (Array.isArray(beers) && beers.length === 0)) {
        throw new AppError(400, 'Provide "beers" (string/array) or upload an "image".');
      }

      names = Array.isArray(beers)
        ? beers.map((n) => n.trim()).filter(Boolean)
        : String(beers).split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);

      source = names.length === 1 ? 'single' : 'list';
    }

    // Cache split
    const cachedResults: NormalizedBeer[] = [];
    const uncachedNames: string[] = [];

    for (const name of names) {
      const hit = cacheGet<NormalizedBeer>(`beer:${name.toLowerCase()}`);
      if (hit) cachedResults.push(hit);
      else uncachedNames.push(name);
    }

    let fresh: NormalizedBeer[] = [];
    if (uncachedNames.length > 0) {
      fresh = await callGeminiBatch(uncachedNames);
      await Promise.all(fresh.map((b) => beersDb.upsertBeer(b)));
      fresh.forEach((b) => cacheSet(`beer:${b.query.toLowerCase()}`, b, 3600));
    }

    await beersDb.recordSearchHistory(userId ?? null, names.join(', '), source, names.length);

    const freshMap = new Map(fresh.map((b) => [b.query.toLowerCase(), b]));
    const cachedMap = new Map(cachedResults.map((b) => [b.query.toLowerCase(), b]));

    const results = names.map((name) => {
      const key = name.toLowerCase();
      return freshMap.get(key) ?? cachedMap.get(key) ?? normalize({}, name);
    });

    return { source, beerNames: names, results };
  }
}
