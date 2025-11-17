/**
 * Analyzes workflow outputs and determines optimal display type
 * Similar to analyze-credentials.ts pattern
 */

export type OutputDisplayType =
  | 'json'
  | 'table'
  | 'image'
  | 'images'
  | 'text'
  | 'markdown'
  | 'chart'
  | 'list';

export interface OutputDisplayConfig {
  type: OutputDisplayType;
  config?: {
    // Table configuration
    columns?: Array<{
      key: string;
      label: string;
      type?: 'text' | 'link' | 'date' | 'number' | 'boolean';
    }>;
    // Image configuration
    urlKey?: string;
    altKey?: string;
    // Chart configuration
    chartType?: 'line' | 'bar' | 'pie';
    xKey?: string;
    yKey?: string;
  };
}

/**
 * Detects output display type based on module path and output structure
 */
export function detectOutputDisplay(
  modulePath: string,
  output: unknown
): OutputDisplayConfig {
  // Module-based detection first (most reliable)
  const moduleDisplay = detectFromModulePath(modulePath);
  if (moduleDisplay) return moduleDisplay;

  // Data structure-based detection
  return detectFromStructure(output);
}

/**
 * Detects display type from module path
 */
function detectFromModulePath(modulePath: string): OutputDisplayConfig | null {
  // Image generation modules
  if (
    modulePath.includes('image.generate') ||
    modulePath.includes('dalle') ||
    modulePath.includes('stability')
  ) {
    return {
      type: 'image',
      config: { urlKey: 'url' },
    };
  }

  // Social media modules - auto-detect columns from actual data
  if (
    modulePath.startsWith('social.twitter.search') ||
    modulePath.startsWith('social.reddit.search') ||
    modulePath.startsWith('social.youtube.search') ||
    modulePath.startsWith('social.github.search')
  ) {
    return {
      type: 'table',
      // No hardcoded columns - will auto-detect from actual data
    };
  }

  // AI text generation
  if (
    modulePath.includes('openai.generate') ||
    modulePath.includes('anthropic.generate') ||
    modulePath.includes('ai.')
  ) {
    return {
      type: 'markdown',
    };
  }

  // Database queries
  if (
    modulePath.includes('mongodb.find') ||
    modulePath.includes('postgresql.query') ||
    modulePath.includes('mysql.query')
  ) {
    return {
      type: 'table',
    };
  }

  // RSS/Feed modules - let auto-detection handle columns
  if (modulePath.includes('rss.parse')) {
    return {
      type: 'table',
      // No hardcoded columns - will auto-detect from actual data
    };
  }

  return null;
}

/**
 * Detects display type from output structure
 */
function detectFromStructure(output: unknown): OutputDisplayConfig {
  // Array of objects -> Table
  if (Array.isArray(output) && output.length > 0) {
    const firstItem = output[0];

    if (typeof firstItem === 'object' && firstItem !== null) {
      // Check if it looks like image URLs
      if (hasImageUrls(firstItem as Record<string, unknown>)) {
        return { type: 'images' };
      }

      // Auto-generate table columns from object keys
      return {
        type: 'table',
        config: {
          columns: inferColumnsFromObject(firstItem as Record<string, unknown>),
        },
      };
    }

    // Array of strings/numbers -> List
    return { type: 'list' };
  }

  // Single object
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const outputObj = output as Record<string, unknown>;

    // Check for nested arrays (common patterns: items, data, results, entries)
    const arrayKeys = ['items', 'data', 'results', 'entries', 'records', 'rows'];
    for (const key of arrayKeys) {
      const value = outputObj[key];
      if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          // Found nested array of objects - use it for table
          return {
            type: 'table',
            config: {
              columns: inferColumnsFromObject(firstItem as Record<string, unknown>),
            },
          };
        }
      }
    }

    // Check if it's an image response
    if (hasImageUrls(outputObj)) {
      return { type: 'image', config: { urlKey: 'url' } };
    }

    // Single object -> Table (vertical key-value pairs)
    return {
      type: 'table',
      config: {
        columns: inferColumnsFromObject(outputObj),
      },
    };
  }

  // String checks
  if (typeof output === 'string') {
    // URL pointing to an image
    if (isImageUrl(output)) {
      return { type: 'image' };
    }

    // Long text with markdown
    if (output.length > 200 && hasMarkdownSyntax(output)) {
      return { type: 'markdown' };
    }

    // Plain text
    if (output.length > 50) {
      return { type: 'text' };
    }
  }

  // Default fallback
  return { type: 'json' };
}

/**
 * Infers table columns from object keys
 */
function inferColumnsFromObject(obj: Record<string, unknown>): Array<{
  key: string;
  label: string;
  type: 'text' | 'link' | 'date' | 'number' | 'boolean';
}> {
  return Object.keys(obj).slice(0, 8).map((key) => {
    const value = obj[key];
    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());

    // Infer type from value
    let type: 'text' | 'link' | 'date' | 'number' | 'boolean' = 'text';

    if (typeof value === 'number') {
      type = 'number';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
    } else if (typeof value === 'string') {
      if (isUrl(value)) {
        type = 'link';
      } else if (isDateString(value)) {
        type = 'date';
      }
    }

    return { key, label, type };
  });
}

/**
 * Checks if object contains image URLs
 */
function hasImageUrls(obj: Record<string, unknown>): boolean {
  const urlKeys = ['url', 'imageUrl', 'image', 'src', 'thumbnail'];
  return urlKeys.some((key) => {
    const value = obj[key];
    return typeof value === 'string' && isImageUrl(value);
  });
}

/**
 * Checks if string is an image URL
 */
function isImageUrl(str: string): boolean {
  if (typeof str !== 'string') return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  const lowerStr = str.toLowerCase();
  return (
    (str.startsWith('http://') || str.startsWith('https://')) &&
    imageExtensions.some((ext) => lowerStr.includes(ext))
  );
}

/**
 * Checks if string is a URL
 */
function isUrl(str: string): boolean {
  if (typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

/**
 * Checks if string looks like a date
 */
function isDateString(str: string): boolean {
  if (typeof str !== 'string') return false;
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.length > 8;
}

/**
 * Checks if string contains markdown syntax
 */
function hasMarkdownSyntax(str: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s/m, // Headers
    /\*\*[\s\S]*?\*\*/, // Bold
    /\*[\s\S]*?\*/, // Italic
    /\[.*?\]\(.*?\)/, // Links
    /```[\s\S]*?```/, // Code blocks
    /`.*?`/, // Inline code
    /^[-*+]\s/m, // Lists
  ];
  return markdownPatterns.some((pattern) => pattern.test(str));
}

/**
 * Gets a display label for the output type (for badges)
 */
export function getOutputTypeLabel(type: OutputDisplayType): string {
  switch (type) {
    case 'table':
      return 'Table';
    case 'image':
      return 'Image';
    case 'images':
      return 'Images';
    case 'markdown':
      return 'Text';
    case 'text':
      return 'Text';
    case 'chart':
      return 'Chart';
    case 'list':
      return 'List';
    case 'json':
    default:
      return 'Data';
  }
}

/**
 * Gets an icon name for the output type (lucide-react)
 */
export function getOutputTypeIcon(type: OutputDisplayType): string {
  switch (type) {
    case 'table':
      return 'Table2';
    case 'image':
    case 'images':
      return 'Image';
    case 'markdown':
    case 'text':
      return 'FileText';
    case 'chart':
      return 'BarChart3';
    case 'list':
      return 'List';
    case 'json':
    default:
      return 'Braces';
  }
}
