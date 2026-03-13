/**
 * Untappd Scraper Integration Tests
 * 
 * These tests make REAL HTTP requests to Untappd to verify the scraper works.
 * Run with: npm run test:integration
 */

import { describe, it, expect } from 'vitest';
import { scrapeUntappdBeer, scrapeUntappdBeers } from '../../src/services/scraper/untappd-scraper';

// Well-known beers that should always be found on Untappd
const KNOWN_BEERS = [
  {
    name: 'Guinness Draught',
    expectedBrewery: 'Guinness',
    expectedStyle: 'Stout',
    minRating: 3.0,
    maxRating: 5.0,
  },
  {
    name: 'Heineken',
    expectedBrewery: 'Heineken',
    expectedStyle: 'Lager',
    minRating: 2.0,
    maxRating: 4.0,
  },
  {
    name: 'Sierra Nevada Pale Ale',
    expectedBrewery: 'Sierra Nevada',
    expectedStyle: 'Pale Ale',
    minRating: 3.0,
    maxRating: 5.0,
  },
];

describe('Untappd Scraper Integration Tests', () => {
  describe('scrapeUntappdBeer - Single Beer Scraping', () => {
    for (const beer of KNOWN_BEERS) {
      it(`should find "${beer.name}" on Untappd with correct details`, { timeout: 15000 }, async () => {
        const result = await scrapeUntappdBeer(beer.name);
        
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        
        if (result.data) {
          // Brewery should contain expected brewery (primary verification)
          expect(result.data.brewery.toLowerCase()).toContain(beer.expectedBrewery.toLowerCase());
          
          // Style should contain expected style
          expect(result.data.style.toLowerCase()).toContain(beer.expectedStyle.toLowerCase());
          
          // Rating should be within expected range
          if (result.data.rating_score !== null) {
            expect(result.data.rating_score).toBeGreaterThanOrEqual(beer.minRating);
            expect(result.data.rating_score).toBeLessThanOrEqual(beer.maxRating);
          }
        }
      });
    }

    it('should return success: false for a non-existent beer', { timeout: 15000 }, async () => {
      const result = await scrapeUntappdBeer('xyznonexistentbeer12345abc');
      
      // Either no results found or parsing failed
      expect(result.success).toBe(false);
    });

    it('should extract ABV when available', { timeout: 15000 }, async () => {
      const result = await scrapeUntappdBeer('Pliny the Elder');
      
      expect(result.success).toBe(true);
      if (result.data && result.data.abv !== null) {
        // Pliny the Elder is 8% ABV
        expect(result.data.abv).toBeGreaterThanOrEqual(7);
        expect(result.data.abv).toBeLessThanOrEqual(9);
      }
    });

    it('should extract rating count when available', { timeout: 15000 }, async () => {
      const result = await scrapeUntappdBeer('Budweiser');
      
      expect(result.success).toBe(true);
      if (result.data) {
        // Popular beer should have many ratings
        if (result.data.rating_count !== null) {
          expect(result.data.rating_count).toBeGreaterThan(1000);
        }
      }
    });
  });

  describe('scrapeUntappdBeers - Batch Scraping', () => {
    it('should scrape multiple beers concurrently', { timeout: 30000 }, async () => {
      const beerNames = ['Guinness Draught', 'Heineken', 'Corona Extra'];
      const results = await scrapeUntappdBeers(beerNames, 3);
      
      expect(results.size).toBe(3);
      
      // At least 2 out of 3 should be found (accounting for occasional failures)
      let foundCount = 0;
      for (const [, data] of results) {
        if (data && data.brewery !== 'Unknown') foundCount++;
      }
      expect(foundCount).toBeGreaterThanOrEqual(2);
    });

    it('should return results keyed by lowercase beer name', { timeout: 15000 }, async () => {
      const beerNames = ['GUINNESS Draught'];
      const results = await scrapeUntappdBeers(beerNames, 1);
      
      // Key should be lowercase
      expect(results.has('guinness draught')).toBe(true);
    });

    it('should handle mixed found/not-found beers', { timeout: 20000 }, async () => {
      const beerNames = ['Heineken', 'xyzfakebeer12345'];
      const results = await scrapeUntappdBeers(beerNames, 2);
      
      // Heineken should be found
      const heineken = results.get('heineken');
      expect(heineken).toBeDefined();
      expect(heineken?.brewery.toLowerCase()).toContain('heineken');
      
      // Fake beer should be null
      const fake = results.get('xyzfakebeer12345');
      expect(fake).toBeNull();
    });
  });
});
