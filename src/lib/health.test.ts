import { getHealthStatus } from './health';

declare const describe: (name: string, run: () => void) => void;
declare const it: (name: string, run: () => void) => void;

function expectEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function expectInRange(actual: number, min: number, max: number) {
  if (actual < min || actual > max) {
    throw new Error(`Expected ${actual} to be between ${min} and ${max}`);
  }
}

describe('getHealthStatus', () => {
  it('returns the expected health payload', () => {
    const before = Date.now();
    const health = getHealthStatus();
    const after = Date.now();

    expectEqual(health.status, 'ok');
    expectEqual(health.version, '0.1.0');
    expectInRange(health.timestamp, before, after);
  });
});
