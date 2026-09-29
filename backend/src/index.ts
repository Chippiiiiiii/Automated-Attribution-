import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
