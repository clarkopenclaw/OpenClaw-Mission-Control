import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  createVoiceSessionInputSchema,
  createVoiceSessionResponseSchema,
  listVoiceSessionsResponseSchema,
  voiceSessionDetailSchema,
} from '../../shared/schemas/voice';
import type { AppConfig } from '../config';
import { HttpError } from '../middleware/errorHandler';
import { createVoiceSession, getVoiceSessionDetail, listVoiceSessions } from '../services/voice/voiceSessionService';

type VoiceRouterDependencies = {
  db: DatabaseSync;
  config: AppConfig;
};

const listVoiceSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export function createVoiceRouter({ db, config }: VoiceRouterDependencies) {
  const router = Router();

  router.get('/voice-sessions', (request, response, next) => {
    try {
      const query = listVoiceSessionsQuerySchema.parse(request.query);
      response.json(
        listVoiceSessionsResponseSchema.parse({
          sessions: listVoiceSessions(db, query.limit ?? 10),
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/voice-sessions', (request, response, next) => {
    try {
      if (!config.voiceModeEnabled) {
        throw new HttpError(404, 'Voice Mode is disabled.');
      }

      const input = createVoiceSessionInputSchema.parse(request.body);
      const session = createVoiceSession(db, input, request.operator?.userId ?? 'unknown');

      response.status(201).json(
        createVoiceSessionResponseSchema.parse({
          session,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/voice-sessions/:sessionId', (request, response, next) => {
    try {
      const detail = getVoiceSessionDetail(db, request.params.sessionId);

      if (!detail) {
        throw new HttpError(404, `Voice session ${request.params.sessionId} was not found.`);
      }

      response.json(voiceSessionDetailSchema.parse(detail));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
