/**
 * EdenStructuredResponse — render the optional <eden:structured>...</eden:structured>
 * block Eden may emit at the end of any reply.
 *
 * Per Phase 2 design decision #1 (slim accent stripe + white fill).
 *
 * Each card is a slim colored stripe + a label + the content. Three card types:
 *   - "Key finding"   (emerald) — the headline answer
 *   - "Next steps"    (blue)    — ordered action items
 *   - "Data referenced" (gray)  — the farm numbers Eden cited
 *
 * If only one or two of those keys are present, the missing ones simply don't
 * render — Eden is free to include only what's relevant.
 *
 * Backward-compatible: if a response has NO structured block, the parent
 * (AIAssistantPage) renders the plain markdown as today.
 */

import { Target, ListChecks, Database } from 'lucide-react';

export interface EdenStructured {
  headline?: string;
  next_steps?: string[];
  data?: string[];
}

/**
 * Try to extract a `<eden:structured>{...}</eden:structured>` block from
 * Eden's reply. Returns the parsed object plus the cleaned text (with the
 * structured block stripped out). If no block is found, returns
 * `{ structured: null, cleanText: input }`.
 */
export function parseStructuredResponse(input: string): {
  structured: EdenStructured | null;
  cleanText: string;
} {
  if (!input) return { structured: null, cleanText: '' };
  // Permissive — Eden's prompt asks for the explicit tags but be tolerant of
  // optional whitespace, newlines, and Haiku/Sonnet sometimes adding ```json fences.
  const re = /<eden:structured>\s*([\s\S]*?)\s*<\/eden:structured>/i;
  const m = input.match(re);
  if (!m) return { structured: null, cleanText: input };
  const rawJson = m[1].replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(rawJson) as EdenStructured;
    if (parsed && typeof parsed === 'object') {
      const cleanText = input.replace(re, '').trim();
      return { structured: parsed, cleanText };
    }
  } catch {
    /* malformed — fall through to plain render */
  }
  return { structured: null, cleanText: input };
}

interface Props {
  structured: EdenStructured;
}

export function EdenStructuredResponse({ structured }: Props) {
  const { headline, next_steps, data } = structured;
  const hasAny =
    (headline && headline.trim().length > 0) ||
    (next_steps && next_steps.length > 0) ||
    (data && data.length > 0);
  if (!hasAny) return null;

  return (
    <div className="mt-2 space-y-2">
      {headline && headline.trim().length > 0 && (
        <Card stripe="bg-emerald-500" label="Key finding" Icon={Target}>
          <p className="text-sm text-gray-900 leading-snug">{headline}</p>
        </Card>
      )}

      {next_steps && next_steps.length > 0 && (
        <Card stripe="bg-blue-500" label="Next steps" Icon={ListChecks}>
          <ol className="space-y-1 text-sm text-gray-900 list-none">
            {next_steps.map((step, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-blue-600 font-semibold tabular-nums flex-shrink-0">
                  {idx + 1}.
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card stripe="bg-gray-400" label="Data referenced" Icon={Database}>
          <ul className="space-y-1 text-sm text-gray-700">
            {data.map((datum, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-gray-400 flex-shrink-0">•</span>
                <span className="leading-snug">{datum}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Card({
  stripe,
  label,
  Icon,
  children,
}: {
  stripe: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
      <div className={`h-0.5 w-full ${stripe}`} aria-hidden />
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {label}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default EdenStructuredResponse;
