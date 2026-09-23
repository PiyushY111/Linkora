import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Zap,
  ShieldCheck,
  Webhook,
  Building2,
  Gauge,
  GitBranch,
  ScrollText,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Gauge,
    title: 'Sub-25ms redirects',
    description:
      'Redis read-through cache on the hot path. Zero synchronous database writes — click events stream asynchronously.',
    featured: true,
  },
  {
    icon: GitBranch,
    title: 'Real-time analytics',
    description: 'Every click enriched with geo and device data, queryable in ClickHouse in under a second.',
  },
  {
    icon: ShieldCheck,
    title: 'SSRF & threat protection',
    description: 'Destination URLs are DNS-validated and screened against threat intel before a link goes live.',
  },
  {
    icon: Building2,
    title: 'Workspaces & RBAC',
    description: 'Owner, admin, creator, viewer roles. Enterprise SSO via SAML/OIDC.',
  },
  {
    icon: Webhook,
    title: 'Signed webhooks',
    description: 'HMAC-signed delivery for clicks, expirations, and abuse flags, with retry and a dead-letter queue.',
  },
  {
    icon: ScrollText,
    title: 'Full audit trail',
    description: 'Every mutation — logins, link edits, role changes — recorded with actor, IP, and diff.',
  },
];

const STATS = [
  { value: '<25ms', label: 'p95 redirect latency' },
  { value: '99.99%', label: 'target uptime' },
  { value: '10M+', label: 'links per workspace' },
];

const Sparkline = () => (
  <svg viewBox="0 0 240 64" className="h-16 w-full" preserveAspectRatio="none">
    <polyline
      points="0,48 24,42 48,44 72,28 96,32 120,18 144,22 168,10 192,16 216,6 240,12"
      fill="none"
      stroke="#C6FF3D"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polygon
      points="0,48 24,42 48,44 72,28 96,32 120,18 144,22 168,10 192,16 216,6 240,12 240,64 0,64"
      fill="url(#sparkline-fade)"
    />
    <defs>
      <linearGradient id="sparkline-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C6FF3D" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#C6FF3D" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

const ProductPreview = () => (
  <div className="panel-elevated relative mx-auto w-full max-w-xl overflow-hidden p-1.5">
    <div className="flex items-center gap-1.5 px-3 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
      <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
      <span className="ml-3 truncate font-mono text-xs text-paper-500">linkora.io/dashboard</span>
    </div>
    <div className="rounded-lg bg-ink-950 p-5">
      <div className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="badge-accent shrink-0">307</span>
          <span className="truncate font-mono text-sm text-paper-100">linkora.io/x7K9mP</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-paper-500">18ms</span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-paper-500">Clicks</p>
          <p className="mt-1 font-mono text-xl font-bold text-paper-100">42.8k</p>
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-paper-500">Unique</p>
          <p className="mt-1 font-mono text-xl font-bold text-paper-100">31.2k</p>
        </div>
        <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-paper-500">Countries</p>
          <p className="mt-1 font-mono text-xl font-bold text-paper-100">64</p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-ink-700 bg-ink-900 p-3">
        <Sparkline />
      </div>
    </div>
  </div>
);

const Landing = () => {
  return (
    <>
      <Helmet>
        <title>Linkora — Links, engineered</title>
      </Helmet>

      <div className="min-h-screen bg-ink-950 text-paper-100">
        <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="Linkora" width={28} height={28} />
              <span className="text-base font-bold tracking-tight">Linkora</span>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost btn-sm">Sign in</Link>
              <Link to="/register" className="btn-primary btn-sm">
                Get started <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </header>

        <section className="relative overflow-hidden bg-grid">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-950 via-transparent to-ink-950" />
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="badge-accent">Enterprise-grade link infrastructure</span>
                <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                  Short links that run like <span className="text-accent-400">production infrastructure.</span>
                </h1>
                <p className="mt-5 max-w-lg text-balance text-lg text-paper-300">
                  Redis-cached redirects, ClickHouse-backed analytics, signed webhooks, and workspace RBAC —
                  built for teams who treat their link layer as a real system, not a form.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link to="/register" className="btn-primary">
                    Start shortening <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" className="btn-secondary">
                    Sign in
                  </Link>
                </div>
                <div className="mt-10 flex flex-wrap gap-x-8 gap-y-4">
                  {STATS.map((stat) => (
                    <div key={stat.label}>
                      <p className="font-mono text-2xl font-bold text-paper-100">{stat.value}</p>
                      <p className="text-xs text-paper-500">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                <ProductPreview />
              </motion.div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="mb-10 max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              The parts that are usually an afterthought, aren&apos;t.
            </h2>
            <p className="mt-3 text-paper-400">
              Every one of these is a real subsystem in Linkora, not a marketing bullet.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description, featured }) => (
              <div
                key={title}
                className={`group rounded-xl border p-6 shadow-panel transition-colors ${
                  featured
                    ? 'border-accent-400/30 bg-accent-400/[0.06] hover:border-accent-400/50'
                    : 'border-ink-700 bg-ink-900 hover:border-ink-500'
                }`}
              >
                <div
                  className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${
                    featured ? 'bg-accent-400/15 ring-accent-400/30' : 'bg-ink-800 ring-ink-600'
                  }`}
                >
                  <Icon size={18} className={featured ? 'text-accent-400' : 'text-paper-300'} />
                </div>
                <h3 className="text-base font-semibold text-paper-100">{title}</h3>
                <p className="mt-1.5 text-sm text-paper-400">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="panel-elevated flex flex-col items-center gap-5 px-6 py-14 text-center">
            <Zap className="text-accent-400" size={28} />
            <h2 className="text-balance text-2xl font-bold sm:text-3xl">Ready to ship faster links?</h2>
            <p className="max-w-md text-paper-400">
              Create an account and generate your first tracked short link in under a minute.
            </p>
            <Link to="/register" className="btn-primary">
              Get started free <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <footer className="border-t border-ink-700/60 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-paper-500">
              <img src="/logo.svg" alt="" width={18} height={18} />
              Linkora
            </div>
            <p className="text-xs text-paper-500">Built on Redis, MongoDB &amp; ClickHouse.</p>
          </div>
        </footer>
      </div>
    </>
  );
};

export default Landing;
