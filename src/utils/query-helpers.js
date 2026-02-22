// @ts-check

const primitiveTypes = new Set(['string', 'number', 'boolean']);

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function normalizeValue(value) {
  if (Array.isArray(value)) {
    const normalized = /** @type {unknown[]} */ (value).map((item) => normalizeValue(item));
    if (normalized.every((item) => primitiveTypes.has(typeof item))) {
      return [...normalized].sort((a, b) => {
        if (typeof a === 'string' && typeof b === 'string') {
          return a.localeCompare(b);
        }
        return Number(a) - Number(b);
      });
    }
    return normalized;
  }

  if (value && typeof value === 'object') {
    const entries = /** @type {[string, unknown][]} */ (
      Object.entries(/** @type {Record<string, unknown>} */ (value))
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => [key, normalizeValue(val)]);

    return entries.reduce((acc, [key, val]) => {
      acc[/** @type {string} */ (key)] = val;
      return acc;
    }, /** @type {Record<string, unknown>} */ ({}));
  }

  return value;
}

/**
 * Serialize filter objects in a stable manner for react-query keys.
 * @param {Record<string, any>} filters
 * @returns {string}
 */
export function serializeFilters(filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return '';
  }

  return JSON.stringify(normalizeValue(filters));
}

/**
 * Build a consistent react-query key for data fetching hooks.
 * @param {string[]} baseKey
 * @param {{ page?: number; pageSize?: number; filters?: Record<string, any>; organizationId?: string | null | undefined }} options
 * @returns {unknown[]}
 */
export function buildQueryKey(baseKey, options) {
  /** @type {unknown[]} */
  const keyParts = [...baseKey];

  if (options.organizationId) {
    keyParts.push(options.organizationId);
  }

  if (typeof options.page === 'number') {
    keyParts.push(options.page);
  }

  if (typeof options.pageSize === 'number') {
    keyParts.push(options.pageSize);
  }

  const serializedFilters = options.filters ? serializeFilters(options.filters) : '';
  if (serializedFilters) {
    keyParts.push(serializedFilters);
  }

  return keyParts;
}
