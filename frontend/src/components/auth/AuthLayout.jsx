import { useEffect } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Link2, MousePointer2, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Brand from '../marketing/Brand';
import { PerformanceChart } from '../marketing/ProductPreview';
import { getHostedDomain } from '../../utils/domain';
import '../../styles/marketing.css';

export default function AuthLayout({ children, register = false }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  return (
    <div className={`marketing-theme auth-page${register ? ' auth-page--register' : ''}`}>
      <a href="#auth-content" className="marketing-skip">Skip to form</a>
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="marketing-eyebrow"><span className="tiny-dot" /> A LITTLE LINK. A WORLD OF POSSIBILITY.</span>
          <h2>{register ? <>Your next big idea.<br /><span>One small link.</span></> : <>Good things start<br />with <span>a connection.</span></>}</h2>
          <p>Make every link a little more powerful.<br />Create, share, and see what happens next.</p>
          <div className="auth-artwork">
            <div className="auth-orbit auth-orbit--one" /><div className="auth-orbit auth-orbit--two" />
            <div className="auth-link-card">
              <div className="auth-link-card-top"><span className="auth-link-symbol"><Link2 size={21} /></span><div>Your next great thing<small>{getHostedDomain()}/something-great</small></div><ArrowUpRight size={18} /></div>
              <div className="auth-link-card-stats"><span><MousePointer2 size={14} /> Total connections</span><strong>12,846 <small>↗ 24.8%</small></strong></div>
              <PerformanceChart compact />
              <div className="auth-chart-footer"><span>Big ideas. Measurable impact.</span><span>Illustrative data</span></div>
            </div>
            <div className="auth-link-notification"><span><Check size={14} /></span> A shorter link. A bigger possibility.</div>
          </div>
          <div className="auth-story-benefits"><span><Check size={14} /> Links that feel like you</span><span><Check size={14} /> Insights that make sense</span></div>
        </div>
        <div className="auth-story-footer"><span>MADE FOR WHAT YOU SHARE NEXT.</span><ArrowUpRight size={19} /></div>
      </aside>
      <div className="auth-main">
        <header className="auth-topbar">
          <Link to="/" className="auth-back"><ArrowLeft size={15} /><span>Back to home</span></Link>
          <p>{register ? 'Already a member?' : 'New to Linkora?'} <Link to={register ? '/login' : '/register'} state={location.state}>{register ? 'Sign in' : 'Sign up'}<ArrowUpRight size={13} /></Link></p>
        </header>
        <main id="auth-content" className="auth-content">{children}</main>
        <footer className="auth-footer"><ShieldCheck size={14} /><span>Your next connection starts here.</span><span>© {new Date().getFullYear()} Linkora</span></footer>
      </div>
    </div>
  );
}
