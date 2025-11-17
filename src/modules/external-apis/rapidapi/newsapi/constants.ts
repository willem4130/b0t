/**
 * Static constants for News API options
 * These are based on the API responses and used for UI dropdowns
 */

export const NEWS_TOPICS = [
  { id: 'business', name: 'Business', subtopics: ['cryptocurrency', 'economy', 'finance', 'forex', 'markets', 'property', 'startup'] },
  { id: 'entertainment', name: 'Entertainment', subtopics: ['arts', 'books', 'celebrities', 'gaming', 'movies', 'music', 'tv'] },
  { id: 'general', name: 'General', subtopics: [] },
  { id: 'health', name: 'Health', subtopics: ['disease', 'fitness', 'medication', 'publichealth'] },
  { id: 'lifestyle', name: 'Lifestyle', subtopics: ['autos', 'beauty', 'cooking', 'fashion', 'religion', 'tourism', 'transportation', 'travel'] },
  { id: 'politics', name: 'Politics', subtopics: ['government', 'humanrights', 'infrastructure', 'policy'] },
  { id: 'science', name: 'Science', subtopics: ['climate', 'education', 'energy', 'environment', 'genetics', 'geology', 'physics', 'space', 'wildlife'] },
  { id: 'sports', name: 'Sports', subtopics: ['baseball', 'basketball', 'boxing', 'cricket', 'esports', 'f1', 'football', 'golf', 'hockey', 'nascar', 'rugby', 'soccer', 'tennis', 'volleyball'] },
  { id: 'technology', name: 'Technology', subtopics: ['ai', 'computing', 'cybersec', 'gadgets', 'internet', 'mobile', 'robot', 'vr'] },
  { id: 'world', name: 'World', subtopics: ['culture', 'history'] },
] as const;

export const NEWS_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' },
] as const;

export const NEWS_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'IN', name: 'India' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'RU', name: 'Russia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
] as const;
