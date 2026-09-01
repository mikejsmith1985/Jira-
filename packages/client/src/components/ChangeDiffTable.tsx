// ChangeDiffTable.tsx — was → will be, before anything is sent.
//
// No request leaves this application until this table has been shown. There is
// no "apply all" that skips it, deliberately: a change nobody saw is a change
// nobody can be accountable for.
//
// Fields whose proposed value already matches do not appear at all. Their count
// is stated instead, because "three of the six were already correct" is useful
// and six rows where three do nothing is noise.

import type { JSX } from "react";

import { useState } from "react";

import { canApplyChangeSet } from "@jira-plus/core";
import type { ApplyOutcome, ChangeSet, PlannedChange } from "@jira-plus/core";

/** Renders a value as something a reader recognises. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "— empty —";
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        entry !== null && typeof entry === "object"
          ? String((entry as Record<string, unknown>).name ?? JSON.stringify(entry))
          : String(entry),
      )
      .join(", ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record.value ?? record.name ?? JSON.stringify(record));
  }
  return String(value);
}

/** What the table needs. */
export interface ChangeDiffTableProps {
  readonly changeSet: ChangeSet;
  readonly onApply: (accepted: readonly PlannedChange[]) => Promise<void>;
  readonly outcome: ApplyOutcome | null;
  readonly onDismiss: () => void;
}

/** The review-before-apply table. */
export function ChangeDiffTable({
  changeSet,
  onApply,
  outcome,
  onDismiss,
}: ChangeDiffTableProps): JSX.Element {
  const [rejectedKeys, setRejectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  const rowKey = (change: PlannedChange): string => `${change.issueKey}::${change.fieldId}`;
  const accepted = changeSet.plannedChanges.filter((change) => !rejectedKeys.has(rowKey(change)));

  function toggle(change: PlannedChange): void {
    setRejectedKeys((previous) => {
      const next = new Set(previous);
      const key = rowKey(change);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="diff">
      <div className="drill__head">
        <h3 className="chart__title">Review before applying</h3>
        <button type="button" className="tile__population" onClick={onDismiss}>
          Cancel
        </button>
      </div>

      {changeSet.blockers.length > 0 ? (
        <div className="notice notice--error" role="alert">
          <p>
            This action is refused because {changeSet.blockers.length} change
            {changeSet.blockers.length === 1 ? "" : "s"} cannot be made. Nothing will be written, so
            nothing is left half-done.
          </p>
          <ul>
            {changeSet.blockers.map((blocker) => (
              <li key={`${blocker.issueKey}-${blocker.reason}`}>
                <span className="mono">{blocker.issueKey}</span> — {blocker.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {changeSet.unchangedCount === 0 ? null : (
        <p className="chart__note">
          {changeSet.unchangedCount} suggestion
          {changeSet.unchangedCount === 1 ? " was" : "s were"} skipped because the value already
          matches. They are not shown, because a row that changes nothing is noise.
        </p>
      )}

      {changeSet.plannedChanges.length === 0 ? (
        <p className="console__empty">There is nothing left to change.</p>
      ) : (
        <div className="console__results">
          <table className="table diff__table">
            <thead>
              <tr>
                <th scope="col">Apply</th>
                <th scope="col">Issue</th>
                <th scope="col">Field</th>
                <th scope="col">Now</th>
                <th scope="col">Will be</th>
              </tr>
            </thead>
            <tbody>
              {changeSet.plannedChanges.map((change) => {
                const key = rowKey(change);
                const result = outcome?.results.find(
                  (candidate) =>
                    candidate.issueKey === change.issueKey && candidate.fieldId === change.fieldId,
                );
                return (
                  <tr key={key} className={rejectedKeys.has(key) ? "diff__row--rejected" : ""}>
                    <td>
                      {result === undefined ? (
                        <input
                          type="checkbox"
                          checked={!rejectedKeys.has(key)}
                          aria-label={`Apply the change to ${change.issueKey}`}
                          onChange={() => toggle(change)}
                        />
                      ) : (
                        <span className={`chip chip--${result.status}`}>{result.status}</span>
                      )}
                    </td>
                    <td className="mono">{change.issueKey}</td>
                    <td>{change.fieldLabel}</td>
                    <td className="diff__was">{renderValue(change.currentValue)}</td>
                    <td className="diff__will">{renderValue(change.proposedValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {outcome === null ? (
        <div className="evidence__actions">
          <button
            type="button"
            className="button"
            disabled={isApplying || accepted.length === 0 || !canApplyChangeSet(changeSet)}
            onClick={() => {
              setIsApplying(true);
              void onApply(accepted).finally(() => setIsApplying(false));
            }}
          >
            {isApplying
              ? "Applying…"
              : `Apply ${accepted.length} change${accepted.length === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : (
        <div className="receipt">
          <span className="receipt__lead tabular">
            {outcome.appliedCount} applied
            {outcome.failedCount > 0 ? `, ${outcome.failedCount} failed` : ""}
          </span>
          {outcome.refusedReason === null ? null : (
            <p className="receipt__note">{outcome.refusedReason}</p>
          )}
          {outcome.failedCount > 0 ? (
            <p className="receipt__note">
              The failures are listed above with Jira&apos;s own reason. The changes that succeeded
              were not undone — reverting them would be a second change nobody asked for, and would
              misreport what Jira now holds.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
