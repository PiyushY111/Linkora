import { ALL_EVENTS } from './events';

/** One checkbox per webhook event, with its description. */
export default function EventCheckboxGrid({ isChecked, onToggle }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
      {ALL_EVENTS.map((opt) => {
        const checked = isChecked(opt.value);
        return (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
              checked
                ? 'border-accent-400/40 bg-accent-400/5 text-paper-100'
                : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(opt.value)}
              className="mt-0.5 h-3.5 w-3.5 accent-accent-400 rounded"
            />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-semibold text-paper-100">
                {opt.value}
              </div>
              <div className="text-[10px] text-paper-400 leading-tight mt-0.5 line-clamp-2">
                {opt.description}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}
