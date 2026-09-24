import { Users } from 'lucide-react';

/** Set, change or remove the maximum number of opens. */
export default function ClickLimitSetting({ link, editor }) {
  const { removeMaxClicks, setRemoveMaxClicks, enableMaxClicks, setEnableMaxClicks, maxClicks, setMaxClicks } = editor;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <label
          className="field-label mb-0 flex items-center gap-1.5"
          htmlFor="drawerMaxClicks"
        >
          <Users size={13} className="text-accent-400" />
          <span>Click Limit (Max Opens)</span>
        </label>
        {link.maxClicks && !removeMaxClicks && (
          <button
            type="button"
            onClick={() => {
              setRemoveMaxClicks(true);
              setEnableMaxClicks(false);
            }}
            className="text-[11px] text-danger hover:underline"
          >
            Remove limit
          </button>
        )}
        {removeMaxClicks && (
          <button
            type="button"
            onClick={() => {
              setRemoveMaxClicks(false);
              setEnableMaxClicks(true);
            }}
            className="text-[11px] text-accent-400 hover:underline"
          >
            Undo remove
          </button>
        )}
        {!link.maxClicks && (
          <button
            type="button"
            onClick={() => {
              const next = !enableMaxClicks;
              setEnableMaxClicks(next);
              if (next && !maxClicks) setMaxClicks('50');
            }}
            className={`text-[11px] font-semibold ${
              enableMaxClicks
                ? 'text-accent-400'
                : 'text-paper-400 hover:text-paper-200'
            }`}
          >
            {enableMaxClicks ? 'Enabled' : 'Add limit'}
          </button>
        )}
      </div>

      {removeMaxClicks ? (
        <p className="text-xs text-danger/80">
          Click limit will be removed on save (unlimited opens allowed).
        </p>
      ) : enableMaxClicks ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <input
              id="drawerMaxClicks"
              type="number"
              min="1"
              placeholder="e.g. 50"
              value={maxClicks}
              onChange={(e) => setMaxClicks(e.target.value)}
              className="input font-mono text-xs"
            />
            <span className="text-xs text-paper-400 whitespace-nowrap">
              max opens
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-paper-500">Presets:</span>
            {[5, 25, 100, 500].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMaxClicks(String(preset))}
                className={`rounded px-2 py-0.5 text-xs font-mono transition-colors ${
                  maxClicks === String(preset)
                    ? 'bg-accent-400 text-ink-950 font-bold'
                    : 'bg-ink-800 text-paper-300 hover:text-paper-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-paper-500">
          No limit set (unlimited opens allowed).
        </p>
      )}
    </div>
  );
}
