/**
 * URL Scraper Service
 * 
 * Fetches web page content and extracts readable text for AI analysis.
 * Supports both static HTML (axios + cheerio) and dynamic JavaScript content (Puppeteer).
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ScrapeResult {
  success: boolean;
  content: string;
  title: string;
  error?: string;
  method?: 'static' | 'dynamic';
}

/**
 * Scrapes a URL using Puppeteer (headless browser) for JavaScript-rendered content.
 * Waits for page to fully load including dynamic content.
 */
export async function scrapeDynamicContent(url: string): Promise<ScrapeResult> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [URLScraper] Using Puppeteer for dynamic content: ${url}`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    
    // Navigate and wait for network to be idle
    console.log(`[${timestamp}] [URLScraper] Loading page with Puppeteer...`);
    await page.goto(url, {
      waitUntil: 'networkidle2', // Wait until there are no more than 2 network connections for 500ms
      timeout: 30000,
    });

    // Wait for common e-commerce product containers to appear.
    // Some sites (e.g. ReadyShop/1001.it) trigger an AJAX load on page load that fires
    // slightly after networkidle2 settles — this waitForSelector catches them.
    console.log(`[${timestamp}] [URLScraper] Waiting for product containers...`);
    await page.waitForSelector(
      '.resultBox, .product-item, .product-card, .product-tile, [class*="product-list"] > *, [class*="item-product"], .rdy-search-results .resultBox, [class*="products-grid"] > *',
      { timeout: 10000 }
    ).catch(() => {}); // Non-product pages won't have these — silently ignore

    // Initial scroll to load content and reveal "Load More" buttons
    console.log(`[${timestamp}] [URLScraper] Initial scroll to reveal content...`);
    await page.evaluate(() => {
      // @ts-ignore - runs in browser context
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    // Wait for any scroll-triggered AJAX (e.g. infinite scroll, lazy product loading) to finish
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});

    // Try to click "Load More" buttons to load additional content
    console.log(`[${timestamp}] [URLScraper] Checking for "Load More" buttons...`);
    let loadMoreClicks = 0;
    const maxLoadMoreClicks = 10;

    while (loadMoreClicks < maxLoadMoreClicks) {
      const buttonInfo = await page.evaluate(() => {
        // Common "Load More" button patterns (multilingual)
        const buttonTexts = [
          // English
          'load more', 'show more', 'view more', 'see more', 'load all', 'show all',
          'more results', 'more items', 'more products',
          // Italian
          'mostra più', 'mostra di più', 'carica altro', 'vedi altro', 'carica di più',
          'visualizza altri', 'visualizza più', 'altri risultati', 'più risultati',
          // Portuguese
          'carregar mais', 'mostrar mais', 'ver mais', 'exibir mais', 'ver tudo',
          'mais resultados', 'mais produtos',
          // Spanish
          'ver más', 'cargar más', 'mostrar más', 'ver todo',
          'más resultados', 'más productos',
          // French
          'voir plus', 'charger plus', 'afficher plus', 'tout voir',
          'plus de résultats', 'plus de produits',
          // German
          'mehr laden', 'mehr anzeigen', 'alle anzeigen',
          'mehr ergebnisse', 'mehr produkte',
          // Dutch
          'meer laden', 'meer tonen', 'alles tonen',
          'meer resultaten', 'meer producten'
        ];

        // Debug: collect button texts for logging
        const allButtonTexts: string[] = [];
        const visualizzaButtons: string[] = [];

        // Try to find button by text content - expanded selector to catch divs, spans, etc.
        // @ts-ignore - runs in browser context
        const buttons = Array.from(document.querySelectorAll(
          'button, a, [role="button"], div[class*="button"], div[class*="btn"], span[class*="button"], span[class*="btn"], [onclick], [class*="load"], [class*="more"]'
        ));

        // Also search ALL clickable elements including divs/spans without specific classes
        // @ts-ignore - runs in browser context
        const allElements = Array.from(document.querySelectorAll('*'));
        const clickableElements = allElements.filter((el: any) => {
          const text = (el.textContent || '').toLowerCase();
          // Look for elements with "visualizza" or "risultati" in text
          if (text.includes('visualizza') || text.includes('risultati')) {
            // Only include leaf elements (not parent containers with many children)
            return el.children.length <= 2;
          }
          return false;
        });

        // Combine both arrays
        // @ts-ignore
        const allButtons = [...buttons, ...clickableElements];

        for (const button of allButtons) {
          // @ts-ignore - runs in browser context
          const rawText = button.textContent || '';
          // Normalize whitespace: collapse multiple spaces/newlines into single space
          const text = rawText.replace(/\s+/g, ' ').toLowerCase().trim();

          // Collect for debugging (first 100 buttons)
          if (allButtonTexts.length < 100) {
            allButtonTexts.push(text);
          }

          // Debug: collect elements with "visualizza" or "risultati"
          if (text.includes('visualizza') || text.includes('risultati')) {
            visualizzaButtons.push(text);
          }

          if (buttonTexts.some(btnText => text.includes(btnText))) {
            // Scroll into view first — offsetParent===null is NOT a reliable visibility check
            // (it's also null for position:fixed/sticky elements which are perfectly clickable)
            // @ts-ignore - runs in browser context
            button.scrollIntoView({ behavior: 'instant', block: 'center' });
            // @ts-ignore - runs in browser context
            const rect = button.getBoundingClientRect();
            const hasCoords = rect.width > 0 && rect.height > 0;
            return {
              found: true, text,
              x: hasCoords ? Math.round(rect.left + rect.width / 2) : 0,
              y: hasCoords ? Math.round(rect.top + rect.height / 2) : 0,
              useJsClick: !hasCoords,
              buttonTexts: allButtonTexts, visualizzaButtons,
            };
          }
        }

        // Try common class/id patterns
        const commonSelectors = [
          '.load-more', '.show-more', '.btn-more', '.load-all',
          '#load-more', '#show-more', '[class*="load-more"]', '[class*="show-more"]'
        ];

        for (const selector of commonSelectors) {
          // @ts-ignore - runs in browser context
          const element = document.querySelector(selector);
          if (!element) continue;
          // @ts-ignore - runs in browser context
          element.scrollIntoView({ behavior: 'instant', block: 'center' });
          // @ts-ignore - runs in browser context
          const rect = element.getBoundingClientRect();
          const hasCoords = rect.width > 0 && rect.height > 0;
          return {
            found: true, text: selector,
            x: hasCoords ? Math.round(rect.left + rect.width / 2) : 0,
            y: hasCoords ? Math.round(rect.top + rect.height / 2) : 0,
            useJsClick: !hasCoords,
            buttonTexts: allButtonTexts, visualizzaButtons,
          };
        }

        return { found: false, x: 0, y: 0, buttonTexts: allButtonTexts, visualizzaButtons };
      });

      // Debug: log button texts on first iteration
      if (loadMoreClicks === 0 && buttonInfo.buttonTexts && buttonInfo.buttonTexts.length > 0) {
        console.log(`[${timestamp}] [URLScraper] DEBUG - Found ${buttonInfo.buttonTexts.length} buttons with text:`);
        buttonInfo.buttonTexts.forEach((btnText, idx) => {
          console.log(`[${timestamp}] [URLScraper]   [${idx + 1}] "${btnText}"`);
        });

        // Log specific buttons with "visualizza" or "risultati"
        if (buttonInfo.visualizzaButtons && buttonInfo.visualizzaButtons.length > 0) {
          console.log(`[${timestamp}] [URLScraper] DEBUG - Elements with "visualizza" or "risultati" (${buttonInfo.visualizzaButtons.length} found):`);
          buttonInfo.visualizzaButtons.forEach((btnText, idx) => {
            console.log(`[${timestamp}] [URLScraper]   >>> [${idx + 1}] "${btnText}"`);
          });
        }
      }

      if (buttonInfo.found) {
        const jsClick = buttonInfo.useJsClick || (!buttonInfo.x && !buttonInfo.y);
        console.log(`[${timestamp}] [URLScraper] Found button: "${buttonInfo.text}" (${jsClick ? 'JS click' : `coords ${buttonInfo.x},${buttonInfo.y}`})`);

        await new Promise(resolve => setTimeout(resolve, 500));

        try {
          if (jsClick) {
            // element.click() bypasses all visibility/positioning constraints (works for fixed/sticky elements)
            await page.evaluate((btnText) => {
              // @ts-ignore - runs in browser context
              const allEls = Array.from(document.querySelectorAll('*'));
              // @ts-ignore - runs in browser context
              const el = allEls.find((e) => {
                const t = ((e as any).textContent || '').replace(/\s+/g, ' ').toLowerCase().trim();
                return t.includes(btnText) && (e as any).children.length <= 3;
              }) as any;
              if (el) el.click();
            }, buttonInfo.text as string);
          } else {
            await page.mouse.click(buttonInfo.x, buttonInfo.y);
          }
          loadMoreClicks++;
          console.log(`[${timestamp}] [URLScraper] Clicked "Load More" button (${loadMoreClicks}/${maxLoadMoreClicks})`);
          // Wait for new content to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          // Wait for network to be idle after loading
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
        } catch (e) {
          console.log(`[${timestamp}] [URLScraper] Button found but could not click it`);
          break;
        }
      } else {
        console.log(`[${timestamp}] [URLScraper] No more "Load More" buttons found`);
        break;
      }
    }

    // Scroll to bottom to trigger lazy-loaded content
    console.log(`[${timestamp}] [URLScraper] Scrolling to load lazy content...`);
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          // @ts-ignore - runs in browser context
          const scrollHeight = document.body.scrollHeight;
          // @ts-ignore - runs in browser context
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Wait for content to load after scrolling
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Helper: extract clean text from the current page DOM
    const extractCurrentPageContent = async (): Promise<string> =>
      page.evaluate(() => {
        const selectorsToRemove = [
          'script', 'style', 'iframe', 'noscript',
          '[class*="cookie"]', '[class*="popup"]', '[class*="modal"]',
          '[class*="advertisement"]', '[id*="ad-"]', '[class*="banner"]'
        ];
        selectorsToRemove.forEach(selector => {
          // @ts-ignore - runs in browser context
          document.querySelectorAll(selector).forEach((el: any) => el.remove());
        });
        // @ts-ignore - runs in browser context
        return document.body.textContent || '';
      });

    // Extract page 1 content
    let accumulatedContent = await extractCurrentPageContent();
    let previousPageFingerprint = accumulatedContent.substring(0, 500);

    // Pagination loop — follow next-page controls until exhausted (max 20 pages)
    const maxPaginationPages = 20;
    for (let pageNum = 2; pageNum <= maxPaginationPages; pageNum++) {
      const nextPageInfo = await page.evaluate(() => {
        // Most reliable: rel="next" or aria-label
        // @ts-ignore
        const relNext: HTMLAnchorElement | null = document.querySelector('a[rel="next"], [aria-label*="next" i], [aria-label*="próximo" i]');
        if (relNext) {
          const href = relNext.getAttribute('href');
          return { found: true, href, useJsClick: !href || href === '#' || href === '' };
        }

        // CSS class patterns
        const classPatterns = ['.pagination-next', '.next-page', '.pager-next', '.page-next'];
        for (const sel of classPatterns) {
          // @ts-ignore
          const el: HTMLAnchorElement | null = document.querySelector(sel);
          if (!el) continue;
          const href = el.getAttribute('href');
          if (href && href !== '#' && href !== '') return { found: true, href, useJsClick: false };
          return { found: true, href: null as string | null, useJsClick: true };
        }

        // [class*="next"] on anchor/button tags only (avoid broad false positives)
        // @ts-ignore
        const nextClassEls: HTMLAnchorElement[] = Array.from(document.querySelectorAll('a[class*="next"], button[class*="next"]'));
        for (const el of nextClassEls) {
          const href = el.getAttribute('href');
          if (href && href !== '#' && href !== '') return { found: true, href, useJsClick: false };
          return { found: true, href: null as string | null, useJsClick: true };
        }

        // Text-based search (exact match to avoid false positives)
        const nextTexts = ['next', 'próximo', 'siguiente', 'suivant', 'nächste', 'volgende', 'avanti', '›', '»'];
        // @ts-ignore
        const allLinks: Element[] = Array.from(document.querySelectorAll('a, button, [role="button"]'));
        for (const el of allLinks) {
          const text = ((el as any).textContent || '').replace(/\s+/g, ' ').toLowerCase().trim();
          if (nextTexts.some(t => text === t)) {
            const href = (el as any).getAttribute?.('href');
            if (href && href !== '#' && href !== '') return { found: true, href, useJsClick: false };
            return { found: true, href: null as string | null, useJsClick: true };
          }
        }

        return { found: false, href: null as string | null, useJsClick: false };
      });

      if (!nextPageInfo.found) {
        console.log(`[${timestamp}] [URLScraper] No more pagination — stopped at page ${pageNum - 1}`);
        break;
      }

      console.log(`[${timestamp}] [URLScraper] Navigating to page ${pageNum}...`);
      try {
        if (nextPageInfo.href && !nextPageInfo.useJsClick) {
          const nextUrl = new URL(nextPageInfo.href, url).href;
          await page.goto(nextUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } else {
          // JS click the next-page element
          await page.evaluate(() => {
            // @ts-ignore
            const relNext = document.querySelector('a[rel="next"], [aria-label*="next" i], [aria-label*="próximo" i]');
            if (relNext) { (relNext as any).click(); return; }
            // @ts-ignore
            const nextClassEl = document.querySelector('a[class*="next"], button[class*="next"]');
            if (nextClassEl) { (nextClassEl as any).click(); return; }
            const nextTexts = ['next', 'próximo', 'siguiente', 'suivant', 'nächste', 'volgende', 'avanti', '›', '»'];
            // @ts-ignore
            const allLinks: Element[] = Array.from(document.querySelectorAll('a, button, [role="button"]'));
            for (const el of allLinks) {
              const text = ((el as any).textContent || '').replace(/\s+/g, ' ').toLowerCase().trim();
              if (nextTexts.some(t => text === t)) { (el as any).click(); return; }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
          await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});
        }

        // Scroll to trigger lazy content on the new page
        await page.evaluate(() => {
          // @ts-ignore
          window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});

        // Extract this page's content and check for stuck loop
        const pageContent = await extractCurrentPageContent();
        const fingerprint = pageContent.substring(0, 500);
        if (fingerprint === previousPageFingerprint) {
          console.log(`[${timestamp}] [URLScraper] Page ${pageNum} identical to previous — stopping pagination`);
          break;
        }
        previousPageFingerprint = fingerprint;
        accumulatedContent += `\n--- PAGE ${pageNum} ---\n` + pageContent;
        console.log(`[${timestamp}] [URLScraper] ✓ Page ${pageNum} extracted (${pageContent.length} chars)`);
      } catch (e) {
        console.log(`[${timestamp}] [URLScraper] Pagination error on page ${pageNum}:`, e);
        break;
      }
    }

    // Get page title
    const title = await page.title();

    // Use accumulated multi-page content (page 1 + any paginated pages)
    const content = accumulatedContent;

    await browser.close();

    // Clean up the text
    const cleanedContent = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    // Limit content size (100KB to accommodate multiple pages)
    const limitedContent = cleanedContent.length > 100000
      ? cleanedContent.substring(0, 100000) + '...'
      : cleanedContent;

    console.log(`[${timestamp}] [URLScraper] ✓ Puppeteer extracted ${limitedContent.length} characters`);

    if (limitedContent.length < 50) {
      return {
        success: false,
        content: '',
        title,
        error: 'Page appears to be empty even after JavaScript rendering',
        method: 'dynamic',
      };
    }

    return {
      success: true,
      content: limitedContent,
      title,
      method: 'dynamic',
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    console.error(`[${timestamp}] [URLScraper] ✗ Puppeteer error:`, error);
    return {
      success: false,
      content: '',
      title: '',
      error: `Puppeteer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      method: 'dynamic',
    };
  }
}

/**
 * Scrapes a URL and extracts text content suitable for AI analysis.
 * Tries static scraping first (fast), falls back to Puppeteer for JavaScript-heavy sites.
 */
export async function scrapePageContent(url: string): Promise<ScrapeResult> {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [URLScraper] Starting scrape: ${url}`);
  
  try {
    // Try static scraping first (faster)
    console.log(`[${timestamp}] [URLScraper] Attempting static scrape with axios...`);
    const response = await axios.get(url, {
      timeout: 15000,
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

    // Check for indicators that this is a JavaScript-heavy site that needs Puppeteer
    const htmlLower = html.toLowerCase();
    
    // Check for e-commerce platforms and data attributes
    const hasEcommerceIndicators = 
      html.includes('data-product') ||
      html.includes('data-price') ||
      html.includes('product-item') ||
      htmlLower.includes('woocommerce') ||
      htmlLower.includes('prestashop') ||
      htmlLower.includes('shopify') ||
      htmlLower.includes('magento');
    
    // Check for empty product containers (structure exists but no content)
    const hasEmptyContainers = 
      ($('.product-list').length > 0 && $('.product-list').text().trim().length < 100) ||
      ($('.products').length > 0 && $('.products').text().trim().length < 100) ||
      ($('[class*="product"]').length > 5 && content.length < 800);
    
    const needsPuppeteer = 
      content.length < 1000 ||  // Increased threshold to catch boilerplate-heavy sites
      htmlLower.includes('react') ||
      htmlLower.includes('vue') ||
      htmlLower.includes('angular') ||
      htmlLower.includes('__next_data__') || // Next.js
      htmlLower.includes('__nuxt__') ||      // Nuxt.js
      html.includes('data-v-') ||            // Vue data binding
      html.includes('data-react') ||         // React data binding
      html.includes('ng-') ||                // Angular directives
      $('div[id="root"]').length > 0 ||     // Common React root
      $('div[id="app"]').length > 0 ||      // Common Vue/other framework root
      $('div[data-v-]').length > 0 ||        // Vue components
      $('[class*="loading"]').length > 0 ||  // Loading indicators
      $('noscript').text().toLowerCase().includes('javascript') ||
      hasEcommerceIndicators ||
      hasEmptyContainers;

    if (needsPuppeteer) {
      console.log(`[${timestamp}] [URLScraper] Detected JS-heavy site (content: ${content.length} chars), trying Puppeteer...`);
      return await scrapeDynamicContent(url);
    }

    console.log(`[${timestamp}] [URLScraper] ✓ Static scrape successful: ${content.length} characters`);

    return {
      success: true,
      content,
      title,
      method: 'static',
    };
  } catch (error) {
    console.log(`[${timestamp}] [URLScraper] Static scrape failed, trying Puppeteer as fallback...`);
    
    // If static scraping fails, try Puppeteer
    const puppeteerResult = await scrapeDynamicContent(url);
    
    // If Puppeteer also fails, return detailed error
    if (!puppeteerResult.success) {
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
    
    return puppeteerResult;
  }
}
