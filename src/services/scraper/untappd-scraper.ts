/**
 * Untappd Scraper Service
 *
 * Searches Untappd for beer information and scrapes the results.
 * Also follows the link to the beer detail page to get IBU and check-ins.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface UntappdBeerResult {
  beer_name: string;
  brewery: string;
  style: string;
  abv: number | null;
  ibu: number | null;
  check_ins: number | null;
  rating_score: number | null;
  rating_count: number | null;
  description: string | null;
}

interface ScrapeAttemptResult {
  success: boolean;
  data?: UntappdBeerResult;
  error?: string;
}

interface BeerDetailResult {
  abv: number | null;
  ibu: number | null;
  check_ins: number | null;
}

/**
 * Scrape the beer detail page to get IBU, check-ins (unique), and a more reliable ABV.
 */
async function scrapeUntappdBeerDetail(url: string): Promise<BeerDetailResult> {
  const timestamp = new Date().toISOString();
  const empty: BeerDetailResult = { abv: null, ibu: null, check_ins: null };

  try {
    console.log(`[${timestamp}] [Untappd] Fetching detail page: ${url}`);
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // ABV — detail page has it in .details .abv or .beer-details
    let abv: number | null = null;
    const abvEl = $('.details .abv, .beer-details .abv').first();
    if (abvEl.length) {
      const m = abvEl.text().match(/(\d+\.?\d*)\s*%/i);
      if (m) abv = parseFloat(m[1]);
    }

    // IBU — same section
    let ibu: number | null = null;
    const ibuEl = $('.details .ibu, .beer-details .ibu').first();
    if (ibuEl.length) {
      const m = ibuEl.text().match(/(\d+\.?\d*)/);
      if (m) ibu = parseInt(m[1], 10);
    }

    // Check-ins (Unique) — stats section on the detail page
    // The stats block has labels like "TOTAL", "UNIQUE", "MONTHLY", "YOU"
    // Each stat is wrapped in a <p> with a <span class="count"> and a label
    let check_ins: number | null = null;

    $('.stats p, .beer-stats p').each((_i, el) => {
      const text = $(el).text();
      if (/unique/i.test(text)) {
        const countEl = $(el).find('.count, .num');
        const raw = countEl.text().replace(/[,.\s]/g, '');
        const m = raw.match(/(\d+)/);
        if (m) check_ins = parseInt(m[1], 10);
      }
    });

    // Fallback: look for a standalone element with data attribute or class
    if (check_ins === null) {
      $('[data-count], .unique-count').each((_i, el) => {
        const raw = $(el).text().replace(/[,.\s]/g, '');
        const m = raw.match(/(\d+)/);
        if (m) {
          check_ins = parseInt(m[1], 10);
          return false; // break
        }
      });
    }

    console.log(`[${timestamp}] [Untappd]   Detail → ABV: ${abv ?? 'N/A'}%, IBU: ${ibu ?? 'N/A'}, Check-ins: ${check_ins ?? 'N/A'}`);
    return { abv, ibu, check_ins };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[${timestamp}] [Untappd] ⚠ Detail page failed (${url}): ${message}`);
    return empty;
  }
}

/**
 * Search Untappd for a beer and extract details from the first result.
 */
export async function scrapeUntappdBeer(beerName: string): Promise<ScrapeAttemptResult> {
  const timestamp = new Date().toISOString();
  try {
    const searchUrl = `https://untappd.com/search?q=${encodeURIComponent(beerName)}`;
    console.log(`[${timestamp}] [Untappd] Searching: "${beerName}"`);
    console.log(`[${timestamp}] [Untappd] URL: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 5,
    });

    const $ = cheerio.load(response.data);

    // Untappd search results structure - look for beer items
    const firstResult = $('.beer-item').first();

    if (firstResult.length === 0) {
      console.log(`[${timestamp}] [Untappd] ✗ No results found for "${beerName}"`);
      return { success: false, error: 'No results found' };
    }

    // Beer name - in the .name element with an anchor
    const beerNameEl = firstResult.find('.name a').first();
    const extractedName = beerNameEl.text().trim() || beerName;

    // Extract the link to the beer detail page
    const beerPath = beerNameEl.attr('href');
    const beerDetailUrl = beerPath ? `https://untappd.com${beerPath}` : null;

    // Brewery name - in the .brewery element
    const breweryEl = firstResult.find('.brewery a').first();
    const brewery = breweryEl.text().trim() || 'Unknown';

    // Style - in the .style element
    const styleEl = firstResult.find('.style').first();
    const style = styleEl.text().trim() || 'Unknown';

    // ABV - look for .abv element first, then pattern in text
    let abv: number | null = null;
    const abvEl = firstResult.find('.abv').first();
    if (abvEl.length) {
      const abvText = abvEl.text().trim();
      const abvMatch = abvText.match(/(\d+\.?\d*)\s*%/i);
      if (abvMatch) {
        abv = parseFloat(abvMatch[1]);
      }
    } else {
      // Fallback to searching in full text
      const itemText = firstResult.text();
      const abvMatch = itemText.match(/(\d+\.?\d*)\s*%\s*ABV/i);
      if (abvMatch) {
        abv = parseFloat(abvMatch[1]);
      }
    }

    // Rating score - check multiple sources
    let rating_score: number | null = null;

    // 1. Try .caps[data-rating] attribute (most reliable)
    const capsEl = firstResult.find('.caps').first();
    const ratingDataAttr = capsEl.attr('data-rating');

    if (ratingDataAttr) {
      const parsed = parseFloat(ratingDataAttr);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 5) {
        rating_score = Math.round(parsed * 100) / 100; // Round to 2 decimals
      }
    }

    // 2. If not found, try .num element (contains "(4.228)")
    if (rating_score === null) {
      const numEl = firstResult.find('.num').first();
      const numText = numEl.text().trim();
      // Match pattern like "(4.228)" or "4.228"
      const ratingMatch = numText.match(/\(?(\d+[.,]\d+)\)?/);
      if (ratingMatch) {
        const parsed = parseFloat(ratingMatch[1].replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0 && parsed <= 5) {
          rating_score = Math.round(parsed * 100) / 100;
        }
      }
    }

    // 3. Try .rating .num as fallback
    if (rating_score === null) {
      const ratingNumEl = firstResult.find('.rating .num').first();
      const ratingNumText = ratingNumEl.text().trim();
      const ratingMatch = ratingNumText.match(/\(?(\d+[.,]\d+)\)?/);
      if (ratingMatch) {
        const parsed = parseFloat(ratingMatch[1].replace(',', '.'));
        if (!isNaN(parsed) && parsed > 0 && parsed <= 5) {
          rating_score = Math.round(parsed * 100) / 100;
        }
      }
    }

    // Rating count (check-ins/raters)
    let rating_count: number | null = null;
    const ratersEl = firstResult.find('.raters').first();
    if (ratersEl.length) {
      const ratersText = ratersEl.text().replace(/[,.\s]/g, '');
      const countMatch = ratersText.match(/(\d+)/);
      if (countMatch) {
        rating_count = parseInt(countMatch[1], 10);
      }
    }

    // Description - usually not available on search page
    const descEl = firstResult.find('.beer-description, .description').first();
    const description = descEl.text().trim() || null;

    // Log the extraction result
    console.log(`[${timestamp}] [Untappd] ✓ Found "${beerName}":`);
    console.log(`[${timestamp}] [Untappd]   Beer: ${extractedName}`);
    console.log(`[${timestamp}] [Untappd]   Brewery: ${brewery}`);
    console.log(`[${timestamp}] [Untappd]   Style: ${style}`);
    console.log(`[${timestamp}] [Untappd]   ABV: ${abv ?? 'N/A'}%`);
    console.log(`[${timestamp}] [Untappd]   Rating: ${rating_score ?? 'N/A'} (${rating_count ?? 0} ratings)`);

    // Validate we got at least some useful data
    if (brewery === 'Unknown' && style === 'Unknown' && rating_score === null) {
      console.log(`[${timestamp}] [Untappd] ✗ Insufficient data parsed for "${beerName}"`);
      return { success: false, error: 'Could not parse beer details' };
    }

    // Fetch detail page for IBU and check-ins
    let ibu: number | null = null;
    let check_ins: number | null = null;
    if (beerDetailUrl) {
      const detail = await scrapeUntappdBeerDetail(beerDetailUrl);
      ibu = detail.ibu;
      check_ins = detail.check_ins;
      // Use detail page ABV if we didn't get it from the search result
      if (abv === null && detail.abv !== null) {
        abv = detail.abv;
      }
    }

    return {
      success: true,
      data: {
        beer_name: extractedName,
        brewery,
        style,
        abv: abv && !isNaN(abv) ? abv : null,
        ibu,
        check_ins,
        rating_score,
        rating_count,
        description,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${timestamp}] [Untappd] ✗ Error scraping "${beerName}": ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Batch scrape multiple beers with concurrency control.
 * Returns results in the same order as input names.
 */
export async function scrapeUntappdBeers(
  beerNames: string[],
  concurrency: number = 3
): Promise<Map<string, UntappdBeerResult | null>> {
  const timestamp = new Date().toISOString();
  const results = new Map<string, UntappdBeerResult | null>();

  console.log(`[${timestamp}] [Untappd] Starting batch scrape: ${beerNames.length} beer(s), concurrency: ${concurrency}`);

  // Process in batches to avoid rate limiting
  for (let i = 0; i < beerNames.length; i += concurrency) {
    const batch = beerNames.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(beerNames.length / concurrency);

    console.log(`[${timestamp}] [Untappd] Processing batch ${batchNum}/${totalBatches} (${batch.length} beer(s))`);

    const batchResults = await Promise.all(
      batch.map(async (name) => {
        const result = await scrapeUntappdBeer(name);
        return { name, result };
      })
    );

    for (const { name, result } of batchResults) {
      results.set(name.toLowerCase(), result.success ? result.data! : null);
    }

    // Small delay between batches to be respectful
    if (i + concurrency < beerNames.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const foundCount = Array.from(results.values()).filter(r => r !== null).length;
  console.log(`[${timestamp}] [Untappd] Batch complete: ${foundCount}/${beerNames.length} beers found`);

  return results;
}
