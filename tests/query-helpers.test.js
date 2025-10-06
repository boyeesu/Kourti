import test from 'node:test';
import assert from 'node:assert/strict';

import { serializeFilters, buildQueryKey } from '../src/utils/query-helpers.js';

test('serializeFilters creates stable ordering for object keys', () => {
  const filtersA = { b: 2, a: 1 };
  const filtersB = { a: 1, b: 2 };

  assert.equal(serializeFilters(filtersA), serializeFilters(filtersB));
});

test('serializeFilters sorts primitive arrays to avoid cache misses', () => {
  const filtersA = { tags: ['beta', 'alpha'] };
  const filtersB = { tags: ['alpha', 'beta'] };

  assert.equal(serializeFilters(filtersA), serializeFilters(filtersB));
});

test('buildQueryKey composes consistent key parts', () => {
  const baseKey = ['documents'];
  const key = buildQueryKey(baseKey, {
    page: 2,
    pageSize: 50,
    filters: { status: 'active' },
    organizationId: 'org-123'
  });

  assert.deepEqual(key, ['documents', 'org-123', 2, 50, serializeFilters({ status: 'active' })]);
});
