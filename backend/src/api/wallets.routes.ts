import { Router } from 'express';
import * as wallets from '../controllers/wallet.controller.js';

export const walletsRouter = Router();
walletsRouter.get('/:chain/:address', wallets.summary);
walletsRouter.get('/:chain/:address/transactions', wallets.transactions);
