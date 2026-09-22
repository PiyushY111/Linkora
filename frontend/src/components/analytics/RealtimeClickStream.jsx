import { useState, useMemo } from 'react';
import ReactCountryFlag from 'react-country-flag';
import {
  Activity,
  Search,
  Globe,
  Smartphone,
  Laptop,
  Monitor,
  ExternalLink,
} from 'lucide-react';

function formatRelativeTime(dateString) {
  if (!dateString) return '—';
  try {
    const diffSeconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (diffSeconds < 5) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

export default function RealtimeClickStream({ clicks = [], isLive = true }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClicks = useMemo(() => {
    if (!searchQuery.trim()) return clicks;
    const q = searchQuery.toLowerCase();
    return clicks.filter((c) => {
      const matchCity = c.city && c.city.toLowerCase().includes(q);
      const matchCountry = c.country_code && c.country_code.toLowerCase().includes(q);
      const matchBrowser = c.browser_family && c.browser_family.toLowerCase().includes(q);
      const matchOs = c.os_family && c.os_family.toLowerCase().includes(q);
      const matchRef = c.referrer_domain && c.referrer_domain.toLowerCase().includes(q);
      const matchUtm =
        (c.utm_source && c.utm_source.toLowerCase().includes(q)) ||
        (c.utm_campaign && c.utm_campaign.toLowerCase().includes(q));
      return matchCity || matchCountry || matchBrowser || matchOs || matchRef || matchUtm;
    });
  }, [clicks, searchQuery]);

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3 items-center justify-center">
            {isLive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                isLive ? 'bg-emerald-500' : 'bg-paper-500'
              }`}
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-paper-100 flex items-center gap-2">
              <span>Live Click Stream</span>
              <span className="rounded-md bg-ink-800 px-2 py-0.5 font-mono text-[10px] text-paper-400 border border-ink-700">
                {clicks.length} events
              </span>
            </h3>
            <p className="text-[11px] text-paper-500">Real-time columnar event pipeline</p>
          </div>
        </div>

        {/* Filter input */}
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-paper-500" />
          <input
            type="text"
            placeholder="Filter stream by location, OS, ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-8 py-1.5 text-xs w-full"
          />
        </div>
      </div>

      {/* Stream Table */}
      {filteredClicks.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center text-center p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-800 text-paper-500 ring-1 ring-ink-700 mb-2">
            <Activity size={18} />
          </div>
          <p className="text-xs font-medium text-paper-300">No matching click events</p>
          <p className="mt-1 text-[11px] text-paper-500">
            Incoming redirects are ingested asynchronously via Redis and ClickHouse.
          </p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto overflow-x-auto divide-y divide-ink-800/80">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur-sm border-b border-ink-800 text-paper-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Time</th>
                <th className="px-5 py-2.5 font-semibold">Location</th>
                <th className="px-5 py-2.5 font-semibold">Client & Device</th>
                <th className="px-5 py-2.5 font-semibold">Referrer</th>
                <th className="px-5 py-2.5 font-semibold">Attribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/60">
              {filteredClicks.map((click) => {
                const countryCode = click.country_code;
                const locText = [click.city, click.country_code].filter(Boolean).join(', ');
                const hasUtm = click.utm_source || click.utm_campaign;

                return (
                  <tr
                    key={click.event_id || click._id || Math.random()}
                    className="hover:bg-ink-800/40 transition-colors group"
                  >
                    {/* Timestamp */}
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px] text-paper-400">
                      <span title={click.timestamp ? new Date(click.timestamp).toUTCString() : ''}>
                        {formatRelativeTime(click.timestamp)}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="whitespace-nowrap px-5 py-3 text-paper-200">
                      <div className="flex items-center gap-2">
                        {countryCode && countryCode.length === 2 ? (
                          <ReactCountryFlag
                            countryCode={countryCode}
                            svg
                            style={{ width: '1.2em', height: '1.2em', borderRadius: '2px' }}
                          />
                        ) : (
                          <Globe size={13} className="text-paper-500" />
                        )}
                        <span className="font-medium">{locText || 'Unknown'}</span>
                      </div>
                    </td>

                    {/* Client & Device */}
                    <td className="whitespace-nowrap px-5 py-3 text-paper-300">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-medium text-[10px] text-paper-400 border border-ink-700 capitalize">
                          {click.device_type || 'Desktop'}
                        </span>
                        <span className="text-paper-200">
                          {click.browser_family || 'Browser'}
                        </span>
                        {click.os_family && click.os_family !== 'Unknown' && (
                          <span className="text-paper-500 text-[11px]">on {click.os_family}</span>
                        )}
                      </div>
                    </td>

                    {/* Referrer */}
                    <td className="whitespace-nowrap px-5 py-3 text-paper-300">
                      <span
                        className={`truncate max-w-[140px] block ${
                          !click.referrer_domain || click.referrer_domain.includes('Direct')
                            ? 'text-paper-500'
                            : 'text-paper-200 font-medium'
                        }`}
                      >
                        {click.referrer_domain || 'Direct / Dark'}
                      </span>
                    </td>

                    {/* Marketing Attribution */}
                    <td className="whitespace-nowrap px-5 py-3">
                      {hasUtm ? (
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          {click.utm_source && (
                            <span className="rounded bg-accent-400/10 text-accent-400 px-1.5 py-0.5 border border-accent-400/20">
                              src:{click.utm_source}
                            </span>
                          )}
                          {click.utm_campaign && (
                            <span className="rounded bg-sky-500/10 text-sky-400 px-1.5 py-0.5 border border-sky-500/20">
                              cmp:{click.utm_campaign}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-paper-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
