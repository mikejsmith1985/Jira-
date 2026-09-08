// AssistantPanel.test.tsx — Out to the assistant, back into the draft, no further.
//
// Two things are asserted hardest, and both are about the panel being honest
// about what it did.
//
// Nothing reaches Jira. A reply becomes proposals in the draft, where they can
// be changed or ignored — and an unaccepted proposal lands nowhere at all.
//
// And every refusal is shown. A dropped field, a rejected value, an unreadable
// fragment: each is named, because a silent drop is indistinguishable from the
// assistant not having proposed it, and somebody would spend an afternoon
// wondering why their Initiative Type never got set.

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHORING_PACK_ID, buildCreateScreenShape, buildEmptyDraft } from "@jira-plus/core";

import { AssistantPanel } from "../src/components/authoring/AssistantPanel.js";

afterEach(cleanup);

const NOW = "2026-09-08T09:14:00.000Z";

const SECTIONS = [
  { heading: "Description", guidance: "The problem." },
  { heading: "Risks", guidance: "What could go wrong." },
];

const SHAPE = buildCreateScreenShape({
  projectKey: "DENP",
  issueTypeId: "10001",
  rawFields: {
    customfield_10500: { name: "Initiative Type", allowedValues: [{ value: "Run" }] },
  },
});

/** Renders the panel over a draft with one source. */
function renderPanel(onAccept = vi.fn()) {
  const draft = {
    ...buildEmptyDraft(NOW),
    operatorNarrative: "Members ring in on every plan change.",
    sources: [{ sourceId: "s1", label: "the brief", text: "Members cannot see it.", addedAtIso: NOW }],
  };
  render(
    <AssistantPanel
      draft={draft}
      shape={SHAPE}
      sections={SECTIONS}
      budgetCharacters={18000}
      onAccept={onAccept}
    />,
  );
  return onAccept;
}

/** Pastes a reply and reads it. */
async function pasteReply(replyText: string) {
  await userEvent.click(screen.getByLabelText(/paste the reply here/i));
  await userEvent.paste(replyText);
  await userEvent.click(screen.getByRole("button", { name: /read the reply/i }));
}

describe("building the prompt", () => {
  it("shows it rather than hiding it behind a copy button", async () => {
    // Clipboard access can be refused outright, so selecting it by hand has to
    // remain possible.
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /build the prompt/i }));

    expect(screen.getByText(/Members ring in on every plan change/)).toBeTruthy();
  });

  it("includes the gathered material", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /build the prompt/i }));

    expect(screen.getByText(/the brief/)).toBeTruthy();
  });

  it("tracks which parts have been copied, so a half-finished job is visible", async () => {
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /build the prompt/i }));

    expect(screen.getByText("not copied")).toBeTruthy();
  });
});

describe("reading a reply", () => {
  it("says nothing has changed until it is accepted", async () => {
    renderPanel();

    await pasteReply(
      JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "Show enrolment status" } }),
    );

    expect(screen.getByText(/nothing has changed yet/i)).toBeTruthy();
  });

  it("does not touch the draft until it is accepted", async () => {
    const onAccept = renderPanel();

    await pasteReply(JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "S" } }));

    expect(onAccept).not.toHaveBeenCalled();
  });

  it("puts the proposal into the draft when it is accepted", async () => {
    const onAccept = renderPanel();

    await pasteReply(JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "S" } }));
    await userEvent.click(screen.getByRole("button", { name: /put these in my draft/i }));

    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("rejects a reply from another prompt, whole, and says so", async () => {
    renderPanel();

    await pasteReply(JSON.stringify({ packId: "somethingElse", issue: { summary: "S" } }));

    expect(screen.getByText(/rejected rather than partly applied/i)).toBeTruthy();
  });
});

describe("naming what it refused", () => {
  it("names a field this Jira does not have", async () => {
    renderPanel();

    await pasteReply(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: { customfield_99999: "x" } },
      }),
    );

    // The id appears in the refusal and again in the pasted reply still on
    // screen, which is right: both are worth seeing side by side.
    expect(screen.getByText(/no such field/i)).toBeTruthy();
    expect(screen.getAllByText(/customfield_99999/).length).toBeGreaterThan(0);
  });

  it("names a value the field would not accept", async () => {
    renderPanel();

    await pasteReply(
      JSON.stringify({
        packId: AUTHORING_PACK_ID,
        issue: { summary: "S", fields: { customfield_10500: "Invented" } },
      }),
    );

    expect(screen.getByText(/would not accept the value/i)).toBeTruthy();
  });

  it("counts what it could not read at all", async () => {
    renderPanel();

    await pasteReply(
      JSON.stringify({ packId: AUTHORING_PACK_ID, issue: { summary: "S", fields: "not an object" } }),
    );

    expect(screen.getByText(/could not be read and was ignored/i)).toBeTruthy();
  });
});
