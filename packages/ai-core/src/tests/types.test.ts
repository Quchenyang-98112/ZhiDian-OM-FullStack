import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodParser } from '../types.ts';

describe('createZodParser', () => {
  const schema = z.object({ answer: z.number() });
  const parser = createZodParser(schema);

  it('parses JSON in markdown code fences', () => {
    const result = parser('```json\n{"answer": 42}\n```');
    expect(result).toEqual({ answer: 42 });
  });

  it('parses bare JSON objects', () => {
    const result = parser('{"answer": 7}');
    expect(result).toEqual({ answer: 7 });
  });

  it('returns null for invalid JSON', () => {
    const result = parser('not json');
    expect(result).toBeNull();
  });

  it('returns null when schema validation fails', () => {
    const result = parser('{"answer": "no"}');
    expect(result).toBeNull();
  });
});
