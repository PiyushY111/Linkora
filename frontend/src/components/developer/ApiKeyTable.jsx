import { useState } from 'react';
import {
  Key,
  Copy,
  Check,
  RotateCw,
  Trash2,
  Clock,
  ShieldCheck,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const SCOPE_LABELS = {
  '*': { label: 'Full Access (*)', color: 'bg-accent-400/10 text-accent-400 border-accent-400/20' },
  'links:read': { label: 'links:read', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  'links:write': { label: 'links:write', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  'links:delete': { label: 'links:delete', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  'analytics:read': { label: 'analytics:read', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  'webhooks:read': { label: 'webhooks:read', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  'webhooks:write': { label: 'webhooks:write', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

const ApiKeyTable = ({ keys = [], onRollKey, onRevokeKey }) => {
  const [copiedId, setCopiedId] = useState(null);

  const handleCopyMasked = (key) => {
    navigator.clipboard.writeText(key.maskedKey);
    setCopiedId(key._id);
    toast.success('Key identifier copied');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (keys.length === 0) {
    return (
      <div className="panel p-8 text-center">
        <Key size={32} className="mx-auto mb-2 text-paper-500 opacity-50" />
        <h3 className="text-sm font-semibold text-paper-200">No API Keys Generated</h3>
        <p className="mt-1 text-xs text-paper-500">
          Create an API key to access Linkly&apos;s Public REST API programmatically.
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden border border-ink-700">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-950/60 font-semibold uppercase tracking-wider text-paper-400">
              <th className="px-4 py-3">Name &amp; Environment</th>
              <th className="px-4 py-3">Key Identifier</th>
              <th className="px-4 py-3">Granted Scopes</th>
              <th className="px-4 py-3">Last Activity</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {keys.map((k) => {
              const isRevoked = k.status === 'revoked';
              const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
              const isLive = k.environment === 'live';

              return (
                <tr
                  key={k._id}
                  className={`transition-colors hover:bg-ink-800/40 ${
                    isRevoked ? 'opacity-60 bg-ink-950/40' : ''
                  }`}
                >
                  {/* Name & Env */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-paper-100">{k.name}</span>
                      <span
                        className={`badge text-[10px] uppercase font-mono font-bold border ${
                          isLive
                            ? 'bg-accent-400/10 text-accent-400 border-accent-400/25'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                        }`}
                      >
                        {k.environment}
                      </span>
                      {isRevoked && (
                        <span className="badge text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/25">
                          Revoked
                        </span>
                      )}
                      {!isRevoked && isExpired && (
                        <span className="badge text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          Expired
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-paper-500">
                      Created {new Date(k.createdAt).toLocaleDateString()}
                    </div>
                  </td>

                  {/* Masked Key string */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 font-mono text-paper-200">
                      <span className="rounded bg-ink-950 px-2 py-0.5 border border-ink-700 text-[11px]">
                        {k.maskedKey}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyMasked(k)}
                        className="rounded p-1 text-paper-500 hover:bg-ink-800 hover:text-paper-200 transition-colors"
                        title="Copy key identifier"
                      >
                        {copiedId === k._id ? (
                          <Check size={12} className="text-accent-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Scopes */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {k.scopes?.map((s) => {
                        const meta = SCOPE_LABELS[s] || {
                          label: s,
                          color: 'bg-ink-800 text-paper-400 border-ink-700',
                        };
                        return (
                          <span
                            key={s}
                            className={`badge text-[10px] font-mono border ${meta.color}`}
                          >
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </td>

                  {/* Last Activity */}
                  <td className="px-4 py-3.5 text-paper-300">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Clock size={12} className="text-paper-500" />
                      <span>
                        {k.lastUsedAt
                          ? new Date(k.lastUsedAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never used'}
                      </span>
                    </div>
                    {k.totalRequests > 0 && (
                      <div className="text-[10px] text-paper-500 font-mono mt-0.5">
                        {k.totalRequests.toLocaleString()} requests
                      </div>
                    )}
                  </td>

                  {/* Expires */}
                  <td className="px-4 py-3.5 text-paper-400">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Calendar size={12} className="text-paper-500" />
                      <span>
                        {k.expiresAt
                          ? new Date(k.expiresAt).toLocaleDateString()
                          : 'Never'}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-right">
                    {!isRevoked && (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onRollKey(k)}
                          className="rounded-lg p-1.5 text-paper-400 hover:bg-ink-800 hover:text-accent-400 transition-colors"
                          title="Roll / rotate key (generates new secret)"
                        >
                          <RotateCw size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRevokeKey(k._id)}
                          className="rounded-lg p-1.5 text-paper-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                          title="Revoke API key"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ApiKeyTable;
