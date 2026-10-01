import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';

describe('loadConfig apiHost', () => {
  it('listens on loopback by default (no-auth API must not reach the LAN)', () => {
    expect(loadConfig({}).apiHost).toBe('localhost');
  });

  it('honours an explicit API_HOST', () => {
    expect(loadConfig({ API_HOST: '0.0.0.0' }).apiHost).toBe('0.0.0.0');
  });
});
