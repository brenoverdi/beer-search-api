import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchSource } from '../beers.model';
import { scrapePageContent } from '../../../services/scraper/url-scraper';
import { scrapeUntappdBeers } from '../../../services/scraper/untappd-scraper';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Clean beer name by removing style suffixes that Gemini might include.
 * Examples:
 *   "Guinness Draught - Stout - Irish Dry" -> "Guinness Draught"
 *   "Sierra Nevada Pale Ale - Pale Ale - American" -> "Sierra Nevada Pale Ale"
 */
const cleanBeerName = (name: string): string => {
  // Remove style suffixes like " - IPA - Imperial", " - Stout - Irish Dry", etc.
  // Common style keywords to strip
  const stylePattern = /\s*-\s*(IPA|Stout|Lager|Ale|Porter|Pilsner|Wheat|Sour|Saison|Lambic|Gose|Kolsch|Bitter|Brown|Amber|Red|Blonde|Golden|Dark|Light|Imperial|Double|Triple|Quad|Session|Hazy|New England|West Coast|American|Belgian|German|English|Irish|Scottish|Czech|Baltic|Dry|Milk|Oatmeal|Coffee|Chocolate|Vanilla|Barrel[- ]Aged|Wood[- ]Aged|Farmhouse|Wild|Spontaneous|Fruited|Berliner|Weisse|Hefeweizen|Dunkel|Bock|Maibock|Doppelbock|Marzen|Oktoberfest|Rauchbier|Schwarzbier|Vienna|Pale|India|New England|Hazy|Juicy|Tropical|Citrus|Pine|Resinous|Hoppy|Malty|Sweet|Bitter|Tart|Funky|Earthy|Spicy|Crisp|Smooth|Creamy|Full[- ]Bodied|Light[- ]Bodied|Medium[- ]Bodied)(?:\s*-\s*[A-Za-z\s]+)?$/i;
  
  return name.replace(stylePattern, '').trim();
};

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
  beer_name: g.beer_name ? cleanBeerName(g.beer_name) : query,
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
    `Extract ALL specific beer names mentioned. For EACH beer, include the brewery name if visible.\n` +
    `Format: "Brewery BeerName" (e.g., "Russian River Pliny the Elder", "Sierra Nevada Pale Ale")\n` +
    `If brewery is not visible, use just the beer name (e.g., "Heady Topper", "Founders KBS")\n\n` +
    `Look for:\n` +
    `- Named beers with breweries: "Russian River Pliny the Elder", "Bell's Two Hearted Ale"\n` +
    `- Brewery + beer name combinations: "Sierra Nevada Pale Ale", "Dogfish Head 60 Minute IPA"\n` +
    `- Craft beer names with descriptive titles\n` +
    `- Beer names in different languages (Italian, Portuguese, German, etc.)\n\n` +
    `IMPORTANT: Extract ONLY "Brewery BeerName", WITHOUT any style descriptors.\n` +
    `CORRECT: "Guinness Draught", "Russian River Pliny the Elder", "Sierra Nevada Pale Ale"\n` +
    `WRONG: "Guinness Draught - Stout", "Pliny the Elder - IPA", "Sierra Nevada Pale Ale - American Pale Ale"\n\n` +
    `IGNORE:\n` +
    `- Volume sizes (330ml, 473ml, pints, etc.)\n` +
    `- Prices and currencies\n` +
    `- Style suffixes or descriptors (IPA, Stout, Lager, etc. should not be appended)\n` +
    `- Generic style categories alone (just "IPA" or "Stout" without a specific beer name)\n` +
    `- Navigation menu items, website headers, footers\n` +
    `- Descriptions and promotional text\n\n` +
    `Return ONLY a valid JSON array of strings in "Brewery BeerName" format, maximum 50 beers.\n` +
    `Example: ["Russian River Pliny the Elder", "Heady Topper", "Bell's Two Hearted Ale"]\n` +
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
    const rawNames = JSON.parse(match[0]) as unknown[];
    const filteredNames = rawNames
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 2)
      .map((n) => n.trim());
    
    const cleanedNames = filteredNames.map((n) => cleanBeerName(n));
    console.log(`[URLSearch] Extracted raw beer names: ${JSON.stringify(filteredNames)}`);
    // Log any names that were cleaned (had styles removed)
    filteredNames.forEach((raw, i) => {
      if (raw !== cleanedNames[i]) {
        console.log(`[URLSearch] Cleaned beer name: "${raw}" → "${cleanedNames[i]}"`);
      }
    });
    
    return cleanedNames.slice(0, 50);
  } catch {
    return [];
  }
};

// ── Get beer details ──────────────────────────────────────────────────────────

// Gemini fallback for beers not found on Untappd
const callGeminiFallback = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (names.length === 0) return [];

  const beerListStr = names.map((n, i) => `${i + 1}. "${n}"`).join('\n');
  const prompt =
    `You are a beer expert with comprehensive knowledge of craft beers, breweries, and beer ratings.\n\n` +
    `For each of the following beers, provide details based on your knowledge:\n${beerListStr}\n\n` +
    `For each beer, provide:\n` +
    `- beer_name: ONLY the beer name itself, WITHOUT style suffixes (e.g. "Guinness Draught" NOT "Guinness Draught - Stout")\n` +
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
    console.warn('[URLSearch] Gemini fallback timed out');
    return fallbackResults;
  }

  const text = response.text ?? '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return fallbackResults;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeminiResult[];
    return names.map((name, i) => {
      const result = parsed[i];
      return result ? normalize(result, name) : normalize({}, name);
    });
  } catch {
    return fallbackResults;
  }
};

// Main batch function: Untappd first, Gemini fallback
const fetchBeerDetails = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (names.length === 0) return [];

  // Step 1: Try Untappd scraping first (real data source)
  console.log(`[URLSearch] Scraping Untappd for ${names.length} beers...`);
  const untappdResults = await scrapeUntappdBeers(names, 3);

  const results: NormalizedBeer[] = [];
  const unfoundNames: string[] = [];

  for (const name of names) {
    const untappdData = untappdResults.get(name.toLowerCase());
    if (untappdData && untappdData.brewery !== 'Unknown') {
      results.push({
        query: name,
        beer_name: untappdData.beer_name,
        brewery: untappdData.brewery,
        style: untappdData.style,
        abv: untappdData.abv,
        rating_score: untappdData.rating_score,
        rating_count: untappdData.rating_count,
        description: untappdData.description,
      });
    } else {
      unfoundNames.push(name);
      results.push(normalize({}, name)); // Placeholder
    }
  }

  console.log(`[URLSearch] Untappd found ${names.length - unfoundNames.length}/${names.length} beers`);

  // Step 2: For beers not found on Untappd, use Gemini as fallback
  if (unfoundNames.length > 0 && process.env.GEMINI_API_KEY) {
    console.log(`[URLSearch] Using Gemini fallback for ${unfoundNames.length} beers...`);
    const geminiResults = await callGeminiFallback(unfoundNames);

    // Merge Gemini results back into results array
    const geminiMap = new Map(geminiResults.map((b) => [b.query.toLowerCase(), b]));
    for (let i = 0; i < results.length; i++) {
      const key = results[i].query.toLowerCase();
      const geminiResult = geminiMap.get(key);
      if (geminiResult && results[i].brewery === 'Unknown') {
        results[i] = geminiResult;
      }
    }
  }

  return results;
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
    let names = await extractNamesFromContent(scrapeResult.content, scrapeResult.title);
    names = Array.from(new Set(names)); // Deduplicate
    names = names.map((n) => cleanBeerName(n)); // Final clean-up
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
      fresh = await fetchBeerDetails(uncachedNames);
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
