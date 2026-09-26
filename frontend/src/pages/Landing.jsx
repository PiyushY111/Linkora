import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronDown,
  Code2, Crosshair, Globe2, Link2, Menu, Plus, QrCode, ShieldCheck,
  Sparkles, Users, X,
} from 'lucide-react';
import Brand from '../components/marketing/Brand';
import ProductPreview, { DemoQR, MiniBars } from '../components/marketing/ProductPreview';
import { getHostedDomain } from '../utils/domain';
import '../styles/marketing.css';

const FAQS = [
  ['What can I do with Linkora?', 'Turn long URLs into short, shareable links, create custom QR codes, and see how people engage with what you share. Keep everything organized in one workspace, whether you are sharing your own work or running a campaign with your team.'],
  ['Can I choose my own short link?', 'Yes. Add a custom alias when you create a link to make the address memorable and easy to recognize. You can also add campaign tags to understand where your traffic comes from.'],
  ['What can I learn from my link analytics?', 'See clicks over time and explore countries, devices, browsers, and referrers. Filter by a time range to understand how your audience finds and interacts with your links.'],
  ['Can I use Linkora with my team?', 'Absolutely. Choose a team account at signup, give your workspace a name, and invite your teammates. Workspace roles help you control who can create links, view analytics, and manage settings.'],
  ['Can I change a link after sharing it?', 'Yes. Update a link’s destination from your workspace while keeping the same short URL. You can also pause a link or add an expiration date when a campaign is finished.'],
];

const NAV_ITEMS = [['Features', '#features'], ['How it works', '#how-it-works'], ['FAQs', '#faqs']];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const hostedDomain = getHostedDomain();

  return (
    <div className="marketing-theme landing-page">
      <Helmet>
        <title>Linkora — Small links. Big possibilities.</title>
        <meta name="description" content="Create memorable short links, custom QR codes, and meaningful connections. Get clear click analytics and bring your team together with Linkora." />
      </Helmet>
      <a href="#main-content" className="marketing-skip">Skip to content</a>
      <header className="marketing-header">
        <div className="marketing-container marketing-header-inner">
          <Brand />
          <nav className="marketing-desktop-nav" aria-label="Main navigation">
            {NAV_ITEMS.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="marketing-header-actions"><Link to="/login" className="marketing-login-link">Log in</Link><Link to="/register" className="marketing-button marketing-button--small">Get started <ArrowUpRight size={15} /></Link></div>
          <button className="marketing-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
        </div>
        {menuOpen && <nav className="marketing-mobile-nav" id="mobile-navigation" aria-label="Mobile navigation" onKeyDown={(event) => { if (event.key === 'Escape') setMenuOpen(false); }}>
          {NAV_ITEMS.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}<ArrowUpRight size={15} /></a>)}
          <Link to="/login">Log in<ArrowRight size={15} /></Link>
        </nav>}
      </header>

      <main id="main-content">
        <section className="marketing-hero">
          <div className="hero-ambient" aria-hidden="true" />
          <div className="marketing-container hero-content">
            <a className="hero-announcement" href="#features"><span><Sparkles size={12} /> MEET LINKORA</span> A little link goes a long way <ArrowRight size={13} /></a>
            <h1>Small links.<br /><span>Big possibilities.</span><span className="hero-asterisk" aria-hidden="true">✳</span></h1>
            <p>Everything you share deserves a better link.<br className="desktop-break" /> Shorten, customize, and track. Make every connection count.</p>
            <div className="hero-actions"><Link to="/register" className="marketing-button">Start making connections <ArrowUpRight size={18} /></Link><a href="#platform" className="marketing-button marketing-button--secondary">Take a closer look <ArrowDown size={16} /></a></div>
            <div className="hero-reassurance"><span><Check size={13} /> No credit card needed</span><span><Check size={13} /> Ready in minutes</span></div>
            <ProductPreview />
          </div>
        </section>

        <div className="marketing-container audience-strip"><span>FOR EVERYTHING<br />YOU PUT OUT THERE.</span><p><Globe2 size={20} /> Your next big launch</p><p><Users size={20} /> Your growing community</p><p><Sparkles size={20} /> Your everyday ideas</p></div>

        <section className="marketing-container marketing-features" id="features">
          <div className="marketing-section-heading"><div><span className="marketing-eyebrow"><span className="tiny-dot" /> SMALL LINK. FULL PICTURE.</span><h2>More than a shortcut.<br /><span>A way forward.</span></h2></div><p>From the first click to your next big milestone.<br />Everything you need to share with intention.</p></div>
          <div className="feature-grid">
            <article className="feature-card feature-card--links">
              <div className="feature-copy"><span className="feature-icon"><Link2 size={20} /></span><h3>Long story. Short link.</h3><p>Trade the endless URL for something clean, memorable, and unmistakably yours.</p></div>
              <div className="feature-link-demo" aria-label="A long URL transformed into a custom short link"><div className="long-url"><Globe2 size={15} /><span>yourwebsite.com/collection?ref=summer&amp;campaign=launch</span></div><span className="link-demo-connector"><ArrowDown size={17} /></span><div className="short-url"><span className="short-url-icon"><Link2 size={17} /></span><span>{hostedDomain}/<strong>your-next-idea</strong></span><Check size={16} /></div></div>
              <span className="feature-footnote">LESS TO TYPE. MORE TO REMEMBER.</span>
            </article>
            <article className="feature-card feature-card--analytics">
              <div className="feature-copy"><span className="feature-icon"><BarChart3 size={20} /></span><h3>Every click has a story.</h3><p>Meet your audience. Understand what connects, where they come from, and what works.</p></div>
              <div className="feature-analytics-demo"><div><span>Total clicks</span><strong>24,848 <small>↗ 18.6%</small></strong></div><MiniBars /><div className="chart-axis"><span>MON</span><span>WED</span><span>FRI</span><span>SUN</span></div></div>
              <span className="feature-footnote">ILLUSTRATIVE ANALYTICS</span>
            </article>
            <article className="feature-card feature-card--qr">
              <div className="feature-copy"><span className="feature-icon"><QrCode size={20} /></span><h3>Make the real world clickable.</h3><p>On a package, a poster, or your next big idea. Custom QR codes open up a world of connection.</p></div>
              <div className="feature-qr-demo"><div className="feature-qr-paper"><DemoQR size={116} /><span>GOOD THINGS THIS WAY <ArrowUpRight size={11} /></span></div><div className="feature-qr-note">A little scan.<br />A new possibility.<svg viewBox="0 0 75 46" aria-hidden="true"><path d="M68 4C70 32 30 47 7 26M7 26l14 2M7 26l5 12" /></svg></div></div>
            </article>
            <article className="feature-card feature-card--team">
              <div className="feature-copy"><span className="feature-icon"><Users size={20} /></span><h3>Good together. Better connected.</h3><p>A shared space for the links, people, and ideas moving your work forward. Everyone in sync.</p></div>
              <div className="feature-team-demo"><div className="team-demo-heading"><div><span className="team-workspace-icon"><Users size={18} /></span><span>The creative studio<small>One workspace. Shared possibilities.</small></span></div><span className="team-demo-label">TEAM WORKSPACE</span></div><div className="team-people"><div className="team-avatars"><span>JD</span><span>AK</span><span>ML</span><span>+2</span></div><span className="team-invite-icon"><Plus size={17} /></span><span>Room for your whole team</span></div><div className="team-roles"><span><Check size={12} /> Shared links</span><span><Check size={12} /> Custom roles</span><span><Check size={12} /> One clear view</span></div></div>
            </article>
          </div>
          <div className="extra-features">{[
            [ShieldCheck, 'Share with confidence', 'Password protection and link expiration put you in control.'],
            [Code2, 'Fits right into your workflow', 'An API and webhooks to connect with the tools you already use.'],
            [Crosshair, 'Find your next best move', 'Campaign tags and A/B testing turn clicks into clearer decisions.'],
          ].map(([Icon, title, copy]) => <div key={title}><Icon size={19} /><h3>{title}</h3><p>{copy}</p></div>)}</div>
        </section>

        <section className="how-section" id="how-it-works"><div className="marketing-container"><div className="marketing-section-heading"><div><span className="marketing-eyebrow"><span className="tiny-dot" /> LESS FRICTION. MORE CONNECTION.</span><h2>From long URL<br /><span>to your next opportunity.</span></h2></div><Link to="/register" className="marketing-text-link">Let’s make your first link <ArrowUpRight size={17} /></Link></div><div className="how-steps">{[
          ['01', Link2, 'Make it yours.', 'Drop in your destination. Choose a memorable short link and add your own touch.'],
          ['02', ArrowUpRight, 'Put it out there.', 'Share it in your bio, your next campaign, or the real world with a custom QR code.'],
          ['03', BarChart3, 'See what connects.', 'Follow the clicks, get to know your audience, and make your next move with clarity.'],
        ].map(([number, Icon, title, copy]) => <article key={number}><div className="how-step-top"><span>{number}</span><Icon size={23} /></div><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

        <section className="marketing-container faq-section" id="faqs"><div><span className="marketing-eyebrow"><span className="tiny-dot" /> A FEW GOOD QUESTIONS</span><h2>Glad you asked.</h2><p>The little details, before your first little link.</p></div><div className="faq-list">{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></section>

        <section className="marketing-container final-cta"><div className="cta-decoration" aria-hidden="true"><ArrowUpRight /></div><div><span className="marketing-eyebrow">BIG THINGS START SMALL.</span><h2>Your next connection<br />is a link away.</h2><p>Make it short. Make it yours. See where it takes you.</p><Link to="/register" className="marketing-button">Get started with Linkora <ArrowUpRight size={18} /></Link></div><span className="cta-corner-label">GO ON. PUT IT OUT THERE. ↗</span></section>
      </main>

      <footer className="marketing-footer marketing-container"><div className="footer-main"><div><Brand /><p>A little link. A world of possibility.</p></div><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#faqs">FAQs</a><Link to="/login">Log in <ArrowUpRight size={13} /></Link></nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Linkora. Made for connection.</span><a href="#main-content">Back to top <ArrowUpRight size={13} /></a></div></footer>
    </div>
  );
}
