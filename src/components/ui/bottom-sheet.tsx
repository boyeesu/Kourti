import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "max-h-[90vh] overflow-y-auto rounded-t-2xl",
          className
        )}
      >
        {title && (
          <SheetHeader className="pb-4 border-b">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        <div className="mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

