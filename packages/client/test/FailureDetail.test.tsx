// FailureDetail.test.tsx — A status code cannot be diagnosed.
//
// Three fixes were aimed at plausible causes of one 400 before this existed,
// because the two halves that would have explained it — what Jira+ sent, and
// what Jira said back — were being discarded before anybody saw them.
//
// This is the panel that ends that. It is deliberately closed until asked for:
// somebody who just wants to fix a summary should not have to read a JSON body
// to find the sentence telling them so.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FailureDetail } from "../src/components/FailureDetail.js";

afterEach(cleanup);

const DIAGNOSIS = {
  sentMethod: "POST",
  sentPath: "/rest/api/2/issue",
  sentVia: "relay",
  sentBody: { fields: { summary: "A summary", issuetype: { id: "10001" } } },
  rawReply: '{"errorMessages":[],"errors":{"customfield_10001":"Field cannot be set"}}',
};

describe("what it shows", () => {
  it("names the request that was refused", () => {
    render(<FailureDetail diagnosis={DIAGNOSIS} />);

    expect(screen.getByText(/POST \/rest\/api\/2\/issue/)).toBeTruthy();
  });

  it("says which door it went through, since the two carry the credential differently", () => {
    // A refusal on one path and not the other is the first thing worth knowing
    // and the hardest thing to guess from outside.
    render(<FailureDetail diagnosis={DIAGNOSIS} />);

    expect(screen.getByText(/via the relay/)).toBeTruthy();
  });

  it("shows the fields that were sent, because that is half the diagnosis", () => {
    render(<FailureDetail diagnosis={DIAGNOSIS} />);

    expect(screen.getByText(/"summary": "A summary"/)).toBeTruthy();
  });

  it("shows Jira's reply verbatim, including what nothing knew how to read", () => {
    render(<FailureDetail diagnosis={DIAGNOSIS} />);

    expect(screen.getByText(/customfield_10001/)).toBeTruthy();
  });

  it("offers it as one block to copy, so it can be pasted into a bug report", () => {
    render(<FailureDetail diagnosis={DIAGNOSIS} />);

    expect(screen.getByRole("button", { name: /copy/i })).toBeTruthy();
  });
});

describe("when there is nothing to diagnose", () => {
  it("renders nothing rather than an empty panel", () => {
    const { container } = render(<FailureDetail diagnosis={null} />);

    expect(container.textContent).toBe("");
  });
});
