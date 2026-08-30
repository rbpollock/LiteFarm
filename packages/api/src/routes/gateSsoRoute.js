import express from 'express';
const router = express.Router();
import gateSsoController from '../controllers/gateSsoController.js';

// Mounted before the global checkJwt in server.ts (like /login): the fleet gate
// already authenticated, so this endpoint trusts the forwarded identity headers.
router.post('/', gateSsoController.gateSsoLogin());

export default router;
