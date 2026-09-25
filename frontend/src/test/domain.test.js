import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getHostedDomain, getHostedOrigin } from '../utils/domain';

describe('domain utilities', () => {
  const originalEnv = { ...import.meta.env };
  const originalWindow = globalThis.window;

  beforeEach(() => {
    delete import.meta.env.VITE_SHORT_DOMAIN;
    delete import.meta.env.VITE_PUBLIC_URL;
    delete import.meta.env.VITE_FRONTEND_URL;
  });

  afterEach(() => {
    Object.assign(import.meta.env, originalEnv);
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('falls back to localhost:3000 when window is not defined', () => {
    delete globalThis.window;
    expect(getHostedDomain()).toBe('localhost:3000');
    expect(getHostedOrigin()).toBe('http://localhost:3000');
  });

  it('resolves hosted domain from window.location.host when window is defined', () => {
    globalThis.window = {
      location: {
        host: 'my-custom-domain.com',
        origin: 'https://my-custom-domain.com',
      },
    };
    expect(getHostedDomain()).toBe('my-custom-domain.com');
    expect(getHostedOrigin()).toBe('https://my-custom-domain.com');
  });

  it('respects VITE_SHORT_DOMAIN environment variable when configured', () => {
    import.meta.env.VITE_SHORT_DOMAIN = 'custom.link';
    expect(getHostedDomain()).toBe('custom.link');
  });

  it('extracts host correctly from full URL in VITE_PUBLIC_URL', () => {
    import.meta.env.VITE_PUBLIC_URL = 'https://short.mybrand.io:8080/path';
    expect(getHostedDomain()).toBe('short.mybrand.io:8080');
    expect(getHostedOrigin()).toBe('https://short.mybrand.io:8080/path');
  });
});
