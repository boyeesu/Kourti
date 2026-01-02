import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  children
}: EmptyStateProps) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        {Icon && (
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6 max-w-md">{description}</p>
        {children}
        <div className="flex flex-col sm:flex-row gap-3">
          {action && (
            <Button onClick={action.onClick} className="shadow-sm">
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Pre-configured empty states for common scenarios
export function EmptyTableState({
  title = "No data available",
  description = "Get started by adding your first item.",
  action
}: Omit<EmptyStateProps, "icon">) {
  return (
    <div className="py-12 text-center">
      <EmptyState
        title={title}
        description={description}
        action={action}
      />
    </div>
  );
}

export function EmptySearchState({
  searchTerm,
  onClear
}: {
  searchTerm: string;
  onClear: () => void;
}) {
  return (
    <EmptyState
      title="No results found"
      description={`No items match "${searchTerm}". Try adjusting your search or filters.`}
      action={{
        label: "Clear filters",
        onClick: onClear
      }}
    />
  );
}

