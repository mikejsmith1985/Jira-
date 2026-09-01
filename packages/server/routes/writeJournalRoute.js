// writeJournalRoute.js — Serves the record of everything Jira+ changed.
//
// This is the answer to "what did this tool do to my board?", which is a
// question a person is entitled to ask of anything that writes to their
// backlog. Read-only: nothing here can alter or clear the journal.

import express from 'express';

import { readJournal } from '../services/writeJournal.js';

/** Entries returned when the caller does not ask for a specific number. */
const DEFAULT_ENTRY_LIMIT = 200;

/** Creates the read-only change-log router. */
function createWriteJournalRouter() {
  const router = express.Router();

  router.get('/api/write-journal', (req, res) => {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.floor(requestedLimit)
      : DEFAULT_ENTRY_LIMIT;

    const entries = readJournal();
    res.json({ entries: entries.slice(0, limit), totalRecorded: entries.length });
  });

  return router;
}

export { DEFAULT_ENTRY_LIMIT, createWriteJournalRouter };
