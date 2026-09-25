import { describe, it, expect } from 'vitest';
import { describeActivity } from '../utils/activityFormat.js';

describe('describeActivity', () => {
  it('describes known actions from their diff', () => {
    expect(describeActivity({ action: 'link.create', diff: { shortCode: 'abc' } })).toEqual({ label: 'Created link', target: '/abc' });
    expect(describeActivity({ action: 'workspace.invite.create', diff: { email: 'a@b.co', role: 'viewer', resent: true } })).toEqual({
      label: 'Resent invite as viewer',
      target: 'a@b.co',
    });
    expect(describeActivity({ action: 'workspace.settings.update', diff: { changedFields: ['defaultUtmParams'] } }).target).toBe(
      'defaultUtmParams'
    );
  });

  it('copes with a missing diff', () => {
    expect(describeActivity({ action: 'link.delete' })).toEqual({ label: 'Deleted link', target: 'a link' });
  });

  it('falls back to the raw action for anything new', () => {
    expect(describeActivity({ action: 'domain.verify', targetResourceId: 'd1' })).toEqual({ label: 'domain.verify', target: 'd1' });
  });
});
