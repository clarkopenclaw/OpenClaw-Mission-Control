import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './server';

describe('GET /api/health', () => {
  it('returns 200 with status ok and a valid timestamp', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});
