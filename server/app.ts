import express from 'express';
import { config } from './config';
import { getDatabase } from './db/sqlite';
import { requireOperator } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createCockpitRouter } from './routes/cockpit';
import { createVoiceRouter } from './routes/voice';
import { getMissionPaths } from './services/content/missionPaths';

export function createApp() {
  const app = express();
  const db = getDatabase(config);
  const missionPaths = getMissionPaths(config);

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      voiceModeEnabled: config.voiceModeEnabled,
      missionRootExists: missionPaths.exists,
    });
  });

  app.use('/api', requireOperator(config));
  app.use('/api', createCockpitRouter({ db }));
  app.use('/api', createVoiceRouter({ db, config }));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'API route not found.' });
  });

  app.use(errorHandler);
  return app;
}
