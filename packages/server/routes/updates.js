// updates.js — Two questions: is there a newer version, and please fetch it.
//
// Kept deliberately thin. Every decision that could be got wrong — comparing
// versions by number, writing beside the running executable, moving the pointer
// last — lives in updateService.js where it is tested directly.

import express from 'express';

import { scheduleRestart } from '../services/restartService.js';
import { checkForUpdate, installUpdate } from '../services/updateService.js';

/** HTTP status for "the request was fine, this installation cannot do it". */
const HTTP_CONFLICT = 409;

/**
 * Creates the updates router.
 *
 * @param {string} installedVersion The version this process is running.
 * @param {number} port The port to hand back over on after restarting.
 */
function createUpdatesRouter(installedVersion, port) {
  const router = express.Router();

  router.get('/api/update/check', async (req, res) => {
    res.json(await checkForUpdate(installedVersion));
  });

  router.post('/api/update/install', async (req, res) => {
    const outcome = await installUpdate(installedVersion);
    if (outcome.isInstalled) {
      // Answered BEFORE the handover starts, so the browser learns the new
      // version's number and can wait for it to come back on that port.
      const restart = scheduleRestart({ payloadPath: outcome.installedPayloadPath, port });
      res.json({ ...outcome, isRestarting: restart.isRestarting });
      return;
    }
    res.status(HTTP_CONFLICT).json({ reason: outcome.reason });
  });

  return router;
}

export { createUpdatesRouter };
