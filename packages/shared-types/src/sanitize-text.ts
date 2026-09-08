const PII_PATTERNS = [
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, placeholder: '[EMAIL]' },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, placeholder: '[IP]' },
  { pattern: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g, placeholder: '[IP]' },
  { pattern: /\b(\+?[\d\s\-().]{7,20})\b(?=\s|$)/g, placeholder: '[PHONE]' },
  { pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, placeholder: '[IBAN]' },
] as const;

const DEFAULT_TEXT_MAX_LENGTH = 128;
const MAX_RECURSION_DEPTH = 8;

export function sanitizeUntrustedText(value: string, maxLength = DEFAULT_TEXT_MAX_LENGTH): string {
  if (typeof value !== 'string') return '';

  let sanitized = value
    .replace(/\p{Cc}/gu, '')
    .replace(/\b(ignore|disregard|forget|override)\b.*?(instruction|prompt|above|system)/gi, '')
    .replace(/\s{3,}/g, '  ')
    .trim();

  for (const { pattern, placeholder } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, placeholder);
  }

  return sanitized.slice(0, maxLength);
}

export function sanitizeRenderedText(value: string, maxLength = DEFAULT_TEXT_MAX_LENGTH): string {
  if (typeof value !== 'string') return '';

  let sanitized = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s{4,}/g, '   ')
    .trim();

  for (const { pattern, placeholder } of PII_PATTERNS) {
    sanitized = sanitized.replace(pattern, placeholder);
  }

  return sanitized.slice(0, maxLength);
}

export function sanitizeObjectStrings<T>(value: T, maxLength = DEFAULT_TEXT_MAX_LENGTH): T {
  return sanitizeObjectStringsInternal(value, maxLength, 0);
}

function sanitizeObjectStringsInternal<T>(value: T, maxLength: number, depth: number): T {
  if (depth > MAX_RECURSION_DEPTH) return value;
  if (typeof value === 'string') {
    return sanitizeUntrustedText(value, maxLength) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeObjectStringsInternal(entry, maxLength, depth + 1)) as T;
  }
  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }

  const sanitizedEntries = Object.entries(value).map(([key, entry]) => [
    key,
    sanitizeObjectStringsInternal(entry, maxLength, depth + 1),
  ]);

  return Object.fromEntries(sanitizedEntries) as T;
}
