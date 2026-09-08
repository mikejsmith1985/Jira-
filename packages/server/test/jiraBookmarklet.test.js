// jiraBookmarklet.test.js — Twenty lines that have to be right, unwatched.
//
// This code does not run here. It runs pasted into a bookmarks bar, inside
// somebody's Jira tab, on a machine with no debugger open — so anything wrong
// with it surfaces as "the button does nothing" and nothing else.
//
// Each assertion below stands for a specific silent failure:
//
//   * no X-Atlassian-Token  -> every write is rejected as forgery, and Jira's
//     own message does not say so
//   * no credentials:include -> every request is anonymous and Jira answers 401
//     while the tab is plainly logged in
//   * a hostname guard      -> works on one instance, silently refuses the next
//   * a wrong port          -> sits in a bookmarks bar looking correct for months

import { describe, expect, it } from 'vitest';

import { IDENTITY_PATH, buildJiraBookmarklet } from '../services/jiraBookmarklet.js';

/** The bookmarklet as it would be dragged from a Jira+ running on 5556. */
const CODE = buildJiraBookmarklet(5556);

describe('the shape a bookmarks bar needs', () => {
  it('is a javascript: url', () => {
    expect(CODE.startsWith('javascript:')).toBe(true);
  });

  it('is one self-contained expression, so it leaks nothing into the page', () => {
    expect(CODE).toContain('javascript:(function(){');
    expect(CODE.endsWith('})()')).toBe(true);
  });

  it('carries the port it was built for, rather than a guess', () => {
    expect(buildJiraBookmarklet(5601)).toContain('127.0.0.1:5601');
    expect(buildJiraBookmarklet(5601)).not.toContain('127.0.0.1:5556');
  });
});

describe('the two headers without which nothing works', () => {
  it('sends the browser session cookie', () => {
    // Omit this and every request is anonymous — Jira answers 401 while the tab
    // it is running in is plainly signed in.
    expect(CODE).toContain('credentials:"include"');
  });

  it('sends the token Data Center demands on writes', () => {
    // Jira DC rejects a cookie-authenticated POST without this as cross-site
    // request forgery, and the message it returns does not mention it.
    expect(CODE).toContain('"X-Atlassian-Token":"no-check"');
  });
});

describe('knowing it is on the right page', () => {
  it('asks Jira who the user is rather than matching a hostname', () => {
    // A hostname test is a guess. This instance is at a corporate AWS domain and
    // the next one will be somewhere else; /myself proves the page and the
    // session at once, and returns the name worth showing.
    expect(IDENTITY_PATH).toBe('/rest/api/2/myself');
    expect(CODE).toContain(IDENTITY_PATH);
  });

  it('contains no hostname test at all', () => {
    expect(CODE).not.toContain('location.hostname');
  });

  it('reports the display name when it registers, so the relay proves itself', () => {
    expect(CODE).toContain('displayName');
  });
});

describe('surviving what browser tabs do', () => {
  it('tells the bridge when its tab goes away', () => {
    // Without this a closed tab leaves the relay reading connected until a
    // heartbeat goes stale, and requests queue against nothing.
    expect(CODE).toContain('pagehide');
    expect(CODE).toContain('/api/relay/deregister');
  });

  it('asks before the tab is closed, since closing it stops the relay', () => {
    expect(CODE).toContain('beforeunload');
  });

  it('renames the tab so it is findable among twenty others', () => {
    expect(CODE).toContain('RELAY -');
  });

  it('keeps polling rather than stopping at the first failure', () => {
    // Jira+ restarting drops one poll. Exiting on it would mean re-clicking the
    // bookmarklet after every update, which is the thing this is meant to avoid.
    expect(CODE).toContain('while(isRunning)');
  });
});
