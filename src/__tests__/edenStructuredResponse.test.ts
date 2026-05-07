/**
 * Unit tests for parseStructuredResponse — Phase 2 PR 3.
 *
 * The frontend contract: Eden may emit `<eden:structured>{...}</eden:structured>`
 * at the end of any reply. Parser must:
 *   - Strip the block from displayed text
 *   - Return the parsed object
 *   - Tolerate missing block (return null + original text unchanged)
 *   - Tolerate malformed JSON (fall back to plain render)
 */

import { describe, it, expect } from 'vitest';
import { parseStructuredResponse } from '../components/ai/EdenStructuredResponse';

describe('parseStructuredResponse', () => {
  it('returns null structured when no block present', () => {
    const input = 'Your FCR is 1.8 — that is fine.';
    const { structured, cleanText } = parseStructuredResponse(input);
    expect(structured).toBeNull();
    expect(cleanText).toBe(input);
  });

  it('extracts a well-formed block and strips it from text', () => {
    const input = `Mortality jumped this week.

<eden:structured>
{ "headline": "Mortality is up 3x", "next_steps": ["Test ammonia", "Aerate more"], "data": ["12 deaths"] }
</eden:structured>`;
    const { structured, cleanText } = parseStructuredResponse(input);
    expect(structured).not.toBeNull();
    expect(structured!.headline).toBe('Mortality is up 3x');
    expect(structured!.next_steps).toEqual(['Test ammonia', 'Aerate more']);
    expect(structured!.data).toEqual(['12 deaths']);
    expect(cleanText).toBe('Mortality jumped this week.');
  });

  it('tolerates a fenced ```json wrapper inside the block', () => {
    const input = `Body.

<eden:structured>
\`\`\`json
{ "headline": "All good" }
\`\`\`
</eden:structured>`;
    const { structured } = parseStructuredResponse(input);
    expect(structured?.headline).toBe('All good');
  });

  it('falls back to plain render on malformed JSON', () => {
    const input = `Body.

<eden:structured>
{ broken json
</eden:structured>`;
    const { structured, cleanText } = parseStructuredResponse(input);
    expect(structured).toBeNull();
    expect(cleanText).toBe(input);
  });

  it('handles partial structures (missing keys are fine)', () => {
    const input = `<eden:structured>{ "headline": "Just a headline" }</eden:structured>`;
    const { structured, cleanText } = parseStructuredResponse(input);
    expect(structured?.headline).toBe('Just a headline');
    expect(structured?.next_steps).toBeUndefined();
    expect(structured?.data).toBeUndefined();
    expect(cleanText).toBe('');
  });

  it('returns empty cleanText + null structured on empty input', () => {
    const { structured, cleanText } = parseStructuredResponse('');
    expect(structured).toBeNull();
    expect(cleanText).toBe('');
  });
});
