import { describe, expect, it } from "vitest";
import * as z from "zod";
import { parseCSV } from "./csv";

const schema = z.object({
  name: z.string(),
  email: z.string().optional(),
});

describe("parseCSV", () => {
  it("parses quoted fields with commas", () => {
    const csv = 'name,email\n"Smith, John",john@example.com';
    const { data, errors } = parseCSV(csv, schema);
    expect(errors.length).toBe(0);
    expect(data).toEqual([{ name: "Smith, John", email: "john@example.com" }]);
  });

  it("handles CRLF line endings", () => {
    const csv = "name,email\r\nJohn Doe,john@example.com\r\n";
    const { data, errors } = parseCSV(csv, schema);
    expect(errors.length).toBe(0);
    expect(data).toEqual([{ name: "John Doe", email: "john@example.com" }]);
  });
});
