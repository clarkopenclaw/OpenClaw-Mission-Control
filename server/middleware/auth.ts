import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../config';

export type OperatorIdentity = {
  userId: string;
  source: 'header' | 'dev';
};

export type OperatorRequest = Request & {
  operator?: OperatorIdentity;
};

export function requireOperator(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    const operatorRequest = request as OperatorRequest;
    const trustedHeader = operatorRequest.header(config.authTrustHeader);
    const trustedHeaderValue = Array.isArray(trustedHeader) ? trustedHeader[0]?.trim() : trustedHeader?.trim();

    if (trustedHeaderValue) {
      operatorRequest.operator = {
        userId: trustedHeaderValue,
        source: 'header',
      };
      next();
      return;
    }

    if (config.nodeEnv !== 'production' && config.devUser.trim()) {
      operatorRequest.operator = {
        userId: config.devUser.trim(),
        source: 'dev',
      };
      next();
      return;
    }

    response.status(401).json({ error: 'Missing operator identity.' });
  };
}
