// CycleTimeChart.tsx — How long each finished item took.
//
// The money chart. One dot per completed item, with percentile lines across it,
// so the claim becomes "85% of our work finishes within N working days" — a
// forecast somebody can hold you to, rather than an average that hides its own
// tail.
//
// Single series, so no legend. The percentile lines are directly labelled
// instead, because a legend for three reference lines is three lookups the
// reader should not have to make.

import type { JSX } from "react";

import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { CycleTimePoint } from "@jira-plus/core";

/** Height of the plot, in pixels. */
const CHART_HEIGHT = 260;

/** Marker radius, comfortably above the 8px minimum hit target. */
const MARKER_SIZE = 90;

/** What the chart needs. */
export interface CycleTimeChartProps {
  readonly points: readonly CycleTimePoint[];
  readonly percentiles: ReadonlyMap<number, number>;
}

/** Cycle-time distribution with percentile bands. */
export function CycleTimeChart({ points, percentiles }: CycleTimeChartProps): JSX.Element {
  if (points.length === 0) {
    return (
      <p className="console__empty">
        Nothing finished with a measurable start and end, so there is no duration to plot.
      </p>
    );
  }

  const data = points.map((point) => ({
    completedMs: point.completedMs,
    cycleTimeDays: Number(point.cycleTimeDays.toFixed(2)),
    issueKey: point.issueKey,
  }));

  const median = percentiles.get(50) ?? 0;
  const eightyFifth = percentiles.get(85) ?? 0;

  return (
    <figure className="chart">
      <figcaption>
        <h3 className="chart__title">How long each item took</h3>
        <p className="chart__note">
          One dot per finished item. Working days only — weekends and holidays are removed, so a
          Friday-to-Monday item is hours old rather than three days old.
        </p>
      </figcaption>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ScatterChart margin={{ top: 8, right: 64, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            type="number"
            dataKey="completedMs"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => new Date(value).toISOString().slice(0, 10)}
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            stroke="var(--border-firm)"
          />
          <YAxis
            type="number"
            dataKey="cycleTimeDays"
            name="Working days"
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            stroke="var(--border-firm)"
          />
          <ZAxis range={[MARKER_SIZE, MARKER_SIZE]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--border-firm)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border-firm)",
              borderRadius: 4,
              color: "var(--ink)",
            }}
            labelFormatter={(label) =>
              typeof label === "number" ? new Date(label).toISOString().slice(0, 10) : String(label)
            }
          />

          <ReferenceLine
            y={median}
            stroke="var(--ink-3)"
            strokeDasharray="3 3"
            label={{
              value: `median ${median.toFixed(1)}d`,
              position: "right",
              fill: "var(--ink-3)",
              fontSize: 11,
            }}
          />
          <ReferenceLine
            y={eightyFifth}
            stroke="var(--ink-3)"
            strokeDasharray="3 3"
            label={{
              value: `85th ${eightyFifth.toFixed(1)}d`,
              position: "right",
              fill: "var(--ink-3)",
              fontSize: 11,
            }}
          />

          <Scatter data={data} fill="var(--accent)" fillOpacity={0.55} name="Finished items" />
        </ScatterChart>
      </ResponsiveContainer>
    </figure>
  );
}
