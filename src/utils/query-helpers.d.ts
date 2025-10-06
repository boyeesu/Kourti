export function serializeFilters(filters: Record<string, any>): string;
export function buildQueryKey(
  baseKey: string[],
  options: {
    page?: number;
    pageSize?: number;
    filters?: Record<string, any>;
    organizationId?: string | null;
  }
): unknown[];
