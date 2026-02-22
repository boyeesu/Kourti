import { useState } from 'react';
import { useForm, UseFormProps, UseFormReturn, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { sanitizeErrorForLogging } from '@/lib/utils';
import { logError } from '@/lib/logger';

/**
 * Enhanced form hook with built-in validation, error handling,
 * and loading state management.
 */
export function useFormWithValidation<
  TSchema extends z.ZodType<any, any, any> = z.ZodType<any, any, any>,
  TContext = any
>({
  schema,
  defaultValues,
  onSubmit,
  onError,
  successMessage,
  errorMessage = 'An error occurred while submitting the form.',
  ...formOptions
}: {
  schema: TSchema;
  defaultValues?: UseFormProps<z.infer<TSchema>, TContext>['defaultValues'];
  onSubmit?: SubmitHandler<z.infer<TSchema>>;
  onError?: (errors: any, event?: any) => void;
  successMessage?: string;
  errorMessage?: string;
} & Omit<UseFormProps<z.infer<TSchema>, TContext>, 'resolver'>): UseFormReturn<z.infer<TSchema>, TContext> & {
  isSubmitting: boolean;
  submitHandler: (values: z.infer<TSchema>) => Promise<void>;
  resetWithValues: (values: z.infer<TSchema>) => void;
} {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<TSchema>, TContext>({
    resolver: zodResolver(schema) as any,
    defaultValues: defaultValues as any,
    ...formOptions,
  }) as any;

  const submitHandler = async (values: z.infer<TSchema>) => {
    if (!onSubmit) return;
    
    setIsSubmitting(true);
    
    try {
      await onSubmit(values);
      
      if (successMessage) {
        toast({
          title: 'Success',
          description: successMessage,
        });
      }
    } catch (error) {
      logError('Form submission error', sanitizeErrorForLogging(error));
      
      toast({
        variant: 'destructive',
        title: 'Error',
        description: errorMessage || 'An error occurred. Please try again.',
      });
      
      if (onError) {
        onError(form.formState.errors, form.formState);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetWithValues = (values: z.infer<TSchema>) => {
    form.reset(values);
  };

  return {
    ...form,
    isSubmitting,
    submitHandler,
    resetWithValues,
  };
}