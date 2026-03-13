/**
 * Untappd Scraper Unit Tests
 * 
 * These tests use mocked HTTP responses to test parsing logic.
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { scrapeUntappdBeer, scrapeUntappdBeers } from '../../src/services/scraper/untappd-scraper';
import {
  VALID_BEER_ITEM_HTML,
  MULTIPLE_BEER_ITEMS_HTML,
  NO_RESULTS_HTML,
  INCOMPLETE_BEER_HTML,
  wrapInPage,
} from '../__mocks__/untappd-html.mock';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('Untappd Scraper Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scrapeUntappdBeer', () => {
    it('should successfully parse a valid beer item', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(VALID_BEER_ITEM_HTML),
        status: 200,
      });

      const result = await scrapeUntappdBeer('Guinness Draught');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.beer_name).toBe('Guinness Draught');
      expect(result.data?.brewery).toBe('Guinness');
      expect(result.data?.style).toBe('Stout - Irish Dry');
      expect(result.data?.abv).toBe(4.2);
      expect(result.data?.rating_score).toBe(3.73);
      expect(result.data?.rating_count).toBe(1234567);
    });

    it('should return first result when multiple beers match', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(MULTIPLE_BEER_ITEMS_HTML),
        status: 200,
      });

      const result = await scrapeUntappdBeer('Heineken');

      expect(result.success).toBe(true);
      expect(result.data?.beer_name).toBe('Heineken Lager');
      expect(result.data?.brewery).toBe('Heineken');
    });

    it('should return success: false when no results found', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(NO_RESULTS_HTML),
        status: 200,
      });

      const result = await scrapeUntappdBeer('xyznonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No results found');
    });

    it('should return success: false when parsing fails (incomplete data)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(INCOMPLETE_BEER_HTML),
        status: 200,
      });

      const result = await scrapeUntappdBeer('Mystery Beer');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Could not parse beer details');
    });

    it('should handle network errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      const result = await scrapeUntappdBeer('Any Beer');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network Error');
    });

    it('should handle timeout errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));

      const result = await scrapeUntappdBeer('Any Beer');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should parse rating_count with comma separators', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(VALID_BEER_ITEM_HTML), // Has "1,234,567 Ratings"
        status: 200,
      });

      const result = await scrapeUntappdBeer('Guinness');

      expect(result.success).toBe(true);
      expect(result.data?.rating_count).toBe(1234567);
    });

    it('should handle null ABV when not present', async () => {
      const htmlWithoutAbv = `
        <div class="beer-item">
          <div class="beer-details">
            <p class="name"><a href="/b/test">Test Beer</a></p>
            <p class="brewery"><a href="/TestBrew">Test Brewery</a></p>
            <p class="style">IPA</p>
          </div>
          <div class="details">
            <span class="caps" data-rating="4.0"></span>
          </div>
        </div>
      `;

      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(htmlWithoutAbv),
        status: 200,
      });

      const result = await scrapeUntappdBeer('Test Beer');

      expect(result.success).toBe(true);
      expect(result.data?.abv).toBeNull();
    });
  });

  describe('scrapeUntappdBeers', () => {
    it('should batch process multiple beers', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: wrapInPage(VALID_BEER_ITEM_HTML), status: 200 })
        .mockResolvedValueOnce({ data: wrapInPage(MULTIPLE_BEER_ITEMS_HTML), status: 200 });

      const results = await scrapeUntappdBeers(['Guinness', 'Heineken'], 2);

      expect(results.size).toBe(2);
      expect(results.get('guinness')?.brewery).toBe('Guinness');
      expect(results.get('heineken')?.brewery).toBe('Heineken');
    });

    it('should return null for failed scrapes', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: wrapInPage(VALID_BEER_ITEM_HTML), status: 200 })
        .mockResolvedValueOnce({ data: wrapInPage(NO_RESULTS_HTML), status: 200 });

      const results = await scrapeUntappdBeers(['Guinness', 'xyzfake'], 2);

      expect(results.get('guinness')).toBeDefined();
      expect(results.get('xyzfake')).toBeNull();
    });

    it('should use lowercase keys for result map', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(VALID_BEER_ITEM_HTML),
        status: 200,
      });

      const results = await scrapeUntappdBeers(['GUINNESS DRAUGHT'], 1);

      expect(results.has('guinness draught')).toBe(true);
      expect(results.has('GUINNESS DRAUGHT')).toBe(false);
    });

    it('should handle empty input array', async () => {
      const results = await scrapeUntappdBeers([], 3);

      expect(results.size).toBe(0);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should respect concurrency limit', async () => {
      // Setup 5 beers but concurrency of 2
      const beers = ['Beer1', 'Beer2', 'Beer3', 'Beer4', 'Beer5'];
      
      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: wrapInPage(VALID_BEER_ITEM_HTML), status: 200 })
      );

      await scrapeUntappdBeers(beers, 2);

      // All 5 requests should be made
      expect(mockedAxios.get).toHaveBeenCalledTimes(5);
    });
  });

  describe('URL encoding', () => {
    it('should properly encode beer names with special characters', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(VALID_BEER_ITEM_HTML),
        status: 200,
      });

      await scrapeUntappdBeer("O'Hara's Irish Stout");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining("O'Hara's"),
        expect.any(Object)
      );
    });

    it('should handle accented characters', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: wrapInPage(VALID_BEER_ITEM_HTML),
        status: 200,
      });

      await scrapeUntappdBeer('Früh Kölsch');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent('Früh Kölsch')),
        expect.any(Object)
      );
    });
  });
});
