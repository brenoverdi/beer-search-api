import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchSource } from '../beers.model';
import { scrapePageContent } from '../../../services/scraper/url-scraper';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// ── Shared helpers ────────────────────────────────────────────────────────────

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

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

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

// ── Extract beer names from scraped content ───────────────────────────────────

const extractNamesFromContent = async (pageContent: string, pageTitle: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  // Truncate content if too long (keep it under token limits)
  const truncatedContent = pageContent.length > 30000 
    ? pageContent.substring(0, 30000) + '...' 
    : pageContent;

  const prompt =
    `Analyze this text content from a beer-related webpage titled "${pageTitle}":\n\n` +
    `---PAGE CONTENT START---\n${truncatedContent}\n---PAGE CONTENT END---\n\n` +
    `This is likely a bar menu, tap list, beer list, beer store catalog, or brewery page.\n\n` +
    `Extract ALL specific beer names mentioned. Look for:\n` +
    `- Named beers like "Pliny the Elder", "Heady Topper", "Founders KBS"\n` +
    `- Brewery + beer name combinations like "Sierra Nevada Pale Ale"\n` +
    `- Craft beer names with descriptive titles\n` +
    `- Beer names in different languages (Italian, Portuguese, German, etc.)\n\n` +
    `IGNORE:\n` +
    `- Volume sizes (330ml, 473ml, pints, etc.)\n` +
    `- Prices and currencies\n` +
    `- Generic style categories alone (just "IPA" or "Stout" without a specific beer name)\n` +
    `- Navigation menu items, website headers, footers\n` +
    `- Descriptions and promotional text\n\n` +
    `Return ONLY a valid JSON array of beer name strings, maximum 50 beers.\n` +
    `Example: ["Pliny the Elder", "Heady Topper", "Bell's Two Hearted Ale"]\n` +
    `If no specific beers found, return []. Output ONLY valid JSON, no markdown or explanation.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })
  );

  const text = (response.text ?? '').trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const names = JSON.parse(match[0]) as unknown[];
    return names
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 2)
      .map((n) => n.trim())
      .slice(0, 50);
  } catch {
    return [];
  }
};

// ── Get beer details ──────────────────────────────────────────────────────────

const callGeminiBatch = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (names.length === 0) return [];

  // Batch all beers in a single Gemini call for much faster response
  const beerListStr = names.map((n, i) => `${i + 1}. "${n}"`).join('\n');
  const prompt =
    `You are a beer expert with comprehensive knowledge of craft beers, breweries, and beer ratings.\n\n` +
    `For each of the following beers, provide details based on your knowledge:\n${beerListStr}\n\n` +
    `For each beer, provide:\n` +
    `- beer_name: the canonical/official beer name\n` +
    `- brewery: brewery name\n` +
    `- style: beer style (e.g. "IPA", "Sour - Fruited", "Stout - Imperial")\n` +
    `- abv: ABV percentage as number (e.g. 5.0, 8.5)\n` +
    `- rating_score: estimated rating from 1.0 to 5.0 based on your knowledge of the beer's reputation\n` +
    `- rating_count: estimated number of ratings (use null if unknown)\n` +
    `- description: brief description of the beer (1-2 sentences)\n\n` +
    `Return a JSON array with one object per beer in the same order as the input list.\n` +
    `Format: [{"beer_name":"","brewery":"","style":"","abv":null,"rating_score":null,"rating_count":null,"description":""}]\n` +
    `Use null for truly unknown fields. Output ONLY valid JSON array, no markdown or explanation.`;

  const fallbackResults = names.map((n) => normalize({}, n));

  const responsePromise = withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })
  );

  const response = await withTimeout(responsePromise, 15000, null);
  if (!response) {
    console.warn('[URLSearch] Gemini batch call timed out, returning fallback');
    return fallbackResults;
  }

  const text = response.text ?? '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return fallbackResults;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult[];
    // Map results back to original names in order
    return names.map((name, i) => {
      const result = parsed[i];
      return result ? normalize(result, name) : normalize({}, name);
    });
  } catch {
    return fallbackResults;
  }
};

// ── Response type ─────────────────────────────────────────────────────────────

export interface UrlSearchResponse {
  source: 'url';
  url: string;
  beerNames: string[];
  results: NormalizedBeer[];
}

// ── Use Case ──────────────────────────────────────────────────────────────────

@injectable()
export class SearchBeersFromUrlUseCase {
  public async execute(url: string, userId: number | undefined): Promise<UrlSearchResponse> {
    if (!url || typeof url !== 'string') {
      throw new AppError(400, 'URL is required');
    }

    try {
      new URL(url);
    } catch {
      throw new AppError(400, 'Invalid URL format');
    }

    // Step 1: Scrape the page content
    console.log(`[URLSearch] Scraping URL: ${url}`);
    const scrapeResult = await scrapePageContent(url);
    
    if (!scrapeResult.success) {
      throw new AppError(422, scrapeResult.error || 'Could not extract content from the page');
    }

    console.log(`[URLSearch] Scraped ${scrapeResult.content.length} chars from "${scrapeResult.title}"`);

    // Step 2: Extract beer names from the scraped content using Gemini
    const names = await extractNamesFromContent(scrapeResult.content, scrapeResult.title);

    console.log(`[URLSearch] Extracted ${names.length} beer names`);

    if (names.length === 0) {
      return { source: 'url', url, beerNames: [], results: [] };
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

    await beersDb.recordSearchHistory(userId ?? null, `URL: ${url}`, 'url' as SearchSource, names.length);

    const freshMap = new Map(fresh.map((b) => [b.query.toLowerCase(), b]));
    const cachedMap = new Map(cachedResults.map((b) => [b.query.toLowerCase(), b]));

    const results = names.map((name) => {
      const key = name.toLowerCase();
      return freshMap.get(key) ?? cachedMap.get(key) ?? normalize({}, name);
    });

    return { source: 'url', url, beerNames: names, results };
  }
}
