// authoringDraft.js — Keeping what somebody is writing.
//
// Three routes and no cleverness. The judgement all lives in draftStore.js,
// which explains why a draft is on disk rather than in the browser.
//
// The only rule worth stating here: an absent draft is answered with an empty
// one, not a 404. Nobody having written anything yet is the normal first state,
// and a screen that has to interpret an error to discover that is a screen that
// will one day show the error.

import express from 'express';

import { discardDraft, readDraft, writeDraft } from '../services/draftStore.js';

/** Creates the authoring draft router. */
function createAuthoringDraftRouter() {
  const router = express.Router();

  router.get('/api/authoring/draft', (req, res) => {
    res.json({ draft: readDraft() });
  });

  router.put('/api/authoring/draft', (req, res) => {
    const draft = req.body?.draft;
    if (draft === undefined || draft === null || typeof draft !== 'object') {
      res.status(400).json({ reason: 'A draft is needed to save one.' });
      return;
    }

    writeDraft(draft);
    res.json({ isSaved: true });
  });

  router.delete('/api/authoring/draft', (req, res) => {
    discardDraft();
    res.json({ isDiscarded: true });
  });

  return router;
}

export { createAuthoringDraftRouter };
