import Papa from "papaparse";
import { ZodSchema } from "zod";

export interface CSVParseResult<T> {
  data: T[];
  errors: string[];
}

export function parseCSV<T>(csvText: string, schema: ZodSchema<T>): CSVParseResult<T> {
  const results = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const data: T[] = [];
  const errors: string[] = [];

  results.data.forEach((row, index) => {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      data.push(parsed.data);
    } else {
      const fields = parsed.error.errors.map(e => e.path.join(".")).join(", ");
      errors.push(`Row ${index + 2}: Invalid fields: ${fields}`);
    }
  });

  return { data, errors };
}
