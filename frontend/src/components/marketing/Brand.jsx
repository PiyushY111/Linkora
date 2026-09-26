import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Brand({ compact = false }) {
  return (
    <Link to="/" className={`marketing-brand${compact ? ' marketing-brand--compact' : ''}`} aria-label="Linkora home">
      <span className="marketing-brand-mark"><ArrowUpRight size={23} strokeWidth={2.5} /></span>
      <span>linkora<span className="marketing-brand-dot">.</span></span>
    </Link>
  );
}
