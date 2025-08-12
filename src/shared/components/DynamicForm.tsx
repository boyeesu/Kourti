import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export interface DynamicField {
  id: string;
  field_key: string;
  label: string;
  data_type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: { choices: string[] };
}

export interface DynamicFormProps {
  fields: DynamicField[];
  initialValues?: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void;
  submitLabel?: string;
  hideSubmit?: boolean;
}

export function DynamicForm({
  fields,
  initialValues = {},
  onSubmit,
  submitLabel = 'Submit',
  hideSubmit = false,
}: DynamicFormProps) {
  const [values, setValues] = useState<Record<string, any>>({});

  useEffect(() => {
    // initialize values from initialValues or defaults
    const init: Record<string, any> = {};
    fields.forEach((f) => {
      if (initialValues[f.field_key] !== undefined) {
        init[f.field_key] = initialValues[f.field_key];
      } else {
        switch (f.data_type) {
          case 'text': init[f.field_key] = '';
            break;
          case 'number': init[f.field_key] = 0;
            break;
          case 'date': init[f.field_key] = '';
            break;
          case 'select': init[f.field_key] = f.options?.choices[0] ?? '';
            break;
          case 'boolean': init[f.field_key] = false;
            break;
          default: init[f.field_key] = '';
        }
      }
    });
    setValues(init);
  }, [fields, initialValues]);

  const handleChange = (key: string, val: any) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((f) => (
        <div key={f.id} className="space-y-1">
          <Label htmlFor={f.field_key} className="block">
            {f.label}{f.required && <span className="text-destructive">*</span>}
          </Label>
          {f.data_type === 'text' && (
            <Input
              id={f.field_key}
              value={values[f.field_key]}
              onChange={(e) => handleChange(f.field_key, e.target.value)}
              required={f.required}
            />
          )}
          {f.data_type === 'number' && (
            <Input
              id={f.field_key}
              type="number"
              value={values[f.field_key]}
              onChange={(e) => handleChange(f.field_key, Number(e.target.value))}
              required={f.required}
            />
          )}
          {f.data_type === 'date' && (
            <Input
              id={f.field_key}
              type="date"
              value={values[f.field_key]}
              onChange={(e) => handleChange(f.field_key, e.target.value)}
              required={f.required}
            />
          )}
          {f.data_type === 'select' && f.options && (
            <Select
              value={values[f.field_key]}
              onValueChange={(v) => handleChange(f.field_key, v)}
            >
              <SelectTrigger id={f.field_key} className="w-full">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {f.options.choices.map((choice) => (
                  <SelectItem key={choice} value={choice}>{choice}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {f.data_type === 'boolean' && (
            <Switch
              checked={values[f.field_key]}
              onCheckedChange={(v) => handleChange(f.field_key, v)}
            />
          )}
        </div>
      ))}
      {!hideSubmit && <Button type="submit">{submitLabel}</Button>}
    </form>
  );
}