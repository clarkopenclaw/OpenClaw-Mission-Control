import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { getCockpitHome } from '../services/cockpit/cockpitQueryService';

type CockpitRouterDependencies = {
  db: DatabaseSync;
};

export function createCockpitRouter({ db }: CockpitRouterDependencies) {
  const router = Router();

  router.get('/cockpit/home', (_request, response, next) => {
    try {
      response.json(getCockpitHome(db));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
