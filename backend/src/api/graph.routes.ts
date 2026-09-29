import { Router } from 'express';
import * as graph from '../controllers/graph.controller.js';

export const graphRouter = Router();
graphRouter.get('/:chain/:address', graph.get);
