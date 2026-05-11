import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

/**
 * Inline chart support for journal entries.
 *
 * When a journal_entries.metadata blob contains a `chart` field with
 * a recognised shape, JournalPage renders this component below the
 * entry body. Three shapes supported in v1:
 *
 *   - { type: 'sparkline', label?, points: [{ x, y }] }
 *     Tiny line chart inside a 120x32 box. Used for trend hints
 *     ("eggs this week"). No axes, no legend, single colour.
 *
 *   - { type: 'bar', label?, points: [{ x, y, color? }] }
 *     Slightly bigger bar chart with X labels and a horizontal zero
 *     line. Used for P&L summary (revenue vs expenses vs net).
 *
 *   - { type: 'pie' is NOT in v1 — pie charts are easy to mis-read on
 *     phone screens. Bar charts cover the same use cases better.
 *
 * Eden's weekly summary cron emits a sparkline of daily egg counts.
 * The cycle close-out trigger emits a 3-bar P&L chart. Future
 * Eden-authored notes can opt in by adding `chart` to their
 * LOG_JOURNAL payload (the executor copies it into metadata as-is).
 *
 * The component is intentionally tiny — under 100 lines — because
 * each journal entry is a glance, not a deep-dive. If the user
 * needs a real analytics view they tap "View record" or jump to
 * Insights.
 */

export interface ChartPoint {
  x: string | number;
  y: number;
  color?: string;
}

export type ChartConfig =
  | { type: 'sparkline'; label?: string; points: ChartPoint[]; color?: string }
  | { type: 'bar'; label?: string; points: ChartPoint[]; currency?: string };

interface Props {
  config: ChartConfig;
}

/** Format a y value for tooltip / bar label. Keeps numbers compact. */
function fmt(n: number, currency?: string): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M${currency ? ' ' + currency : ''}`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k${currency ? ' ' + currency : ''}`;
  return `${n}${currency ? ' ' + currency : ''}`;
}

export function ChartBlock({ config }: Props) {
  if (!config?.points || config.points.length === 0) return null;

  if (config.type === 'sparkline') {
    const data = config.points.map(p => ({ x: p.x, y: p.y }));
    return (
      <div className="mt-2 inline-flex items-center gap-2 text-xs text-gray-500">
        {config.label && <span className="font-medium text-gray-700">{config.label}</span>}
        <div style={{ width: 120, height: 32 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="y"
                stroke={config.color ?? '#3D5F42'}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ fontSize: 10, padding: '2px 6px', borderRadius: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <span className="text-gray-400">{fmt(data[0]?.y ?? 0)} → {fmt(data[data.length - 1]?.y ?? 0)}</span>
      </div>
    );
  }

  if (config.type === 'bar') {
    const data = config.points.map(p => ({ x: String(p.x), y: p.y, color: p.color }));
    // Find min/max so the y-axis shows the zero line clearly when we
    // have a mix of positive (revenue) and negative (loss) bars.
    const ys = data.map(d => d.y);
    const yMin = Math.min(...ys, 0);
    const yMax = Math.max(...ys, 0);
    return (
      <div className="mt-3 bg-gray-50/60 border border-gray-100 rounded-lg p-3">
        {config.label && (
          <p className="text-[11px] font-semibold text-gray-600 mb-1.5">{config.label}</p>
        )}
        <div style={{ width: '100%', height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={(v: number) => fmt(v, config.currency)}
                domain={[yMin, yMax]}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Tooltip
                cursor={{ fill: 'rgba(61,95,66,0.06)' }}
                contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 4 }}
              />
              <Bar
                dataKey="y"
                fill="#3D5F42"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return null;
}
