// ThroughputChart.tsx — Items finished each week, with a rolling mean.
//
// The velocity report's honest replacement. Bars are weekly counts; the dashed
// line is the four-week mean, which is the figure worth quoting because a single
// week is noise.
//
// Single series, so no legend — the title names it. Every bar shows its own
// count on hover, and the axis is deliberately recessive: the data is the ink
// that matters.

import type { JSX } from "react";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ThroughputWeek } from "@jira-plus/core";

/** Height of the plot, in pixels. */
const CHART_HEIGHT = 240;

/** What the chart needs. */
export interface ThroughputChartProps {
  readonly weeks: readonly ThroughputWeek[];
}

/** Weekly throughput. */
export function ThroughputChart({ weeks }: ThroughputChartProps): JSX.Element {
  if (weeks.length === 0) {
    return (
      <p className="console__empty">
        No item completed under this definition in the retrieved set. That is a result, not an empty
        chart.
      </p>
    );
  }

  const data = weeks.map((week) => ({
    isoWeek: week.isoWeek,
    completed: week.completedKeys.length,
    rollingMean: Number(week.rollingMean.toFixed(2)),
  }));

  return (
    <figure className="chart">
      <figcaption>
        <h3 className="chart__title">Items finished each week</h3>
        <p className="chart__note">
          Bars are that week&apos;s count. The dashed line is the four-week average, which is the
          figure worth quoting — one week on its own is noise.
        </p>
      </figcaption>

      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="isoWeek"
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            stroke="var(--border-firm)"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            stroke="var(--border-firm)"
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border-firm)",
              borderRadius: 4,
              color: "var(--ink)",
            }}
          />
          <Bar dataKey="completed" name="Finished" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="rollingMean"
            name="4-week average"
            stroke="var(--ink-3)"
            strokeDasharray="4 3"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}
