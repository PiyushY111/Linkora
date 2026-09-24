import { Lock, Users, Smartphone } from 'lucide-react';

/** Read-only view of the link's settings. */
export default function LinkSettingsSummary({ link, isQuotaFull, isExpired }) {
  return (
    <div className="space-y-2.5 pt-1 text-xs text-paper-300">
      {link.description && (
        <div>
          <span className="text-paper-500 block mb-0.5">Description:</span>
          <p className="text-paper-200">{link.description}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-paper-500">Category:</span>
        <span className="capitalize font-medium text-paper-100">
          {link.category || 'other'}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-paper-500">Password:</span>
        {link.password ? (
          <span className="flex items-center gap-1 text-accent-400 font-medium">
            <Lock size={12} /> Active (Encrypted)
          </span>
        ) : (
          <span className="text-paper-400">None</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-paper-500">Click Limit:</span>
        {link.maxClicks ? (
          <span className="font-mono text-paper-200 flex items-center gap-1">
            <Users size={12} className="text-accent-400" />
            <span>
              {link.clicks ?? 0} / {link.maxClicks} opens
            </span>
            {isQuotaFull && (
              <span className="badge-danger text-[10px] ml-1">Reached</span>
            )}
          </span>
        ) : (
          <span className="text-paper-400">Unlimited opens</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-paper-500">Expiration:</span>
        {link.expiryDate ? (
          <span
            className={
              isExpired
                ? 'text-danger font-medium'
                : 'text-paper-200 font-medium'
            }
          >
            {isExpired
              ? `Expired (${new Date(link.expiryDate).toLocaleDateString()})`
              : `Expires on ${new Date(link.expiryDate).toLocaleDateString()}`}
          </span>
        ) : (
          <span className="text-paper-400">Never expires</span>
        )}
      </div>

      {link.expiredRedirectUrl && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-paper-500">Fallback URL:</span>
          <span className="font-mono text-xs text-accent-400 truncate max-w-[200px]">
            {link.expiredRedirectUrl}
          </span>
        </div>
      )}

      {(link.iosRedirect || link.androidRedirect) && (
        <div className="pt-2 border-t border-ink-800 space-y-1">
          <span className="text-paper-500 block mb-1">
            Device-Specific Destinations:
          </span>
          {link.iosRedirect && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-paper-400 flex items-center gap-1">
                <Smartphone size={11} className="text-accent-400" /> iOS Target:
              </span>
              <span className="font-mono text-accent-400 truncate max-w-[180px]">
                {link.iosRedirect}
              </span>
            </div>
          )}
          {link.androidRedirect && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-paper-400 flex items-center gap-1">
                <Smartphone size={11} className="text-accent-400" /> Android Target:
              </span>
              <span className="font-mono text-accent-400 truncate max-w-[180px]">
                {link.androidRedirect}
              </span>
            </div>
          )}
        </div>
      )}

      {(link.utm?.source || link.utm?.medium || link.utm?.campaign) && (
        <div className="pt-2 border-t border-ink-800 space-y-1">
          <span className="text-paper-500 block mb-1">UTM Attribution:</span>
          <div className="flex flex-wrap gap-1 font-mono text-[11px]">
            {link.utm.source && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-paper-300">
                src:{link.utm.source}
              </span>
            )}
            {link.utm.medium && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-paper-300">
                med:{link.utm.medium}
              </span>
            )}
            {link.utm.campaign && (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-accent-400">
                camp:{link.utm.campaign}
              </span>
            )}
          </div>
        </div>
      )}

      {link.tags?.length > 0 && (
        <div className="pt-2 border-t border-ink-800">
          <span className="text-paper-500 block mb-1">Tags:</span>
          <div className="flex flex-wrap gap-1">
            {link.tags.map((t) => (
              <span key={t} className="badge-neutral text-xs">
                #{t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
