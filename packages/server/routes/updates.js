// updates.js — Two questions: is there a newer version, and please fetch it.
//
// Kept deliberately thin. Every decision that could be got wrong — comparing
// versions by number, writing beside the running executable, moving the pointer
// last — lives in updateService.js where it is tested directly.

import express from 'express';

import { checkForUpdate, installUpdate } from '../services/updateService.js';

/** HTTP status for "the request was fine, this installation cannot do it". */
const HTTP_CONFLICT = 409;

/**
 * Creates the updates router.
 *
 * @param {string} installedVersion The version this process is running.
 */
function createUpdatesRouter(installedVersion) {
  const router = express.Router();

  router.get('/api/update/check', async (req, res) => {
    res.json(await checkForUpdate(installedVersion));
  });

  router.post('/api/update/install', async (req, res) => {
    const outcome = await installUpdate(installedVersion);
    if (outcome.isInstalled) {
      res.json(outcome);
      return;
    }
    res.status(HTTP_CONFLICT).json({ reason: outcome.reason });
  });

  return router;
}

export { createUpdatesRouter };
