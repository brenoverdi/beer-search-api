/**
 * URL Scraper Service
 * 
 * Fetches web page content and extracts readable text for AI analysis.
 * Requires: npm install cheerio axios
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ScrapeResult {
  success: boolean;
  content: string;
  title: string;
  error?: string;
}

/**
 * Scrapes a URL and extracts text content suitable for AI analysis.
 * Removes scripts, styles, navigation, and other non-content elements.
 */
export async function scrapePageContent(url: string): Promise<ScrapeResult> {
  try {
    const response = await axios.get(url, {
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 5,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // Remove elements that don't contain useful content
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('header').remove();
    $('footer').remove();
    $('iframe').remove();
    $('noscript').remove();
    $('[role="navigation"]').remove();
    $('[role="banner"]').remove();
    $('[role="contentinfo"]').remove();
    $('.nav, .navbar, .menu, .sidebar, .footer, .header').remove();
    $('[class*="cookie"]').remove();
    $('[class*="popup"]').remove();
    $('[class*="modal"]').remove();
    $('[class*="advertisement"]').remove();
    $('[class*="social"]').remove();

    // Get page title
    const title = $('title').text().trim() || '';

    // Extract text content from the body
    // Focus on main content areas
    let content = '';
    
    // Try to find main content areas first
    const mainSelectors = ['main', 'article', '[role="main"]', '.content', '.main-content', '#content', '#main'];
    for (const selector of mainSelectors) {
      const mainContent = $(selector).text();
      if (mainContent && mainContent.trim().length > 200) {
        content = mainContent;
        break;
      }
    }

    // Fall back to body if no main content found
    if (!content) {
      content = $('body').text();
    }

    // Clean up the text
    content = content
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n\s*\n/g, '\n')      // Remove multiple newlines
      .trim();

    // Limit content size to avoid token limits (roughly 50KB)
    if (content.length > 50000) {
      content = content.substring(0, 50000) + '...';
    }

    if (content.length < 50) {
      return {
        success: false,
        content: '',
        title,
        error: 'Page appears to be empty or requires JavaScript to render',
      };
    }

    return {
      success: true,
      content,
      title,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 403) {
        return {
          success: false,
          content: '',
          title: '',
          error: 'This website blocks automated access (403 Forbidden)',
        };
      }
      if (status === 404) {
        return {
          success: false,
          content: '',
          title: '',
          error: 'Page not found (404)',
        };
      }
      if (error.code === 'ECONNABORTED') {
        return {
          success: false,
          content: '',
          title: '',
          error: 'Page took too long to load (timeout)',
        };
      }
    }
    
    return {
      success: false,
      content: '',
      title: '',
      error: `Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
