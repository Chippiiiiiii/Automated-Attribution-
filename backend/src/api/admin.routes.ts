import { Router } from 'express';
import { SUPPORTED_CHAINS } from '../config/networks.js';
import { env } from '../config/env.js';
import { authenticate, currentUser, requireRole } from '../middleware/auth.js';
import { providerStatus } from '../blockchain/registry.js';
import { loadRiskConfig, saveRiskConfig } from '../risk/config.js';
import { loadAttributionConfig, saveAttributionConfig } from '../attribution/config.js';
import { resetDemoData } from '../cases/demo-reset.service.js';

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

// Read-only view of non-secret runtime configuration.
adminRouter.get('/config', (_req, res) => {
  res.json({ chains: SUPPORTED_CHAINS, blockchainProvider: env.BLOCKCHAIN_PROVIDER, sahyogMode: env.SAHYOG_MODE });
});

adminRouter.get('/providers', (_req, res) => {
  res.json(providerStatus());
});

adminRouter.get('/attribution-config', async (_req, res) => {
  res.json(await loadAttributionConfig());
});
adminRouter.put('/attribution-config', async (req, res) => {
  res.json(await saveAttributionConfig(req.body, currentUser(req).id));
});

adminRouter.get('/risk-config', async (_req, res) => {
  res.json(await loadRiskConfig());
});
adminRouter.put('/risk-config', async (req, res) => {
  res.json(await saveRiskConfig(req.body, currentUser(req).id));
});

// Returns the seeded demo cases and scoring config to a clean state before a demonstration.
adminRouter.post('/demo-reset', async (req, res) => {
  res.json(await resetDemoData(currentUser(req).id));
});
