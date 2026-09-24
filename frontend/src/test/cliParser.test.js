import { describe, it, expect } from 'vitest';
import {
  tokenize,
  parseFlags,
  getAutoCompletions,
  BANNER_TEXT,
  WELCOME_MESSAGE,
} from '../utils/cliParser.js';

describe('CLI Parser Utility', () => {
  describe('tokenize', () => {
    it('splits basic space-separated command words', () => {
      const tokens = tokenize('links list');
      expect(tokens).toEqual(['links', 'list']);
    });

    it('handles double-quoted strings as single tokens', () => {
      const tokens = tokenize('links create https://example.com --title "My Cool Link"');
      expect(tokens).toEqual([
        'links',
        'create',
        'https://example.com',
        '--title',
        'My Cool Link',
      ]);
    });

    it('handles single-quoted strings as single tokens', () => {
      const tokens = tokenize("links create https://example.com --title 'Another Title'");
      expect(tokens).toEqual([
        'links',
        'create',
        'https://example.com',
        '--title',
        'Another Title',
      ]);
    });

    it('handles empty strings and whitespace', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
    });

    it('handles multiple consecutive spaces between arguments', () => {
      const tokens = tokenize('echo    hello     world');
      expect(tokens).toEqual(['echo', 'hello', 'world']);
    });
  });

  describe('parseFlags', () => {
    it('parses long flags with values', () => {
      const tokens = ['links', 'create', 'https://example.com', '--custom', 'my-brand', '--limit', '100'];
      const { args, flags } = parseFlags(tokens);
      expect(args).toEqual(['links', 'create', 'https://example.com']);
      expect(flags).toEqual({
        custom: 'my-brand',
        limit: '100',
      });
    });

    it('parses boolean flags when no value follows', () => {
      const tokens = ['links', 'list', '--archived'];
      const { args, flags } = parseFlags(tokens);
      expect(args).toEqual(['links', 'list']);
      expect(flags).toEqual({ archived: true });
    });

    it('parses short flags', () => {
      const tokens = ['links', 'create', 'https://example.com', '-t', 'Title'];
      const { args, flags } = parseFlags(tokens);
      expect(args).toEqual(['links', 'create', 'https://example.com']);
      expect(flags).toEqual({ t: 'Title' });
    });
  });

  describe('getAutoCompletions', () => {
    it('returns commands starting with the typed prefix', () => {
      const results = getAutoCompletions('link');
      expect(results).toContain('links list');
      expect(results).toContain('links create');
      expect(results).toContain('links get');
      expect(results).toContain('links stats');
      expect(results).toContain('links delete');
    });

    it('returns empty array when prefix has no matches', () => {
      expect(getAutoCompletions('nonexistent-cmd')).toEqual([]);
    });

    it('returns empty array for empty input', () => {
      expect(getAutoCompletions('')).toEqual([]);
      expect(getAutoCompletions('   ')).toEqual([]);
    });
  });

  describe('constants', () => {
    it('includes banner version and welcome text', () => {
      expect(BANNER_TEXT).toContain('v1.0.4');
      expect(WELCOME_MESSAGE).toContain('Linkora Interactive CLI');
    });
  });
});
