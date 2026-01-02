import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MobileCardViewProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  className?: string;
  onItemClick?: (item: T) => void;
}

export function MobileCardView<T>({
  items,
  renderCard,
  emptyMessage = "No items",
  className,
  onItemClick,
}: MobileCardViewProps<T>) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <Card
          key={index}
          className={cn(
            "transition-all hover:shadow-md",
            onItemClick && "cursor-pointer"
          )}
          onClick={() => onItemClick?.(item)}
        >
          <CardContent className="p-4">
            {renderCard(item, index)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

