export function serializeFilters(filters: Record<string, unknown>): string;
export function buildQueryKey(
  baseKey: string[],
  options: {
    page?: number;
    pageSize?: number;
    filters?: Record<string, unknown>;
    organizationId?: string | null;
  }
): unknown[];
