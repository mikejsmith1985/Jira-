// AgingChart.tsx — What is stuck right now.
//
// The chart that earns its place in a meeting people already attend. It plots
// every unfinished item against how long finished work usually takes, so the
// question stops being "is this late?" and becomes "is this older than 85% of
// everything we have ever finished?" — which has an answer.
//
// Status colour is reserved and never decorative: an item past the threshold is
// amber AND carries a label, because amber alone is not readable to everyone.

import type { JSX } from "react";

import type { AgingItem } from "@jira-plus/core";

/** How many items to list before summarising the rest. */
const VISIBLE_ITEM_LIMIT = 20;

/** What the chart needs. */
export interface AgingChartProps {
  readonly items: readonly AgingItem[];
  readonly thresholdDays: number;
}

/** Unfinished work, oldest first. */
export function AgingChart({ items, thresholdDays }: AgingChartProps): JSX.Element {
  if (items.length === 0) {
    return (
      <p className="console__empty">
        Nothing is in progress in this set, so there is nothing ageing.
      </p>
    );
  }

  const longestAge = Math.max(...items.map((item) => item.ageDays), thresholdDays, 1);
  const visible = items.slice(0, VISIBLE_ITEM_LIMIT);
  const olderThanUsualCount = items.filter((item) => item.isOlderThanUsual).length;

  return (
    <figure className="chart">
      <figcaption>
        <h3 className="chart__title">What is ageing now</h3>
        <p className="chart__note">
          {thresholdDays > 0 ? (
            <>
              The marker is {thresholdDays.toFixed(1)} working days — the point by which 85% of
              finished work is done. {olderThanUsualCount} of {items.length} in-progress items are
              already past it.
            </>
          ) : (
            <>Nothing has finished yet, so there is no threshold to compare against.</>
          )}
        </p>
      </figcaption>

      <ul className="aging">
        {visible.map((item) => (
          <li
            key={item.issueKey}
            className={`aging__row ${item.isOlderThanUsual ? "aging__row--over" : ""}`}
          >
            <span className="aging__key mono">{item.issueKey}</span>
            <span className="aging__status chip">{item.statusName}</span>
            <span className="aging__bar" aria-hidden="true">
              <span
                className="aging__fill"
                style={{ width: `${Math.min(100, (item.ageDays / longestAge) * 100)}%` }}
              />
              {thresholdDays > 0 ? (
                <span
                  className="aging__threshold"
                  style={{ left: `${Math.min(100, (thresholdDays / longestAge) * 100)}%` }}
                />
              ) : null}
            </span>
            <span className="aging__age tabular">
              {item.ageDays.toFixed(1)}d
              {item.isOlderThanUsual ? <span className="aging__flag"> older than usual</span> : null}
            </span>
          </li>
        ))}
      </ul>

      {items.length > VISIBLE_ITEM_LIMIT ? (
        <p className="chart__note">
          {items.length - VISIBLE_ITEM_LIMIT} more in-progress items are not shown. They are
          younger than every item above.
        </p>
      ) : null}
    </figure>
  );
}
