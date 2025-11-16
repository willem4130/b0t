import { chromium, Browser, Page } from 'playwright';
import { logger } from '@/lib/logger';
import * as cheerio from 'cheerio';

/**
 * Browser Automation Module
 *
 * Scrape JavaScript-rendered websites using headless browser
 * - Fetch fully-rendered HTML (after JavaScript execution)
 * - Take screenshots
 * - Handle dynamic content
 * - Wait for elements to load
 *
 * Perfect for:
 * - Modern SPAs and JavaScript-heavy sites
 * - Sites that load content dynamically
 * - Complex interactions and form submissions
 */

let browserInstance: Browser | null = null;

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
    });
  }
  return browserInstance;
}

/**
 * Fetch HTML from a JavaScript-rendered website
 * Returns Cheerio API for parsing
 */
export async function fetchRenderedHtml(url: string, options?: {
  waitForSelector?: string;
  waitTime?: number;
}): Promise<cheerio.CheerioAPI> {
  logger.info({ url, options }, 'Fetching rendered HTML from URL');

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Navigate to URL
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for specific selector if provided
    if (options?.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 30000 });
    }

    // Additional wait time if specified
    if (options?.waitTime) {
      await page.waitForTimeout(options.waitTime);
    }

    // Get the fully rendered HTML
    const html = await page.content();

    // Close the page
    await page.close();

    // Load into Cheerio
    const $ = cheerio.load(html);

    logger.info({ url, htmlLength: html.length }, 'Rendered HTML fetched successfully');

    return $;
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }

    logger.error({ error, url }, 'Failed to fetch rendered HTML');
    throw new Error(
      `Failed to fetch rendered HTML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Take a screenshot of a webpage
 */
export async function takeScreenshot(url: string, options?: {
  fullPage?: boolean;
  waitForSelector?: string;
}): Promise<Buffer> {
  logger.info({ url, options }, 'Taking screenshot');

  let page: Page | null = null;

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle' });

    if (options?.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 30000 });
    }

    const screenshot = await page.screenshot({
      fullPage: options?.fullPage ?? false,
    });

    await page.close();

    logger.info({ url, size: screenshot.length }, 'Screenshot captured');

    return screenshot;
  } catch (error) {
    if (page) {
      await page.close().catch(() => {});
    }

    logger.error({ error, url }, 'Failed to take screenshot');
    throw new Error(
      `Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Close browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
    logger.info('Browser closed');
  }
}

// Clean up on process exit
process.on('beforeExit', () => {
  closeBrowser().catch(() => {});
});
