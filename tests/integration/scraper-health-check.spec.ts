/**
 * Scraper Health Check Tests
 * 
 * These tests verify that the Untappd HTML structure hasn't changed.
 * If these fail, the scraper selectors need to be updated.
 * 
 * Run with: npm run test:health
 */

import { describe, it, expect } from 'vitest';
import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('Scraper Health Check', () => {
  describe('health check - Untappd HTML Structure', () => {
    it('should find beer-item elements on search page', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Guinness';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      
      // Check for beer-item elements
      const beerItems = $('.beer-item');
      expect(beerItems.length).toBeGreaterThan(0);
      
      console.log(`Found ${beerItems.length} .beer-item elements`);
    });

    it('should find beer name element structure', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Guinness%20Draught';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      const firstItem = $('.beer-item').first();
      
      // Check for name element
      const nameEl = firstItem.find('.name a');
      expect(nameEl.length).toBeGreaterThan(0);
      
      const beerName = nameEl.text().trim();
      expect(beerName.length).toBeGreaterThan(0);
      
      console.log(`Found beer name: "${beerName}"`);
    });

    it('should find brewery element structure', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Guinness%20Draught';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      const firstItem = $('.beer-item').first();
      
      // Check for brewery element
      const breweryEl = firstItem.find('.brewery a');
      expect(breweryEl.length).toBeGreaterThan(0);
      
      const brewery = breweryEl.text().trim();
      expect(brewery.length).toBeGreaterThan(0);
      
      console.log(`Found brewery: "${brewery}"`);
    });

    it('should find style element structure', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Guinness%20Draught';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      const firstItem = $('.beer-item').first();
      
      // Check for style element
      const styleEl = firstItem.find('.style');
      expect(styleEl.length).toBeGreaterThan(0);
      
      const style = styleEl.text().trim();
      expect(style.length).toBeGreaterThan(0);
      
      console.log(`Found style: "${style}"`);
    });

    it('should find rating element structure', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Guinness%20Draught';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      const firstItem = $('.beer-item').first();
      
      // Check for rating - could be in .caps data-rating or .num element
      const capsEl = firstItem.find('.caps');
      const numEl = firstItem.find('.num');
      const hasRating = capsEl.attr('data-rating') || numEl.text().match(/\d+\.?\d*/);
      
      expect(hasRating).toBeTruthy();
      
      console.log(`Found rating structure: caps[data-rating]=${capsEl.attr('data-rating')}, .num=${numEl.text()}`);
    });

    it('should output full HTML structure for debugging', { timeout: 20000 }, async () => {
      const searchUrl = 'https://untappd.com/search?q=Pliny%20The%20Elder';
      
      const response = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      const $ = cheerio.load(response.data);
      const firstItem = $('.beer-item').first();
      
      if (firstItem.length > 0) {
        const html = firstItem.html();
        console.log('\n=== First beer-item HTML structure ===\n');
        console.log(html?.slice(0, 2000));
        console.log('\n=== End of HTML structure ===\n');
      }
      
      expect(firstItem.length).toBeGreaterThan(0);
    });
  });
});
