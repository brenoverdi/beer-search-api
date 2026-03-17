import { injectable } from 'tsyringe';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchResponse, SearchSource } from '../beers.model';
import { scrapeUntappdBeers } from '../../../services/scraper/untappd-scraper';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

/**
 * Clean beer name by removing style descriptors from beginning and end.
 * Examples:
 *   "Avery Certation Equestris Sour BA" -> "Avery Certation Equestris"
 *   "IPA Sierra Nevada Pale Ale" -> "Sierra Nevada Pale Ale"
 *   "Guinness Draught - Stout - Irish Dry" -> "Guinness Draught"
 *   "Barrel Aged Imperial Stout Special Reserve" -> "Special Reserve"
 */
const cleanBeerName = (name: string): string => {
  let cleaned = name.trim();
  
  // Common style keywords and abbreviations to remove
  // IMPORTANT: Longer phrases first, so "American IPA" matches before "American" or "IPA" alone
  const styleKeywords = [
    // Multi-word style combinations (longest first)
    'Barrel Aged Imperial Stout', 'Bourbon Barrel Aged Stout', 'Oak Aged Imperial Stout',
    'Double Barrel Aged', 'Triple Barrel Aged',
    'New England IPA', 'West Coast IPA', 'East Coast IPA',
    'American IPA', 'English IPA', 'Belgian IPA', 'Session IPA',
    'American Pale Ale', 'English Pale Ale', 'Belgian Pale Ale',
    'American Stout', 'Russian Imperial Stout', 'Imperial Stout', 'Milk Stout', 'Oatmeal Stout',
    'American Lager', 'Czech Lager', 'Imperial Lager',
    'American Porter', 'English Porter', 'Baltic Porter',
    'Imperial Porter', 'Robust Porter',
    'American Amber', 'American Brown', 'American Wheat',
    'German Pilsner', 'Czech Pilsner', 'Bohemian Pilsner',
    'Hazy IPA', 'Juicy IPA', 'Milkshake IPA',
    'Double IPA', 'Triple IPA', 'Imperial IPA',
    'Barrel Aged Stout', 'Barrel Aged Porter', 'Barrel Aged Barleywine',
    'Berliner Weisse', 'Berliner Weiss',
    'Belgian Dubbel', 'Belgian Tripel', 'Belgian Quad', 'Belgian Strong Ale',
    'Imperial Saison', 'Farmhouse Ale',
    'Extra Special Bitter', 'English Bitter',
    'India Pale Ale',
    
    // Base styles and abbreviations
    'NEIPA', 'WCIPA', 'IPA', 'DIPA', 'TIPA', 'IIPA', 'APA', 'EPA',
    'ESB', 'RIS', 'BBA',
    'Stout', 'Lager', 'Ale', 'Porter', 'Pilsner', 'Pils',
    'Wheat', 'Weizen', 'Wit', 'Sour', 'Saison', 'Lambic', 'Gose', 'Kolsch', 'Bitter',
    'Brown', 'Amber', 'Red', 'Blonde', 'Golden', 'Dark', 'Light', 'Pale',
    'Barleywine',
    
    // Modifiers
    'Imperial', 'Double', 'Triple', 'Quad', 'Quadrupel', 'Dubbel', 'Tripel',
    'Session', 'Hazy', 'Juicy', 'Milkshake', 'Pastry',
    
    // Origins
    'American', 'Belgian', 'German', 'English', 'Irish', 'Scottish', 'Czech',
    'Baltic', 'West Coast', 'East Coast', 'New England', 'Bohemian', 'NE',
    
    // Adjectives
    'Dry', 'Milk', 'Oatmeal', 'Coffee', 'Chocolate', 'Vanilla',
    'Fruited', 'Berliner', 'Hefeweizen', 'Dunkel', 'Bock', 'Maibock',
    'Doppelbock', 'Marzen', 'Oktoberfest', 'Rauchbier', 'Schwarzbier',
    'Vienna', 'India', 'Tropical', 'Citrus', 'Pine', 'Resinous',
    'Hoppy', 'Malty', 'Sweet', 'Tart', 'Funky', 'Earthy', 'Spicy',
    'Crisp', 'Smooth', 'Creamy', 'Wild', 'Spontaneous', 'Farmhouse', 'Robust',
    
    // Aging/Treatment
    'Bourbon Barrel', 'Wine Barrel', 'Oak Barrel',
    'Barrel Aged', 'Barrel-Aged', 'Wood Aged', 'Wood-Aged',
    'Oak Aged', 'Oak-Aged',
    'BA', 'Barrel', 'Cask', 'Aged',
    
    // Common suffixes
    'Strong Ale', 'Style', 'Beer', 'Brew', 'Brewed', 'Weisse', 'Weiss'
  ];
  
  // Create pattern for styles at the end (with word boundaries to avoid matching parts of words)
  // \b ensures we only match complete words, not parts like "BA" in "Balabiott" or "Brew" in "Brewski"
  const stylePattern = new RegExp(
    `\\s*[-–—]?\\s*\\b(${styleKeywords.join('|')})\\b\\s*[-–—]?\\s*$`,
    'gi'
  );
  
  // Remove styles from the end (multiple passes to catch chains like "Sour BA")
  let previousCleaned = '';
  let iterations = 0;
  const maxIterations = 5; // Prevent infinite loops
  
  while (cleaned !== previousCleaned && iterations < maxIterations) {
    previousCleaned = cleaned;
    cleaned = cleaned.replace(stylePattern, '').trim();
    iterations++;
  }
  
  // Remove styles from the beginning (with word boundaries)
  const prefixPattern = new RegExp(
    `^\\s*\\b(${styleKeywords.join('|')})\\b\\s*[-–—]?\\s*`,
    'gi'
  );
  
  cleaned = cleaned.replace(prefixPattern, '').trim();
  
  // Remove any remaining standalone hyphens or dashes at the end
  cleaned = cleaned.replace(/\s*[-–—]+\s*$/, '').trim();
  
  // If we cleaned everything away, return original
  if (cleaned.length === 0) {
    return name.trim();
  }
  
  return cleaned;
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

// Fetch beer details from Untappd ONLY - no AI fallback
const fetchBeerDetails = async (names: string[]): Promise<NormalizedBeer[]> => {
  if (names.length === 0) return [];

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Search] Starting Untappd search for ${names.length} beer(s)`);
  console.log(`[${timestamp}] [Search] Beer names:`, names);

  const untappdResults = await scrapeUntappdBeers(names, 3);

  const results: NormalizedBeer[] = [];
  const foundBeers: string[] = [];
  const notFoundBeers: string[] = [];

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
      foundBeers.push(name);
      console.log(`[${timestamp}] [Search] ✓ Found "${name}" on Untappd: ${untappdData.brewery} - ${untappdData.beer_name}`);
    } else {
      // Not found on Untappd - return with Unknown brewery (no AI fallback)
      results.push(normalize({}, name));
      notFoundBeers.push(name);
      console.log(`[${timestamp}] [Search] ✗ Not found on Untappd: "${name}"`);
    }
  }

  console.log(`[${timestamp}] [Search] Results: ${foundBeers.length} found, ${notFoundBeers.length} not found`);
  if (notFoundBeers.length > 0) {
    console.log(`[${timestamp}] [Search] Not found beers:`, notFoundBeers);
  }

  return results;
};

const extractNamesFromImage = async (base64Data: string, mimeType: string): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ImageExtraction] Starting image analysis`);
  console.log(`[${timestamp}] [ImageExtraction] Image type: ${mimeType}, size: ${Math.round(base64Data.length / 1024)}KB`);

  const prompt = `You are a beer label recognition expert. Analyze this image and extract ONLY the beer names that are clearly visible.

RULES:
1. Extract ONLY beers you can actually see in the image
2. DO NOT hallucinate or guess beer names
3. DO NOT include beers from your training data that aren't visible
4. Format: "Brewery BeerName" if both are visible, or just "BeerName" if only beer name is visible
5. DO NOT include style descriptors (NO "IPA", "Stout", "Lager" suffixes)
6. IGNORE volume indicators (NO "44CL", "473ML", "330ML")
7. If the image shows a website or store with many beers, extract ALL visible beer names

EXAMPLES OF CORRECT OUTPUT:
["Russian River Pliny the Elder", "Sierra Nevada Pale Ale", "Guinness Draught"]

EXAMPLES OF INCORRECT OUTPUT:
["Pliny the Elder - IPA", "Sierra Nevada Pale Ale 355ML", "Random Beer Not In Image"]

Return ONLY a JSON array of strings. No markdown, no explanation. If no beers are visible, return [].`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: prompt },
      ],
    }],
  });
  
  const text = (response.text ?? '').trim();
  console.log(`[${timestamp}] [ImageExtraction] Raw Gemini response:`, text.substring(0, 500));

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.log(`[${timestamp}] [ImageExtraction] ✗ No JSON array found in response`);
    return [];
  }

  try {
    const rawNames = JSON.parse(match[0]) as unknown[];
    const filteredNames = rawNames
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim());
    
    const cleanedNames = filteredNames.map((n) => cleanBeerName(n));
    
    console.log(`[${timestamp}] [ImageExtraction] ✓ Extracted ${cleanedNames.length} beer name(s):`);
    cleanedNames.forEach((name, i) => {
      if (filteredNames[i] !== name) {
        console.log(`[${timestamp}] [ImageExtraction]   ${i + 1}. "${filteredNames[i]}" → "${name}" (cleaned)`);
      } else {
        console.log(`[${timestamp}] [ImageExtraction]   ${i + 1}. "${name}"`);
      }
    });
    
    return cleanedNames;
  } catch (err) {
    console.error(`[${timestamp}] [ImageExtraction] ✗ Failed to parse JSON:`, err);
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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SearchBeers] ════════════════════════════════════════`);
    console.log(`[${timestamp}] [SearchBeers] New search request started`);
    console.log(`[${timestamp}] [SearchBeers] Source: ${imageFile ? 'IMAGE' : 'TEXT'}, User ID: ${userId ?? 'anonymous'}`);
    
    let names: string[] = [];
    let source: SearchSource = 'list';

    if (imageFile) {
      source = 'image';
      console.log(`[${timestamp}] [SearchBeers] Processing image: "${imageFile.originalname}" (${imageFile.mimetype})`);
      const base64 = fs.readFileSync(imageFile.path).toString('base64');
      names = await extractNamesFromImage(base64, imageFile.mimetype);
      fs.unlink(imageFile.path, () => {});
      console.log(`[${timestamp}] [SearchBeers] Image analysis complete: ${names.length} beer(s) detected`);

      if (names.length === 0) {
        console.log(`[${timestamp}] [SearchBeers] No beers found in image, returning empty result`);
        return { source, beerNames: [], results: [] };
      }
    } else {
      if (!beers || (Array.isArray(beers) && beers.length === 0)) {
        throw new AppError(400, 'Provide "beers" (string/array) or upload an "image".');
      }

      names = Array.isArray(beers)
        ? beers.map((n) => n.trim()).filter(Boolean)
        : String(beers).split(/[\n,]+/).map((n) => n.trim()).filter(Boolean);

      // Clean beer names to remove any style suffixes
      const originalNames = [...names];
      names = names.map((n) => cleanBeerName(n));
      
      // Log any names that were cleaned
      originalNames.forEach((original, i) => {
        if (original !== names[i]) {
          console.log(`[${timestamp}] [SearchBeers] Cleaned input: "${original}" → "${names[i]}"`);
        }
      });

      source = names.length === 1 ? 'single' : 'list';
      console.log(`[${timestamp}] [SearchBeers] Processing ${names.length} beer(s) from ${source}`);
    }

    // Cache split
    const cachedResults: NormalizedBeer[] = [];
    const uncachedNames: string[] = [];

    for (const name of names) {
      const cacheKey = `beer:${name.toLowerCase()}`;
      const hit = cacheGet<NormalizedBeer>(cacheKey);
      if (hit) {
        cachedResults.push(hit);
        console.log(`[${timestamp}] [SearchBeers] ✓ Cache HIT: "${name}"`);
      } else {
        uncachedNames.push(name);
        console.log(`[${timestamp}] [SearchBeers] ✗ Cache MISS: "${name}"`);
      }
    }
    console.log(`[${timestamp}] [SearchBeers] Cache summary: ${cachedResults.length} hits, ${uncachedNames.length} misses`);

    let fresh: NormalizedBeer[] = [];
    if (uncachedNames.length > 0) {
      console.log(`[${timestamp}] [SearchBeers] Fetching ${uncachedNames.length} beer(s) from Untappd...`);
      fresh = await fetchBeerDetails(uncachedNames);
      console.log(`[${timestamp}] [SearchBeers] Saving ${fresh.length} result(s) to database...`);
      await Promise.all(fresh.map((b) => beersDb.upsertBeer(b)));
      fresh.forEach((b) => {
        const cacheKey = `beer:${b.query.toLowerCase()}`;
        cacheSet(cacheKey, b, 3600);
        console.log(`[${timestamp}] [SearchBeers] Cached: "${b.query}" → ${b.brewery} ${b.beer_name}`);
      });
    }

    await beersDb.recordSearchHistory(userId ?? null, names.join(', '), source, names.length);

    const freshMap = new Map(fresh.map((b) => [b.query.toLowerCase(), b]));
    const cachedMap = new Map(cachedResults.map((b) => [b.query.toLowerCase(), b]));

    const results = names.map((name) => {
      const key = name.toLowerCase();
      return freshMap.get(key) ?? cachedMap.get(key) ?? normalize({}, name);
    });

    const foundCount = results.filter(r => r.brewery !== 'Unknown').length;
    const notFoundCount = results.length - foundCount;
    
    console.log(`[${timestamp}] [SearchBeers] ════════════════════════════════════════`);
    console.log(`[${timestamp}] [SearchBeers] Search complete: ${foundCount} found, ${notFoundCount} not found`);
    console.log(`[${timestamp}] [SearchBeers] Returning ${results.length} total result(s)`);
    
    return { source, beerNames: names, results };
  }
}
