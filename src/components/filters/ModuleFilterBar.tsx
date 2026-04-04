import { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
}

export interface SelectFilterConfig {
  key: string;
  placeholder: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  width?: string;
  icon?: ReactNode;
}

export interface ModuleFilterBarProps {
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  searchWidth?: string;
  filters?: SelectFilterConfig[];
  /** Extra elements to render on the right side */
  trailing?: ReactNode;
  className?: string;
  /** Show a "Clear all" button when any filter is active */
  showClearAll?: boolean;
  onClearAll?: () => void;
}

export function ModuleFilterBar({
  searchTerm,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchWidth = 'w-full sm:w-[280px]',
  filters = [],
  trailing,
  className,
  showClearAll = true,
  onClearAll,
}: ModuleFilterBarProps) {
  const hasActiveFilters =
    (searchTerm && searchTerm.length > 0) ||
    filters.some((f) => f.value !== 'all' && f.value !== '');

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2 items-center justify-between bg-transparent py-2',
        className
      )}
    >
      <div className="flex flex-wrap gap-2 items-center flex-1">
        {onSearchChange !== undefined && (
          <div className={cn('relative', searchWidth)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchTerm ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-md border border-input focus:ring-primary focus:border-primary/30"
            />
          </div>
        )}

        {filters.map((filter) => (
          <Select key={filter.key} value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger className={cn('h-10', filter.width ?? 'w-[150px]')}>
              {filter.icon && <span className="mr-2">{filter.icon}</span>}
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {showClearAll && hasActiveFilters && onClearAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-10 px-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {trailing && <div className="flex items-center gap-2">{trailing}</div>}
    </div>
  );
}
