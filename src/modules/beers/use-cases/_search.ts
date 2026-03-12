import { injectable } from 'tsyringe';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchResponse, SearchSource } from '../beers.model';

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

const callGeminiBatch = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  // Google Search grounding — googleSearch is required for Gemini 2.0 Flash.
  // @google/generative-ai v0.24.x types only expose googleSearchRetrieval, so cast to any.
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} } as any],
  });

  const prompt =
    `You are a beer data specialist.\n` +
    `Task: Provide exact Untappd (untappd.com) metadata for the following beers. ` +
    `Use Google Search to look up each beer on Untappd before answering.\n\n` +
    `Input: ${JSON.stringify({ beers: names })}\n\n` +
    `Instructions:\n` +
    `- If a beer has multiple versions (e.g. "Vintage" or "Barrel Aged"), use the most checked-in version unless the input name specifies otherwise.\n` +
    `- Cross-reference the brewery name to ensure the beer belongs to that brewery on Untappd.\n` +
    `- rating_count must be a real integer reflecting total historical check-ins from Untappd, not a guess.\n` +
    `- Return exactly ${names.length} objects in the same order as the input.\n\n` +
    `Schema: [{"beer_name":"","brewery":"","style":"","abv":0.0,"rating_score":0.0,"rating_count":0,"description":""}]\n\n` +
    `Field rules:\n` +
    `- beer_name: exact beer name as listed on Untappd\n` +
    `- brewery: exact brewery name as listed on Untappd\n` +
    `- style: Untappd style (e.g. "IPA - Imperial / Double", "Stout - Imperial / Double", "Wheat Beer - Witbier")\n` +
    `- abv: alcohol by volume as a float (e.g. 8.0), null if unknown\n` +
    `- rating_score: Untappd weighted average rating float 0-5, null if not on Untappd\n` +
    `- rating_count: total historical Untappd check-ins as integer, null if not on Untappd\n` +
    `- description: 1-2 sentence flavor profile based on the Untappd brewery description\n\n` +
    `Return ONLY the JSON array. No markdown. No extra text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new AppError(502, 'Gemini returned no JSON array');

  let parsed: GeminiResult[];
  try {
    parsed = JSON.parse(jsonMatch[0]) as GeminiResult[];
  } catch {
    throw new AppError(502, 'Gemini returned invalid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length !== names.length) {
    throw new AppError(502, 'Gemini response length mismatch');
  }

  return names.map((name, i) => normalize(parsed[i], name));
};

const extractNamesFromImage = async (base64Data: string, mimeType: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent([
    { inlineData: { data: base64Data, mimeType } },
    'List every beer name visible in this image. Return ONLY a JSON array of strings. No markdown. If no beers found, return [].',
  ]);

  const text = result.response.text().trim();
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
