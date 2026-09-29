import { Router } from 'express';
import * as intel from '../controllers/intel.controller.js';

export const intelRouter = Router();
intelRouter.get('/vasps', intel.vasps);
intelRouter.get('/:chain/:address', intel.lookup);
