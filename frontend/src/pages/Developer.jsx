import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Terminal, Play, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import { authService, publicApiService } from '../services';

const CURL_SNIPPET = (apiKey) =>
  `curl -X POST https://your-domain.com/api/public/v1/links/bulk \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey || 'YOUR_API_KEY'}" \\
  -d '{"links": ["https://example.com/a", "https://example.com/b"]}'`;

const Developer = () => {
  const [apiKey, setApiKey] = useState('');
  const [urlsText, setUrlsText] = useState('https://example.com/one\nhttps://example.com/two');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    authService
      .getCurrentUser()
      .then((data) => setApiKey(data.user?.apiKey || ''))
      .catch(() => {});
  }, []);

  const handleRun = async (e) => {
    e.preventDefault();
    if (!apiKey) {
      toast.error('Generate an API key in Settings first');
      return;
    }
    const links = urlsText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (links.length === 0) {
      toast.error('Enter at least one URL');
      return;
    }

    setIsRunning(true);
    setResults(null);
    try {
      const data = await publicApiService.bulkCreateLinks(apiKey, links);
      setResults(data);
      toast.success(`${data.succeeded}/${data.total} links created`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Bulk create failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Developer — Linkly</title>
      </Helmet>
      <AppShell>
        <div className="mb-8 flex items-center gap-3">
          <Terminal size={22} className="text-accent-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Developer</h1>
            <p className="mt-1 text-sm text-paper-500">Public API — token-bucket rate limited, X-API-Key auth.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="panel p-6">
            <h2 className="text-sm font-semibold text-paper-100">Bulk create</h2>
            <p className="mt-1 text-xs text-paper-500">
              POST /api/public/v1/links/bulk — up to 1,000 URLs per batch, validated in parallel.
            </p>

            {!apiKey && (
              <p className="mt-3 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                No API key found. Generate one from Settings.
              </p>
            )}

            <form onSubmit={handleRun} className="mt-4 space-y-3">
              <div>
                <label className="field-label" htmlFor="urls">URLs (one per line)</label>
                <textarea
                  id="urls"
                  className="input-mono"
                  rows={6}
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={isRunning}>
                <Play size={14} /> {isRunning ? 'Running…' : 'Run request'}
              </button>
            </form>

            {results && (
              <div className="mt-5 max-h-72 overflow-y-auto rounded-lg border border-ink-700">
                {results.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 border-b border-ink-800 px-3 py-2 text-xs last:border-b-0"
                  >
                    {r.success ? (
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                    ) : (
                      <XCircle size={14} className="mt-0.5 shrink-0 text-danger" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-paper-300">{r.originalUrl}</p>
                      <p className={r.success ? 'text-success' : 'text-danger'}>
                        {r.success ? r.shortUrl : r.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-6">
            <h2 className="text-sm font-semibold text-paper-100">cURL example</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-paper-300">
              {CURL_SNIPPET(apiKey)}
            </pre>

            <h2 className="mt-6 text-sm font-semibold text-paper-100">Rate limits</h2>
            <p className="mt-2 text-xs text-paper-500">
              Token bucket: burst of 20 requests, refilling at 5 req/s per API key. Exceeding the limit returns{' '}
              <code className="font-mono text-paper-300">429</code>.
            </p>
          </div>
        </div>
      </AppShell>
    </>
  );
};

export default Developer;
