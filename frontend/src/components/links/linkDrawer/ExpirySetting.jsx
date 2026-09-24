import { Calendar } from 'lucide-react';

/** Set, change or remove the expiry date. */
export default function ExpirySetting({ link, editor }) {
  const { removeExpiryDate, setRemoveExpiryDate, expiryDate, setExpiryDate } = editor;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label className="field-label mb-0 flex items-center gap-1.5">
          <Calendar size={13} className="text-accent-400" />
          <span>Link Expiration</span>
        </label>
        {link.expiryDate && !removeExpiryDate && (
          <button
            type="button"
            onClick={() => {
              setRemoveExpiryDate(true);
              setExpiryDate('');
            }}
            className="text-[11px] text-danger hover:underline"
          >
            Remove expiry
          </button>
        )}
        {removeExpiryDate && (
          <button
            type="button"
            onClick={() => setRemoveExpiryDate(false)}
            className="text-[11px] text-accent-400 hover:underline"
          >
            Undo remove
          </button>
        )}
      </div>

      {removeExpiryDate ? (
        <p className="text-xs text-danger/80">
          Expiration will be removed on save (link will never expire).
        </p>
      ) : (
        <div className="space-y-2 pt-1">
          <input
            type="datetime-local"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="input text-xs"
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper-500">Presets:</span>
            {[
              { label: '24h', hours: 24 },
              { label: '7d', hours: 24 * 7 },
              { label: '30d', hours: 24 * 30 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setHours(d.getHours() + p.hours);
                  setExpiryDate(d.toISOString().slice(0, 16));
                }}
                className="rounded px-2 py-0.5 text-xs font-mono bg-ink-800 text-paper-300 hover:text-paper-100 transition-colors"
              >
                +{p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
