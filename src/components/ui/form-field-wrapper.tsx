import { ReactNode } from "react";
import { FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface FormFieldWrapperProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
  showSuccess?: boolean;
  successMessage?: string;
}

export function FormFieldWrapper({
  label,
  description,
  error,
  required,
  children,
  className,
  showSuccess = false,
  successMessage,
}: FormFieldWrapperProps) {
  return (
    <FormItem className={cn(className)}>
      {label && (
        <FormLabel className={cn(required && "after:content-['*'] after:ml-0.5 after:text-destructive")}>
          {label}
        </FormLabel>
      )}
      {description && <FormDescription>{description}</FormDescription>}
      {children}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <FormMessage>{error}</FormMessage>
        </div>
      )}
      {showSuccess && !error && successMessage && (
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          <span>{successMessage}</span>
        </div>
      )}
    </FormItem>
  );
}

