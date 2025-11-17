import { parseStringPromise, Builder } from 'xml2js';
import { XMLParser, XMLBuilder, XMLValidator } from 'fast-xml-parser';
import { logger } from '@/lib/logger';

/**
 * XML Module
 *
 * Parse, transform, and generate XML data
 * - Parse XML to JSON
 * - Convert JSON to XML
 * - Validate XML structure
 * - XPath-like queries
 * - Namespace support
 *
 * Perfect for:
 * - API integrations (SOAP, XML-RPC)
 * - Data transformation
 * - RSS/Atom feed processing
 * - Configuration file parsing
 */

export interface XmlParseOptions {
  ignoreAttributes?: boolean;
  attributeNamePrefix?: string;
  textNodeName?: string;
  parseAttributeValue?: boolean;
  trimValues?: boolean;
}

export interface XmlBuildOptions {
  format?: boolean;
  indentBy?: string;
  suppressEmpty?: boolean;
  attributeNamePrefix?: string;
  textNodeName?: string;
}

/**
 * Parse XML string to JSON object (fast-xml-parser)
 */
export function parseXml(
  xmlString: string,
  options: XmlParseOptions = {}
): Record<string, unknown> {
  logger.info({ xmlLength: xmlString.length, options }, 'Parsing XML to JSON');

  try {
    const parser = new XMLParser({
      ignoreAttributes: options.ignoreAttributes ?? false,
      attributeNamePrefix: options.attributeNamePrefix ?? '@_',
      textNodeName: options.textNodeName ?? '#text',
      parseAttributeValue: options.parseAttributeValue ?? false,
      trimValues: options.trimValues ?? true,
    });

    const result = parser.parse(xmlString) as Record<string, unknown>;

    logger.info({ resultKeys: Object.keys(result) }, 'XML parsed successfully');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to parse XML');
    throw new Error(
      `Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse XML string to JSON object (xml2js - more compatible)
 */
export async function parseXmlCompat(
  xmlString: string,
  options: {
    explicitArray?: boolean;
    mergeAttrs?: boolean;
    explicitRoot?: boolean;
  } = {}
): Promise<Record<string, unknown>> {
  logger.info({ xmlLength: xmlString.length }, 'Parsing XML with xml2js');

  try {
    const result = (await parseStringPromise(xmlString, {
      explicitArray: options.explicitArray ?? false,
      mergeAttrs: options.mergeAttrs ?? false,
      explicitRoot: options.explicitRoot ?? true,
    })) as Record<string, unknown>;

    logger.info({ resultKeys: Object.keys(result) }, 'XML parsed with xml2js');

    return result;
  } catch (error) {
    logger.error({ error }, 'Failed to parse XML with xml2js');
    throw new Error(
      `Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert JSON object to XML string
 */
export function buildXml(
  jsonObject: Record<string, unknown>,
  options: XmlBuildOptions = {}
): string {
  logger.info({ options }, 'Building XML from JSON');

  try {
    const builder = new XMLBuilder({
      format: options.format ?? true,
      indentBy: options.indentBy ?? '  ',
      suppressEmptyNode: options.suppressEmpty ?? false,
      attributeNamePrefix: options.attributeNamePrefix ?? '@_',
      textNodeName: options.textNodeName ?? '#text',
    });

    const xmlString = builder.build(jsonObject) as string;

    logger.info({ xmlLength: xmlString.length }, 'XML built successfully');

    return xmlString;
  } catch (error) {
    logger.error({ error }, 'Failed to build XML');
    throw new Error(
      `Failed to build XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert JSON object to XML string (xml2js)
 */
export function buildXmlCompat(
  jsonObject: Record<string, unknown>,
  options: {
    rootName?: string;
    renderOpts?: { pretty?: boolean; indent?: string };
  } = {}
): string {
  logger.info({ rootName: options.rootName }, 'Building XML with xml2js');

  try {
    const builder = new Builder({
      rootName: options.rootName ?? 'root',
      renderOpts: {
        pretty: options.renderOpts?.pretty ?? true,
        indent: options.renderOpts?.indent ?? '  ',
      },
    });

    const xmlString = builder.buildObject(jsonObject);

    logger.info({ xmlLength: xmlString.length }, 'XML built with xml2js');

    return xmlString;
  } catch (error) {
    logger.error({ error }, 'Failed to build XML with xml2js');
    throw new Error(
      `Failed to build XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Validate XML string
 */
export function validateXml(xmlString: string): {
  valid: boolean;
  error?: string;
} {
  logger.info({ xmlLength: xmlString.length }, 'Validating XML');

  try {
    const result = XMLValidator.validate(xmlString);

    if (result === true) {
      logger.info('XML is valid');
      return { valid: true };
    } else {
      logger.warn({ error: result }, 'XML validation failed');
      return {
        valid: false,
        error: typeof result === 'object' && 'err' in result
          ? String((result as { err: { msg: string } }).err.msg)
          : 'Unknown validation error',
      };
    }
  } catch (error) {
    logger.error({ error }, 'Failed to validate XML');
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Extract values by path (simple dot notation)
 */
export function extractValue(
  xmlObject: Record<string, unknown>,
  path: string
): unknown {
  logger.info({ path }, 'Extracting value from XML object');

  try {
    const parts = path.split('.');
    let current: unknown = xmlObject;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        logger.warn({ path, part }, 'Path not found in XML object');
        return undefined;
      }
    }

    logger.info({ path, found: current !== undefined }, 'Value extracted');

    return current;
  } catch (error) {
    logger.error({ error, path }, 'Failed to extract value');
    throw new Error(
      `Failed to extract value: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Parse XML from URL
 */
export async function parseXmlFromUrl(url: string): Promise<Record<string, unknown>> {
  logger.info({ url }, 'Parsing XML from URL');

  try {
    const response = await fetch(url);
    const xmlString = await response.text();

    const result = parseXml(xmlString);

    logger.info({ url }, 'XML from URL parsed successfully');

    return result;
  } catch (error) {
    logger.error({ error, url }, 'Failed to parse XML from URL');
    throw new Error(
      `Failed to parse XML from URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert XML to pretty-printed string
 */
export function prettifyXml(xmlString: string): string {
  logger.info({ xmlLength: xmlString.length }, 'Prettifying XML');

  try {
    // Parse and rebuild with formatting
    const parsed = parseXml(xmlString);
    const prettified = buildXml(parsed, { format: true, indentBy: '  ' });

    logger.info({ prettifiedLength: prettified.length }, 'XML prettified');

    return prettified;
  } catch (error) {
    logger.error({ error }, 'Failed to prettify XML');
    throw new Error(
      `Failed to prettify XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert XML to minified string
 */
export function minifyXml(xmlString: string): string {
  logger.info({ xmlLength: xmlString.length }, 'Minifying XML');

  try {
    // Remove whitespace between tags
    const minified = xmlString
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim();

    logger.info(
      {
        originalLength: xmlString.length,
        minifiedLength: minified.length,
        saved: xmlString.length - minified.length,
      },
      'XML minified'
    );

    return minified;
  } catch (error) {
    logger.error({ error }, 'Failed to minify XML');
    throw new Error(
      `Failed to minify XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Find all elements by tag name
 */
export function findByTagName(
  xmlObject: Record<string, unknown>,
  tagName: string
): unknown[] {
  logger.info({ tagName }, 'Finding elements by tag name');

  const results: unknown[] = [];

  function search(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;

    if (tagName in (obj as Record<string, unknown>)) {
      results.push((obj as Record<string, unknown>)[tagName]);
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      if (typeof value === 'object') {
        search(value);
      }
    }
  }

  search(xmlObject);

  logger.info({ tagName, resultCount: results.length }, 'Elements found');

  return results;
}

/**
 * Convert XML attributes to object properties
 */
export function flattenAttributes(xmlObject: Record<string, unknown>): Record<string, unknown> {
  logger.info('Flattening XML attributes');

  function flatten(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    const result: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;

    for (const [key, value] of Object.entries(objRecord)) {
      if (key.startsWith('@_')) {
        // Attribute - remove prefix
        result[key.substring(2)] = value;
      } else if (key === '#text') {
        // Text node
        return value;
      } else if (typeof value === 'object') {
        result[key] = flatten(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  const flattened = flatten(xmlObject) as Record<string, unknown>;

  logger.info('XML attributes flattened');

  return flattened;
}
