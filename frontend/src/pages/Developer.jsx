import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Terminal,
  Key,
  Play,
  Code2,
  Activity,
  Plus,
  Download,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  RotateCw,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import ApiKeyTable from '../components/developer/ApiKeyTable';
import CreateApiKeyModal from '../components/developer/CreateApiKeyModal';
import ApiPlayground from '../components/developer/ApiPlayground';
import ApiCodeSnippets from '../components/developer/ApiCodeSnippets';
import ApiLogsViewer from '../components/developer/ApiLogsViewer';
import LinklyCliTerminal from '../components/developer/LinklyCliTerminal';
import { useConfirm } from '../context/ConfirmContext';
import { developerService, authService } from '../services';

const Developer = () => {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('keys');
  const [currentUser, setCurrentUser] = useState(null);
  const [keys, setKeys] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [legacyKey, setLegacyKey] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createdSecret, setCreatedSecret] = useState(null);
  const [rolledKeySecret, setRolledKeySecret] = useState(null);
  const [copiedRolledSecret, setCopiedRolledSecret] = useState(false);

  const fetchKeysAndMetrics = async () => {
    try {
      setIsLoading(true);
      const [keysRes, metricsRes, userRes] = await Promise.all([
        developerService.listKeys(),
        developerService.getMetrics(),
        authService.getCurrentUser(),
      ]);

      setKeys(keysRes.keys || []);
      setMetrics(metricsRes.metrics || null);
      setCurrentUser(userRes.user);
      setLegacyKey(userRes.user?.apiKey || '');
    } catch (err) {
      toast.error('Failed to load developer portal state');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchKeysAndMetrics();
  }, []);

  const handleRollKey = async (key) => {
    const confirmed = await confirm({
      title: 'Roll API Key Secret',
      message: `Rolling "${key.name}" will immediately invalidate the current secret and issue a brand-new secret. Any running external scripts or microservices will need the new secret.`,
      confirmText: 'Roll Key Secret',
      cancelText: 'Keep Current Secret',
      variant: 'warning',
      detail: `Prefix: ${key.prefix}... | Environment: ${key.environment?.toUpperCase()}`,
    });
    if (!confirmed) return;

    try {
      const res = await developerService.rollKey(key._id);
      setRolledKeySecret(res.rawSecret);
      toast.success('API Key rolled successfully');
      fetchKeysAndMetrics();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to roll key');
    }
  };

  const handleRevokeKey = async (id) => {
    const keyToRevoke = keys.find((k) => k._id === id);
    const confirmed = await confirm({
      title: 'Revoke API Key Permanently',
      message: `Are you sure you want to revoke this API key? This action is permanent and any applications, SDKs, or webhooks using this key will immediately be denied access.`,
      confirmText: 'Revoke Key',
      cancelText: 'Cancel',
      variant: 'danger',
      detail: keyToRevoke ? `Key: "${keyToRevoke.name}" (${keyToRevoke.maskedKey})` : undefined,
    });
    if (!confirmed) return;

    try {
      await developerService.revokeKey(id);
      toast.success('API Key revoked');
      fetchKeysAndMetrics();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to revoke key');
    }
  };

  const handleDownloadOpenApi = async () => {
    try {
      const spec = await developerService.getOpenApiSpec();
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linkly-openapi-v1.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('OpenAPI 3.1 specification downloaded');
    } catch {
      toast.error('Failed to export OpenAPI specification');
    }
  };

  const defaultKeyForPlayground =
    keys.find((k) => k.status === 'active')?.maskedKey || legacyKey;

  return (
    <>
      <Helmet>
        <title>Developer Portal — Linkly</title>
      </Helmet>
      <AppShell>
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-paper-100">
                Developer Portal
              </h1>
              <span className="badge-accent font-mono text-[11px]">
                REST API v1
              </span>
            </div>
            <p className="mt-1 text-sm text-paper-400">
              Enterprise link provisioning, programmatic analytics, scoped API keys, and token-bucket throttling.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('cli')}
              className={`btn btn-secondary text-xs ${
                activeTab === 'cli' ? 'border-accent-400 text-accent-400' : ''
              }`}
              title="Open Interactive In-Browser CLI Terminal"
            >
              <Terminal size={14} className="text-accent-400" />
              <span>Launch CLI</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadOpenApi}
              className="btn btn-secondary text-xs"
              title="Download OpenAPI 3.1 JSON Specification"
            >
              <Download size={14} />
              <span>OpenAPI Spec</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-xs"
            >
              <Plus size={15} />
              <span>Create API Key</span>
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Ribbon */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Active API Keys
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
              {metrics ? metrics.activeKeys : keys.filter((k) => k.status === 'active').length}
              <span className="text-xs text-paper-500 font-normal">
                ({keys.length} total)
              </span>
            </div>
          </div>

          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              24h Request Volume
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-accent-400">
              {metrics ? metrics.totalCalls24h.toLocaleString() : 0}
              <span className="text-xs text-paper-500 font-normal">calls</span>
            </div>
          </div>

          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Success Rate (24h)
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-paper-100">
              <span
                className={
                  (metrics?.successRate ?? 100) >= 95
                    ? 'text-accent-400'
                    : 'text-amber-400'
                }
              >
                {metrics ? `${metrics.successRate}%` : '100%'}
              </span>
              {metrics?.errorCalls24h > 0 && (
                <span className="text-xs text-rose-400">
                  ({metrics.errorCalls24h} errors)
                </span>
              )}
            </div>
          </div>

          <div className="panel p-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-paper-500">
              Avg API Latency
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-xl font-bold text-paper-100">
              <Clock size={16} className="text-paper-400" />
              <span>{metrics ? `${metrics.avgLatencyMs}ms` : '18ms'}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex border-b border-ink-700 overflow-x-auto">
          {[
            { id: 'keys', label: 'API Keys', icon: Key },
            { id: 'playground', label: 'Interactive Playground', icon: Play },
            { id: 'cli', label: 'Interactive CLI (linkly-cli)', icon: Terminal },
            { id: 'snippets', label: 'SDK Quickstarts', icon: Code2 },
            { id: 'logs', label: 'Request Logs & Audit', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-accent-400 text-accent-400'
                    : 'border-transparent text-paper-400 hover:text-paper-100'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: API Keys */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            {/* Terminal Teaser Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-accent-400/20 bg-accent-400/5 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg border border-accent-400/30 bg-ink-950 p-2 text-accent-400 shrink-0">
                  <Terminal size={18} />
                </div>
                <div>
                  <div className="font-semibold text-xs text-paper-100 flex items-center gap-2">
                    <span>Prefer the command line?</span>
                    <span className="badge text-[10px] bg-accent-400/20 text-accent-400 border border-accent-400/30">
                      linkly-cli v1.0.4
                    </span>
                  </div>
                  <div className="text-[11px] text-paper-400 mt-0.5">
                    Run <code className="font-mono text-accent-400 bg-ink-950 px-1 py-0.5 rounded">help</code>,{' '}
                    <code className="font-mono text-accent-400 bg-ink-950 px-1 py-0.5 rounded">links list</code>, or{' '}
                    <code className="font-mono text-accent-400 bg-ink-950 px-1 py-0.5 rounded">links create</code> directly inside the browser shell.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('cli')}
                className="btn btn-secondary btn-sm text-accent-400 hover:border-accent-400 whitespace-nowrap"
              >
                Open Terminal
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-paper-100">Manage API Keys</h2>
                <p className="text-xs text-paper-500">
                  Each API key is hashed using SHA-256 and granted specific permission scopes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="btn-primary text-xs"
              >
                <Plus size={14} />
                <span>New API Key</span>
              </button>
            </div>

            {isLoading ? (
              <Skeleton className="h-48" />
            ) : (
              <ApiKeyTable
                keys={keys}
                onRollKey={handleRollKey}
                onRevokeKey={handleRevokeKey}
              />
            )}
          </div>
        )}

        {/* Tab 2: Interactive Playground */}
        {activeTab === 'playground' && (
          <ApiPlayground
            activeKeys={keys.filter((k) => k.status === 'active')}
            defaultApiKey={defaultKeyForPlayground}
          />
        )}

        {/* Tab 3: Interactive CLI */}
        {activeTab === 'cli' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
                  <span>linkly-cli — Interactive Developer Shell</span>
                  <span className="badge text-[10px] bg-accent-400/10 text-accent-400 border border-accent-400/25">
                    Live Session
                  </span>
                </h2>
                <p className="text-xs text-paper-500">
                  Full Unix-style command line interface executing live against Linkly&apos;s Public API.
                </p>
              </div>
            </div>

            <LinklyCliTerminal
              activeApiKey={defaultKeyForPlayground}
              user={currentUser}
            />
          </div>
        )}

        {/* Tab 4: Code Snippets */}
        {activeTab === 'snippets' && (
          <ApiCodeSnippets
            apiKey={
              keys.find((k) => k.status === 'active')?.maskedKey || legacyKey || 'YOUR_API_KEY'
            }
          />
        )}

        {/* Tab 5: Live Request Logs */}
        {activeTab === 'logs' && <ApiLogsViewer />}
      </AppShell>

      {/* Modal: Create API Key */}
      <CreateApiKeyModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchKeysAndMetrics}
      />

      {/* Modal: Rolled Key Secret Reveal */}
      {rolledKeySecret && (
        <Modal
          open={Boolean(rolledKeySecret)}
          onClose={() => setRolledKeySecret(null)}
          title="API Key Rolled"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Your API key has been rotated. Copy this new secret immediately — it will not be shown again.
              </span>
            </div>

            <div>
              <span className="field-label">New Secret Key</span>
              <div className="relative flex items-center rounded-lg border border-ink-600 bg-ink-950 p-3">
                <span className="font-mono text-xs text-accent-400 break-all select-all pr-8">
                  {rolledKeySecret}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rolledKeySecret);
                    setCopiedRolledSecret(true);
                    toast.success('Key copied');
                    setTimeout(() => setCopiedRolledSecret(false), 2000);
                  }}
                  className="absolute right-2.5 rounded p-1.5 text-paper-400 hover:bg-ink-800 hover:text-paper-100 transition-colors"
                >
                  {copiedRolledSecret ? <Check size={14} className="text-accent-400" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => setRolledKeySecret(null)}
              >
                I have updated my applications with this secret
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default Developer;
