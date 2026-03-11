import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

export type OperatorIdentity = {
  userId: string;
  source: 'header' | 'dev';
};

declare global {
  namespace Express {
    interface Request {
      operator?: OperatorIdentity;
    }
  }
}

export function requireOperator(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    const trustedHeader = request.header(config.authTrustHeader);
    const trustedHeaderValue = Array.isArray(trustedHeader) ? trustedHeader[0]?.trim() : trustedHeader?.trim();

    if (trustedHeaderValue) {
      request.operator = {
        userId: trustedHeaderValue,
        source: 'header',
      };
      next();
      return;
    }

    if (config.nodeEnv !== 'production' && config.devUser.trim()) {
      request.operator = {
        userId: config.devUser.trim(),
        source: 'dev',
      };
      next();
      return;
    }

    response.status(401).json({ error: 'Missing operator identity.' });
  };
}
