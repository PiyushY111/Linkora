import { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  Code2,
  Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { publicApiService } from '../../services';

const ENDPOINTS_PRESETS = [
  {
    id: 'create_link',
    label: 'POST /links — Create Short Link',
    method: 'POST',
    path: '/links',
    defaultBody: JSON.stringify(
      {
        originalUrl: 'https://github.com/features/actions',
        title: 'GitHub Actions Documentation',
        tags: ['devops', 'ci-cd'],
        maxClicks: 500,
      },
      null,
      2
    ),
  },
  {
    id: 'list_links',
    label: 'GET /links — List Links',
    method: 'GET',
    path: '/links?limit=10&page=1',
    defaultBody: '',
  },
  {
    id: 'get_link',
    label: 'GET /links/:code — Get Link Metadata',
    method: 'GET',
    path: '/links/SAMPLE_CODE',
    defaultBody: '',
  },
  {
    id: 'update_link',
    label: 'PATCH /links/:code — Update Link Destination',
    method: 'PATCH',
    path: '/links/SAMPLE_CODE',
    defaultBody: JSON.stringify(
      {
        originalUrl: 'https://github.com/features/packages',
        title: 'Updated Destination URL',
      },
      null,
      2
    ),
  },
  {
    id: 'delete_link',
    label: 'DELETE /links/:code — Delete Link',
    method: 'DELETE',
    path: '/links/SAMPLE_CODE',
    defaultBody: '',
  },
  {
    id: 'link_analytics',
    label: 'GET /links/:code/analytics — Link Analytics',
    method: 'GET',
    path: '/links/SAMPLE_CODE/analytics',
    defaultBody: '',
  },
  {
    id: 'bulk_create',
    label: 'POST /links/bulk — Bulk Shorten Links',
    method: 'POST',
    path: '/links/bulk',
    defaultBody: JSON.stringify(
      {
        links: [
          'https://react.dev',
          'https://nodejs.org',
          'https://tailwindcss.com',
        ],
      },
      null,
      2
    ),
  },
  {
    id: 'get_usage',
    label: 'GET /usage — Rate Limits & Quota',
    method: 'GET',
    path: '/usage',
    defaultBody: '',
  },
];

const METHOD_COLORS = {
  GET: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  POST: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
};

const ApiPlayground = ({ activeKeys = [], defaultApiKey = '' }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS_PRESETS[0]);
  const [selectedKey, setSelectedKey] = useState(defaultApiKey);
  const [method, setMethod] = useState(ENDPOINTS_PRESETS[0].method);
  const [path, setPath] = useState(ENDPOINTS_PRESETS[0].path);
  const [requestBody, setRequestBody] = useState(ENDPOINTS_PRESETS[0].defaultBody);
  const [activeTab, setActiveTab] = useState('body');
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState(null);
  const [copiedResponse, setCopiedResponse] = useState(false);

  useEffect(() => {
    if (defaultApiKey && !selectedKey) {
      setSelectedKey(defaultApiKey);
    }
  }, [defaultApiKey]);

  const handleSelectPreset = (preset) => {
    setSelectedEndpoint(preset);
    setMethod(preset.method);
    setPath(preset.path);
    setRequestBody(preset.defaultBody);
    setResponse(null);
  };

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!selectedKey) {
      toast.error('Select or provide an API Key first');
      return;
    }

    setIsRunning(true);
    setResponse(null);

    let parsedPayload = null;
    if (method !== 'GET' && method !== 'DELETE' && requestBody.trim()) {
      try {
        parsedPayload = JSON.parse(requestBody);
      } catch (err) {
        toast.error('Invalid JSON body format');
        setIsRunning(false);
        return;
      }
    }

    try {
      const res = await publicApiService.executeRequest(
        selectedKey,
        method,
        path,
        parsedPayload
      );
      setResponse(res);
      if (res.status >= 200 && res.status < 300) {
        toast.success(`Request completed (${res.status} ${res.statusText || 'OK'})`);
      } else {
        toast.error(`Request failed with HTTP ${res.status}`);
      }
    } catch (err) {
      toast.error('Network request failed');
    } finally {
      setIsRunning(false);
    }
  };

  const copyResponseJson = () => {
    if (!response?.data) return;
    navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
    setCopiedResponse(true);
    toast.success('Response JSON copied');
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Playground Header & Presets */}
      <div className="panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-700 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-paper-100">Interactive API Playground</h2>
            <p className="text-xs text-paper-500">
              Execute live REST requests against Linkora&apos;s Public API with real-time response inspection.
            </p>
          </div>

          {/* Active Key Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-paper-400">Authenticate as:</span>
            {activeKeys.length > 0 ? (
              <select
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="input text-xs font-mono py-1.5 max-w-[200px]"
              >
                {activeKeys.map((k) => (
                  <option key={k._id} value={k.maskedKey}>
                    {k.name} ({k.prefix}…)
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                placeholder="Enter API key"
                className="input-mono text-xs py-1.5 max-w-[220px]"
              />
            )}
          </div>
        </div>

        {/* Endpoint Preset Selector Buttons */}
        <div>
          <span className="field-label mb-2">Select Endpoint Preset</span>
          <div className="flex flex-wrap gap-1.5">
            {ENDPOINTS_PRESETS.map((ep) => (
              <button
                key={ep.id}
                type="button"
                onClick={() => handleSelectPreset(ep)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border ${
                  selectedEndpoint.id === ep.id
                    ? 'bg-ink-800 text-accent-400 border-accent-400/40 shadow-sm'
                    : 'bg-ink-950 text-paper-400 border-ink-700 hover:border-ink-600 hover:text-paper-200'
                }`}
              >
                {ep.label}
              </button>
            ))}
          </div>
        </div>

        {/* URL Bar & Execute Button */}
        <form onSubmit={handleExecute} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <span
              className={`badge text-xs font-bold font-mono uppercase px-3 py-2 border shrink-0 ${
                METHOD_COLORS[method] || 'bg-ink-800 text-paper-200 border-ink-600'
              }`}
            >
              {method}
            </span>

            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 font-mono text-xs text-paper-500 select-none">
                /api/public/v1
              </span>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="input-mono text-xs pl-[105px]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isRunning}
              className="btn btn-primary whitespace-nowrap h-[42px] px-5"
            >
              {isRunning ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>Executing…</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Send Request</span>
                </>
              )}
            </button>
          </div>

          {/* Request Body Editor (shown for POST & PATCH) */}
          {(method === 'POST' || method === 'PATCH') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="field-label mb-0">Request Body (JSON)</span>
                <span className="text-[11px] text-paper-500 font-mono">application/json</span>
              </div>
              <textarea
                rows={6}
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                className="input-mono text-xs leading-relaxed"
                placeholder="{ ... }"
              />
            </div>
          )}
        </form>
      </div>

      {/* Response Inspector Panel */}
      {response && (
        <div className="panel p-5 space-y-4 border border-ink-700 bg-ink-900/90">
          {/* Status Ribbon */}
          <div className="flex items-center justify-between border-b border-ink-700 pb-3">
            <div className="flex items-center gap-2.5">
              {response.status >= 200 && response.status < 300 ? (
                <CheckCircle2 size={18} className="text-accent-400" />
              ) : (
                <XCircle size={18} className="text-rose-400" />
              )}
              <span className="font-semibold text-sm text-paper-100">
                HTTP {response.status} {response.statusText}
              </span>
              <span
                className={`badge text-[11px] ${
                  response.status >= 200 && response.status < 300
                    ? 'bg-accent-400/10 text-accent-400 border border-accent-400/25'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
                }`}
              >
                {response.status >= 200 && response.status < 300 ? 'Success' : 'Error'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 font-mono text-xs text-paper-400">
                <Clock size={13} />
                <span>{response.latencyMs}ms</span>
              </div>

              <button
                type="button"
                onClick={copyResponseJson}
                className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-paper-400 hover:text-paper-100 transition-colors"
              >
                {copiedResponse ? <Check size={12} className="text-accent-400" /> : <Copy size={12} />}
                <span>Copy JSON</span>
              </button>
            </div>
          </div>

          {/* Inspector Tabs */}
          <div className="flex border-b border-ink-700">
            <button
              type="button"
              onClick={() => setActiveTab('body')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'body'
                  ? 'border-accent-400 text-accent-400'
                  : 'border-transparent text-paper-400 hover:text-paper-200'
              }`}
            >
              Response Body
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('headers')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'headers'
                  ? 'border-accent-400 text-accent-400'
                  : 'border-transparent text-paper-400 hover:text-paper-200'
              }`}
            >
              Response Headers
            </button>
          </div>

          {/* Body Viewer */}
          {activeTab === 'body' && (
            <pre className="max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-paper-200 selection:bg-accent-400 selection:text-ink-950">
              {JSON.stringify(response.data, null, 2)}
            </pre>
          )}

          {/* Headers Viewer */}
          {activeTab === 'headers' && (
            <pre className="max-h-60 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-paper-300">
              {Object.entries(response.headers || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join('\n') || 'No headers returned'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default ApiPlayground;
