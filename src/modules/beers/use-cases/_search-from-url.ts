import { injectable } from 'tsyringe';
import { GoogleGenAI } from '@google/genai';
import { AppError } from '../../../middlewares/error.middleware';
import * as beersDb from '../../../services/db/beers/beers.db';
import { cacheGet, cacheSet } from '../../../services/cache/cache';
import { NormalizedBeer, GeminiResult, SearchSource } from '../beers.model';
import { scrapePageContent, scrapeDynamicContent } from '../../../services/scraper/url-scraper';
import { scrapeUntappdBeers } from '../../../services/scraper/untappd-scraper';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

// ── Shared helpers ────────────────────────────────────────────────────────────

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

// ── Detect if URL is a single brewery website ─────────────────────────────────

interface BreweryDetectionResult {
  isSingleBrewery: boolean;
  breweryName: string | null;
}

const detectBreweryWebsite = async (url: string, pageContent: string, pageTitle: string): Promise<BreweryDetectionResult> => {
  // Use Gemini to analyze the page content and identify the brewery
  if (!process.env.GEMINI_API_KEY) {
    console.log('[BreweryDetection] GEMINI_API_KEY not configured, skipping brewery detection');
    return { isSingleBrewery: false, breweryName: null };
  }

  const truncatedContent = pageContent.length > 20000 
    ? pageContent.substring(0, 20000) + '...' 
    : pageContent;

  const prompt =
    `Analyze this webpage and identify the brewery name.\n\n` +
    `URL: ${url}\n` +
    `Page Title: ${pageTitle}\n\n` +
    `---PAGE CONTENT START---\n${truncatedContent}\n---PAGE CONTENT END---\n\n` +
    `Your task: Determine what brewery makes/sells the beers on this website.\n\n` +
    `Questions to answer:\n` +
    `1. Is this a SINGLE brewery's website (their own online store, brewery site, or catalog)?\n` +
    `   - Examples: Salvador brewery's store, Tree House brewery website, Russian River online shop\n` +
    `   - Even if URL contains "store" or "shop", it's still a single brewery if they only sell their own beers\n` +
    `2. OR is this a MULTI-BREWERY retailer (sells beers from many different breweries)?\n` +
    `   - Examples: Total Wine, Drizly, BevMo, craft beer stores carrying multiple brands\n\n` +
    `IMPORTANT: Identify the actual BREWERY name, not marketing terms or slogans.\n` +
    `- Look for: "About us", brewery information, who brews these beers, company name\n` +
    `- Ignore: Marketing nicknames for customers, website taglines, promotional terms\n` +
    `- Example: If site uses "Batalhão" as customer nickname but beers are made by "Salvador", return "Salvador"\n\n` +
    `If single brewery, extract the brewery name:\n` +
    `- PRIMARY name only (e.g., "Salvador" not "Salvador Brewing Company Ltd.")\n` +
    `- OR composed name (e.g., "Tree House", "Russian River", "Sierra Nevada")\n` +
    `- Examples: "Salvador", "Stone", "Dogfish Head", "Tree House"\n\n` +
    `Return ONLY valid JSON:\n` +
    `{"isSingleBrewery": true/false, "breweryName": "Name" or null}\n\n` +
    `No markdown, no explanation, just the JSON object.`;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      })
    );

    const text = (response.text ?? '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.log('[BreweryDetection] No valid JSON response from Gemini');
      return { isSingleBrewery: false, breweryName: null };
    }

    const result = JSON.parse(jsonMatch[0]) as BreweryDetectionResult;
    
    if (result.isSingleBrewery && result.breweryName) {
      console.log(`[BreweryDetection] Detected single brewery: "${result.breweryName}"`);
    } else {
      console.log('[BreweryDetection] Detected multi-brewery store/retailer');
    }
    
    return result;
  } catch (err) {
    console.error('[BreweryDetection] Error detecting brewery:', err);
    return { isSingleBrewery: false, breweryName: null };
  }
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

const extractNamesFromContent = async (
  pageContent: string, 
  pageTitle: string, 
  detectedBrewery: BreweryDetectionResult | null = null
): Promise<string[]> => {
  if (!process.env.GEMINI_API_KEY) throw new AppError(503, 'GEMINI_API_KEY is not configured');

  // Truncate content if too long (keep it under token limits)
  const truncatedContent = pageContent.length > 30000 
    ? pageContent.substring(0, 30000) + '...' 
    : pageContent;

  // Different prompt based on whether this is a single brewery or multi-brewery store
  let prompt: string;

  if (detectedBrewery?.isSingleBrewery && detectedBrewery.breweryName) {
    // Single brewery: extract ONLY actual beer product names
    prompt =
      `Analyze this text content from "${detectedBrewery.breweryName}" brewery's webpage titled "${pageTitle}":\n\n` +
      `---PAGE CONTENT START---\n${truncatedContent}\n---PAGE CONTENT END---\n\n` +
      `This is "${detectedBrewery.breweryName}" brewery's website.\n\n` +
      `Extract ALL actual BEER PRODUCT NAMES being sold/listed on this page.\n` +
      `Extract ONLY the beer names themselves - do NOT include brewery name, do NOT include marketing terms.\n\n` +
      `CRITICAL INSTRUCTIONS:\n` +
      `- The brewery name is "${detectedBrewery.breweryName}" - DO NOT include it\n` +
      `- Extract only PRODUCT names (what beers can you buy/see listed?)\n` +
      `- Ignore marketing terms, slogans, or customer nicknames\n` +
      `- Ignore the brewery name "${detectedBrewery.breweryName}" itself\n` +
      `- Beer names should be specific products, not generic styles\n\n` +
      `What to look for:\n` +
      `- Beer catalog/product listings\n` +
      `- Menu items that are specific beers\n` +
      `- Named beer products with unique titles\n` +
      `- Beer names in any language (English, Portuguese, German, etc.)\n\n` +
      `CORRECT extraction examples:\n` +
      `- "Kame Hame Ha" (specific beer product name)\n` +
      `- "Pale Ale" (if it's a specific beer product)\n` +
      `- "Two Hearted Ale" (specific beer name)\n` +
      `- "Pliny the Elder" (specific beer name)\n\n` +
      `DO NOT extract:\n` +
      `- "${detectedBrewery.breweryName}" (brewery name)\n` +
      `- "${detectedBrewery.breweryName} Kame Hame Ha" (has brewery prefix)\n` +
      `- "Kame Hame Ha ${detectedBrewery.breweryName}" (has brewery suffix)\n` +
      `- "Kame Hame Ha - IPA" (has style suffix)\n` +
      `- Marketing terms or customer nicknames\n` +
      `- Generic beer styles alone ("IPA", "Stout", "Lager")\n` +
      `- Volume sizes, prices, navigation menu text\n` +
      `- Website headers, footers, about us text\n\n` +
      `Return ONLY a valid JSON array of beer product name strings, maximum 50 beers.\n` +
      `Example: ["Kame Hame Ha", "Pale Ale", "Another Beer Name"]\n` +
      `If no specific beer products found, return []. Output ONLY valid JSON, no markdown or explanation.`;
  } else {
    // Multi-brewery store: extract "Brewery BeerName" (current behavior)
    prompt =
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
  }

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
    let filteredNames = rawNames
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 2)
      .map((n) => n.trim());
    
    // If single brewery detected, prefix each beer name with the brewery
    if (detectedBrewery?.isSingleBrewery && detectedBrewery.breweryName) {
      filteredNames = filteredNames.map(beerName => `${detectedBrewery.breweryName} ${beerName}`);
      console.log(`[URLSearch] Prefixed ${filteredNames.length} beers with brewery "${detectedBrewery.breweryName}"`);
    }
    
    const cleanedNames = filteredNames.map((n) => cleanBeerName(n));
    console.log(`[URLSearch] Extracted beer names: ${JSON.stringify(cleanedNames)}`);
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

// Main batch function: Untappd scraping only (no fallback)
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
  
  if (unfoundNames.length > 0) {
    console.log(`[URLSearch] ${unfoundNames.length} beer(s) not found on Untappd - flagged with 'Unknown' brewery`);
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

    // Step 2: Detect if this is a single brewery's website
    const breweryDetection = await detectBreweryWebsite(url, scrapeResult.content, scrapeResult.title);

    // Step 3: Extract beer names from the scraped content using Gemini
    let names = await extractNamesFromContent(scrapeResult.content, scrapeResult.title, breweryDetection);
    names = Array.from(new Set(names)); // Deduplicate
    names = names.map((n) => cleanBeerName(n)); // Final clean-up
    console.log(`[URLSearch] Extracted ${names.length} beer names`);

    // If static scraping found 0 beers, retry with Puppeteer as a safety net
    if (names.length === 0 && scrapeResult.method === 'static') {
      console.log(`[URLSearch] Static scraping found 0 beers, retrying with Puppeteer...`);
      const dynamicResult = await scrapeDynamicContent(url);
      
      if (dynamicResult.success) {
        console.log(`[URLSearch] Puppeteer extracted ${dynamicResult.content.length} chars from "${dynamicResult.title}"`);
        const breweryDetectionRetry = await detectBreweryWebsite(url, dynamicResult.content, dynamicResult.title);
        let retryNames = await extractNamesFromContent(dynamicResult.content, dynamicResult.title, breweryDetectionRetry);
        retryNames = Array.from(new Set(retryNames));
        retryNames = retryNames.map((n) => cleanBeerName(n));
        console.log(`[URLSearch] Puppeteer retry found ${retryNames.length} beers`);
        names = retryNames;
      } else {
        console.log(`[URLSearch] Puppeteer retry also failed: ${dynamicResult.error}`);
      }
    }

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
