import * as cheerio from 'cheerio';
import { httpGet } from './http';
import { logger } from '@/lib/logger';

/**
 * Web Scraping Module
 *
 * Extract data from websites
 * - HTML parsing with Cheerio
 * - CSS selector queries
 * - Extract text, links, images
 * - Table parsing
 * - Meta tag extraction
 *
 * Perfect for:
 * - Data collection
 * - Content aggregation
 * - Price monitoring
 * - SEO analysis
 */

export interface ScrapedLink {
  text: string;
  href: string;
  absolute: string;
}

export interface ScrapedImage {
  src: string;
  alt?: string;
  title?: string;
  absolute: string;
}

export interface ScrapedMetaTags {
  title?: string;
  description?: string;
  keywords?: string;
  author?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * Fetch raw HTML string from URL
 */
export async function fetchRawHtml(url: string): Promise<string> {
  logger.info({ url }, 'Fetching raw HTML from URL');

  try {
    const response = await httpGet(url);
    const html = typeof response.data === 'string' ? response.data : String(response.data);

    logger.info({ url, htmlLength: html.length }, 'Raw HTML fetched successfully');

    return html;
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch raw HTML');
    throw new Error(
      `Failed to fetch raw HTML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Fetch and parse HTML from URL
 */
export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  logger.info({ url }, 'Fetching HTML from URL');

  try {
    const response = await httpGet(url);
    const html = typeof response.data === 'string' ? response.data : String(response.data);
    const $ = cheerio.load(html);

    logger.info({ url }, 'HTML fetched and parsed successfully');

    return $;
  } catch (error) {
    logger.error({ error, url }, 'Failed to fetch HTML');
    throw new Error(
      `Failed to fetch HTML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse HTML string
 */
export function parseHtml(html: string): cheerio.CheerioAPI {
  logger.info({ htmlLength: html.length }, 'Parsing HTML string');

  try {
    const $ = cheerio.load(html);

    logger.info('HTML parsed successfully');

    return $;
  } catch (error) {
    logger.error({ error }, 'Failed to parse HTML');
    throw new Error(
      `Failed to parse HTML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract text content using CSS selector
 */
export function extractText($: cheerio.CheerioAPI, selector: string): string[] {
  logger.info({ selector }, 'Extracting text with selector');

  try {
    const texts: string[] = [];

    $(selector).each((_, element) => {
      const text = $(element).text().trim();
      if (text) {
        texts.push(text);
      }
    });

    logger.info({ selector, resultCount: texts.length }, 'Text extracted');

    return texts;
  } catch (error) {
    logger.error({ error, selector }, 'Failed to extract text');
    throw new Error(
      `Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract links from page
 */
export function extractLinks(
  $: cheerio.CheerioAPI,
  baseUrl?: string,
  selector: string = 'a'
): ScrapedLink[] {
  logger.info({ selector, baseUrl }, 'Extracting links');

  try {
    const links: ScrapedLink[] = [];

    $(selector).each((_, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      const text = $el.text().trim();

      if (href) {
        let absolute = href;
        if (baseUrl && !href.startsWith('http')) {
          try {
            absolute = new URL(href, baseUrl).href;
          } catch {
            absolute = href;
          }
        }

        links.push({
          text,
          href,
          absolute,
        });
      }
    });

    logger.info({ linkCount: links.length }, 'Links extracted');

    return links;
  } catch (error) {
    logger.error({ error }, 'Failed to extract links');
    throw new Error(
      `Failed to extract links: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract images from page
 */
export function extractImages(
  $: cheerio.CheerioAPI,
  baseUrl?: string,
  selector: string = 'img'
): ScrapedImage[] {
  logger.info({ selector, baseUrl }, 'Extracting images');

  try {
    const images: ScrapedImage[] = [];

    $(selector).each((_, element) => {
      const $el = $(element);
      const src = $el.attr('src');
      const alt = $el.attr('alt');
      const title = $el.attr('title');

      if (src) {
        let absolute = src;
        if (baseUrl && !src.startsWith('http')) {
          try {
            absolute = new URL(src, baseUrl).href;
          } catch {
            absolute = src;
          }
        }

        images.push({
          src,
          alt,
          title,
          absolute,
        });
      }
    });

    logger.info({ imageCount: images.length }, 'Images extracted');

    return images;
  } catch (error) {
    logger.error({ error }, 'Failed to extract images');
    throw new Error(
      `Failed to extract images: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract meta tags
 */
export function extractMetaTags($: cheerio.CheerioAPI): ScrapedMetaTags {
  logger.info('Extracting meta tags');

  try {
    const meta: ScrapedMetaTags = {
      title: $('title').text() || undefined,
      description: $('meta[name="description"]').attr('content'),
      keywords: $('meta[name="keywords"]').attr('content'),
      author: $('meta[name="author"]').attr('content'),
      ogTitle: $('meta[property="og:title"]').attr('content'),
      ogDescription: $('meta[property="og:description"]').attr('content'),
      ogImage: $('meta[property="og:image"]').attr('content'),
      ogUrl: $('meta[property="og:url"]').attr('content'),
      twitterCard: $('meta[name="twitter:card"]').attr('content'),
      twitterTitle: $('meta[name="twitter:title"]').attr('content'),
      twitterDescription: $('meta[name="twitter:description"]').attr('content'),
      twitterImage: $('meta[name="twitter:image"]').attr('content'),
    };

    logger.info({ meta }, 'Meta tags extracted');

    return meta;
  } catch (error) {
    logger.error({ error }, 'Failed to extract meta tags');
    throw new Error(
      `Failed to extract meta tags: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract table data
 */
export function extractTable(
  $: cheerio.CheerioAPI,
  selector: string
): Array<Record<string, string>> {
  logger.info({ selector }, 'Extracting table data');

  try {
    const rows: Array<Record<string, string>> = [];
    const $table = $(selector).first();

    if ($table.length === 0) {
      logger.warn({ selector }, 'Table not found');
      return rows;
    }

    // Get headers
    const headers: string[] = [];
    $table.find('thead th, thead td').each((_, element) => {
      headers.push($(element).text().trim());
    });

    // If no headers in thead, try first row
    if (headers.length === 0) {
      $table.find('tr').first().find('th, td').each((_, element) => {
        headers.push($(element).text().trim());
      });
    }

    // Get data rows
    $table.find('tbody tr, tr').each((i, row) => {
      if (i === 0 && headers.length > 0) return; // Skip header row

      const rowData: Record<string, string> = {};
      $(row).find('td, th').each((j, cell) => {
        const header = headers[j] || `column${j}`;
        rowData[header] = $(cell).text().trim();
      });

      if (Object.keys(rowData).length > 0) {
        rows.push(rowData);
      }
    });

    logger.info({ rowCount: rows.length }, 'Table data extracted');

    return rows;
  } catch (error) {
    logger.error({ error, selector }, 'Failed to extract table');
    throw new Error(
      `Failed to extract table: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract attribute values
 */
export function extractAttributes(
  $: cheerio.CheerioAPI,
  selector: string,
  attribute: string
): string[] {
  logger.info({ selector, attribute }, 'Extracting attributes');

  try {
    const values: string[] = [];

    $(selector).each((_, element) => {
      const value = $(element).attr(attribute);
      if (value) {
        values.push(value);
      }
    });

    logger.info({ resultCount: values.length }, 'Attributes extracted');

    return values;
  } catch (error) {
    logger.error({ error, selector, attribute }, 'Failed to extract attributes');
    throw new Error(
      `Failed to extract attributes: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if element exists
 */
export function elementExists($: cheerio.CheerioAPI, selector: string): boolean {
  return $(selector).length > 0;
}

/**
 * Count elements
 */
export function countElements($: cheerio.CheerioAPI, selector: string): number {
  return $(selector).length;
}

/**
 * Extract structured data (JSON-LD)
 */
export function extractStructuredData($: cheerio.CheerioAPI): Array<Record<string, unknown>> {
  logger.info('Extracting structured data');

  try {
    const data: Array<Record<string, unknown>> = [];

    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const json = JSON.parse($(element).html() || '{}');
        data.push(json as Record<string, unknown>);
      } catch {
        // Ignore malformed JSON
      }
    });

    logger.info({ dataCount: data.length }, 'Structured data extracted');

    return data;
  } catch (error) {
    logger.error({ error }, 'Failed to extract structured data');
    throw new Error(
      `Failed to extract structured data: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
