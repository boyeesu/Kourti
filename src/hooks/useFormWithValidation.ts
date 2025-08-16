import { useState } from 'react';
import { useForm, UseFormProps, UseFormReturn, FieldValues, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { sanitizeErrorForLogging } from '@/lib/utils';

/**
 * Enhanced form hook with built-in validation, error handling,
 * and loading state management.
 */
export function useFormWithValidation<
  TFormValues extends FieldValues = FieldValues,
  TContext = any,
  TSchema extends z.ZodType<any, any, any> = z.ZodType<any, any, any>
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
  defaultValues?: UseFormProps<TFormValues, TContext>['defaultValues'];
  onSubmit?: SubmitHandler<z.infer<TSchema>>;
  onError?: (errors: any, event?: any) => void;
  successMessage?: string;
  errorMessage?: string;
} & Omit<UseFormProps<TFormValues, TContext>, 'resolver'>): UseFormReturn<z.infer<TSchema>, TContext> & {
  isSubmitting: boolean;
  submitHandler: (values: z.infer<TSchema>) => Promise<void>;
  resetWithValues: (values: z.infer<TSchema>) => void;
} {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<TSchema>, TContext>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as UseFormProps<z.infer<TSchema>, TContext>['defaultValues'],
    ...formOptions,
  });

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
      console.error('Form submission error:', sanitizeErrorForLogging(error));
      
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