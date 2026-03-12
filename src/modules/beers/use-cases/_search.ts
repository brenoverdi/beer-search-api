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

// Step 1: Generate an optimized Untappd search query for the beer.
const callGeminiSearcher = async (name: string): Promise<string> => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt =
    `You are a search query optimizer for a beer application. Your goal is to find the exact Untappd URL for a specific beer.\n\n` +
    `Input: "${name}"\n\n` +
    `Task:\n` +
    `1. Construct a Google search query that targets the Untappd beer page.\n` +
    `2. If the brewery name is known, include it.\n\n` +
    `Return ONLY a JSON object in this format:\n` +
    `{"search_query": "specific beer name brewery site:untappd.com/b/"}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return `${name} site:untappd.com/b/`;

  try {
    const parsed = JSON.parse(match[0]) as { search_query?: string };
    return parsed.search_query ?? `${name} site:untappd.com/b/`;
  } catch {
    return `${name} site:untappd.com/b/`;
  }
};

// Step 2: Use the search query with grounding to retrieve and strictly extract beer data.
const callGeminiExtractor = async (name: string, searchQuery: string): Promise<NormalizedBeer> => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ googleSearch: {} } as any],
  });

  const prompt =
    `Search for "${searchQuery}" to find the Untappd page for the beer "${name}".\n\n` +
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

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return normalize({}, name);

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult;
    return normalize(parsed, name);
  } catch {
    return normalize({}, name);
  }
};

// Two-step pipeline: Searcher → Extractor.
const callGeminiSingle = async (name: string): Promise<NormalizedBeer> => {
  const searchQuery = await callGeminiSearcher(name);
  return callGeminiExtractor(name, searchQuery);
};

const callGeminiBatch = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  // Sequential: one grounded call per beer avoids both rate-limit bursts and
  // cross-beer numeric contamination that happens with batched prompts.
  const results: NormalizedBeer[] = [];
  for (const name of names) {
    results.push(await callGeminiSingle(name));
  }
  return results;
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
