import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { bioPageService } from '../../../services';
import { getHostedDomain } from '../../../utils/domain';

const SLUG_CHECK_DEBOUNCE_MS = 400;

/**
 * Availability of `slug`, checked against the server once typing pauses.
 * The page's own saved slug counts as 'current', not 'taken'.
 * @returns {'idle' | 'checking' | 'available' | 'current' | 'taken' | 'invalid' | 'error'}
 */
export function useSlugAvailability(slug, currentSlug) {
  const [result, setResult] = useState({ slug: '', status: 'idle' });
  const normalized = slug.trim().toLowerCase();

  useEffect(() => {
    if (!normalized || normalized === currentSlug) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await bioPageService.checkSlug(normalized, { signal: controller.signal });
        setResult({ slug: normalized, status: res.available ? 'available' : res.reason || 'taken' });
      } catch (err) {
        if (!controller.signal.aborted) setResult({ slug: normalized, status: 'error' });
      }
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, currentSlug]);

  if (!normalized) return 'idle';
  if (normalized === currentSlug) return 'current';
  return result.slug === normalized ? result.status : 'checking';
}

const STATUS_MESSAGES = {
  checking: { icon: Loader2, className: 'text-paper-400', text: 'Checking availability…', spin: true },
  available: { icon: Check, className: 'text-accent-400', text: 'Available' },
  current: { icon: Check, className: 'text-paper-400', text: 'Your current address' },
  taken: { icon: X, className: 'text-rose-400', text: 'Already taken' },
  invalid: {
    icon: X,
    className: 'text-rose-400',
    text: '3–40 lowercase letters, numbers or hyphens; no hyphen at the start or end',
  },
  error: { icon: X, className: 'text-amber-400', text: "Couldn't check availability right now" },
};

const SlugField = ({ value, onChange, status, disabled }) => {
  const message = STATUS_MESSAGES[status];
  const Icon = message?.icon;

  return (
    <div>
      <label htmlFor="bio-slug" className="field-label">
        Page address
      </label>
      <div className="flex items-center overflow-hidden rounded-lg border border-ink-600 bg-ink-900 focus-within:border-accent-400">
        <span className="shrink-0 border-r border-ink-700 bg-ink-950 px-3 py-2 font-mono text-xs text-paper-500">
          {getHostedDomain()}/b/
        </span>
        <input
          id="bio-slug"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          disabled={disabled}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="bio-slug-status"
          className="w-full bg-transparent px-3 py-2 font-mono text-sm text-paper-100 outline-none disabled:opacity-60"
        />
      </div>
      <p id="bio-slug-status" aria-live="polite" className={`mt-1.5 flex items-center gap-1.5 text-xs ${message?.className ?? ''}`}>
        {Icon && <Icon size={12} className={message.spin ? 'animate-spin' : ''} />}
        {message?.text}
      </p>
    </div>
  );
};

export default SlugField;
