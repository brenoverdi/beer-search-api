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

const _callGeminiSingle = async (name: string): Promise<NormalizedBeer> => {
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

  // Build a single prompt for all beers — googleSearch can handle multiple queries
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

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Fallback: return normalized defaults
    return names.map((name) => normalize({}, name));
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult[];
    return names.map((name, i) => normalize(parsed[i] ?? {}, name));
  } catch {
    return names.map((name) => normalize({}, name));
  }
};

const extractNamesFromImage = async (base64Data: string, mimeType: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: 'List every beer name visible in this image. Return ONLY a JSON array of strings. No markdown. If no beers found, return [].' },
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
