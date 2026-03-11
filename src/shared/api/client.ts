import type { ZodType } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function parsePayload(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestJson<TOutput>(input: RequestInfo | URL, init: RequestInit, schema: ZodType<TOutput>): Promise<TOutput> {
  const response = await fetch(input, init);
  const payload = await parsePayload(response);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  return schema.parse(payload);
}

export function apiGet<TOutput>(path: string, schema: ZodType<TOutput>): Promise<TOutput> {
  return requestJson(path, { method: 'GET' }, schema);
}

export function apiPost<TInput, TOutput>(path: string, body: TInput, schema: ZodType<TOutput>): Promise<TOutput> {
  return requestJson(
    path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    schema,
  );
}
