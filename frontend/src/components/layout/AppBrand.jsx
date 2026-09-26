import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * In-app "linkora." lockup. Mirrors the marketing Brand mark (accent tile +
 * up-right arrow) without pulling in marketing.css.
 *
 * @param {{ onNavigate?: () => void }} props
 */
export default function AppBrand({ onNavigate }) {
  return (
    <Link
      to="/dashboard"
      onClick={onNavigate}
      aria-label="Linkora, go to your links"
      className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-400 text-ink-950 transition-transform duration-200 ease-out group-hover:-rotate-6">
        <ArrowUpRight size={21} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.06em] text-paper-100">
        linkora<span className="text-paper-500">.</span>
      </span>
    </Link>
  );
}
