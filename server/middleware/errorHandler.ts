import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
      details: error.details ?? null,
    });
    return;
  }

  console.error(error);
  response.status(500).json({ error: 'Internal server error.' });
};
