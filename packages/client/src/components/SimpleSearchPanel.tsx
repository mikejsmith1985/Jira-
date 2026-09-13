// SimpleSearchPanel.tsx — The search for everybody who does not write JQL.
//
// JQL is a real barrier. Most people who need an answer about their own team's
// issues cannot write one, and telling them to learn it first is exactly how a
// tool ends up used by one person — which is the adoption failure this product
// exists not to repeat.
//
// One property keeps it honest: the query it builds is ON SCREEN, and the button
// runs that query and no other. This is a way to WRITE a search, never a second
// way to ask Jira. So a number a beginner produced carries the same visible,
// re-runnable query as anybody else's, and a search that found the wrong thing
// can be read and corrected rather than merely distrusted.
//
// The choices come from the instance. Asking somebody to type a project key or
// a status name exactly right is the same barrier as JQL, with fewer words.

import type { JSX } from "react";

import { buildJqlFromCriteria } from "@jira-plus/core";
import type {
  Assignment,
  Completion,
  IssueTypeChoice,
  ProjectChoice,
  SimpleSearchCriteria,
  StatusChoice,
} from "@jira-plus/core";

/** The lists the instance offered, or null when they could not be read. */
export interface SearchChoices {
  readonly projects: readonly ProjectChoice[];
  readonly issueTypes: readonly IssueTypeChoice[];
  readonly statuses: readonly StatusChoice[];
}

/** What the panel needs. */
export interface SimpleSearchPanelProps {
  readonly criteria: SimpleSearchCriteria;
  readonly choices: SearchChoices | null;
  readonly isRetrieving: boolean;
  readonly onChange: (criteria: SimpleSearchCriteria) => void;
  readonly onSearch: (jql: string) => void;
  readonly onEditAsJql: (jql: string) => void;
}

/** How far back the "changed recently" choices reach. */
const RECENCY_CHOICES: readonly { readonly label: string; readonly days: number | null }[] = [
  { label: "Any time", days: null },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

/** Adds a value, or removes it when it is already there. */
function toggleValue(values: readonly string[], value: string): readonly string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

/** A row of choices, any number of which may be picked at once. */
function ChoiceRow({
  label,
  options,
  chosen,
  onToggle,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly chosen: readonly string[];
  readonly onToggle: (value: string) => void;
}): JSX.Element {
  return (
    <div className="search__row">
      <span className="console__label">{label}</span>
      <div className="search__choices">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="search__choice"
            aria-pressed={chosen.includes(option.value)}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A row where exactly one choice applies. */
function SingleChoiceRow<TValue extends string>({
  label,
  options,
  chosen,
  onChoose,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: TValue; readonly label: string }[];
  readonly chosen: TValue;
  readonly onChoose: (value: TValue) => void;
}): JSX.Element {
  return (
    <div className="search__row">
      <span className="console__label">{label}</span>
      <div className="search__choices">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="search__choice"
            aria-pressed={chosen === option.value}
            onClick={() => onChoose(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The basic search. */
export function SimpleSearchPanel({
  criteria,
  choices,
  isRetrieving,
  onChange,
  onSearch,
  onEditAsJql,
}: SimpleSearchPanelProps): JSX.Element {
  const jql = buildJqlFromCriteria(criteria);

  if (choices === null) {
    return (
      <p className="notice notice--attn">
        Jira&rsquo;s own lists of projects, issue types and statuses could not be read, so there is
        nothing to choose from. An empty list and an unreachable Jira are different things, and this
        is the second one. The JQL box below still works.
      </p>
    );
  }

  return (
    <div className="search">
      <ChoiceRow
        label="Projects"
        options={choices.projects.map((project) => ({
          value: project.projectKey,
          label: `${project.name} (${project.projectKey})`,
        }))}
        chosen={criteria.projectKeys}
        onToggle={(value) =>
          onChange({ ...criteria, projectKeys: toggleValue(criteria.projectKeys, value) })
        }
      />

      <ChoiceRow
        label="Issue types"
        options={choices.issueTypes.map((type) => ({ value: type.name, label: type.name }))}
        chosen={criteria.issueTypeNames}
        onToggle={(value) =>
          onChange({ ...criteria, issueTypeNames: toggleValue(criteria.issueTypeNames, value) })
        }
      />

      <ChoiceRow
        label="Statuses"
        options={choices.statuses.map((status) => ({ value: status.name, label: status.name }))}
        chosen={criteria.statusNames}
        onToggle={(value) =>
          onChange({ ...criteria, statusNames: toggleValue(criteria.statusNames, value) })
        }
      />

      <SingleChoiceRow<Completion>
        label="Finished?"
        options={[
          { value: "any", label: "Either" },
          { value: "open", label: "Still open" },
          { value: "done", label: "Done" },
        ]}
        chosen={criteria.completion}
        onChoose={(value) => onChange({ ...criteria, completion: value })}
      />

      <SingleChoiceRow<Assignment>
        label="Assigned to"
        options={[
          { value: "anyone", label: "Anyone" },
          { value: "me", label: "Me" },
          { value: "unassigned", label: "Nobody" },
        ]}
        chosen={criteria.assignment}
        onChoose={(value) => onChange({ ...criteria, assignment: value })}
      />

      <SingleChoiceRow<string>
        label="Changed"
        options={RECENCY_CHOICES.map((choice) => ({
          value: String(choice.days),
          label: choice.label,
        }))}
        chosen={String(criteria.updatedWithinDays)}
        onChoose={(value) =>
          onChange({ ...criteria, updatedWithinDays: value === "null" ? null : Number(value) })
        }
      />

      <div className="search__row">
        <label className="console__label" htmlFor="search-text">
          Containing the words
        </label>
        <input
          id="search-text"
          className="console__jql"
          value={criteria.text}
          placeholder="Optional — searches summary, description and comments"
          onChange={(event) => onChange({ ...criteria, text: event.target.value })}
        />
      </div>

      {/* On screen, always. A search nobody can read is a search nobody can
          correct — and this is the same query the button runs, not a preview
          of one. */}
      <div className="search__query">
        <span className="console__label">This will run</span>
        <code className="mono">
          {jql.length > 0 ? jql : "Choose something to search for, above."}
        </code>
      </div>

      <div className="console__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={isRetrieving || jql.length === 0}
          onClick={() => onSearch(jql)}
        >
          {isRetrieving ? "Retrieving…" : "Search"}
        </button>
        <button
          type="button"
          className="button"
          disabled={jql.length === 0}
          onClick={() => onEditAsJql(jql)}
        >
          Edit as JQL
        </button>
      </div>
    </div>
  );
}
