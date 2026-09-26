/**
 * Checkbox grid over the API's event catalog, shared by the create and edit
 * forms. `endpoint.test` is left out: test pings are sent on demand to any
 * endpoint regardless of its subscriptions.
 */
const WebhookEventPicker = ({ catalog, selected, onChange }) => {
  const options = catalog.filter((e) => e.type !== 'endpoint.test');
  const allSelected = options.length > 0 && options.every((e) => selected.includes(e.type));

  const toggle = (type) =>
    onChange(selected.includes(type) ? selected.filter((e) => e !== type) : [...selected, type]);
  const toggleAll = () => onChange(allSelected ? [] : options.map((e) => e.type));

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="field-label mb-0">Events to Receive</span>
        <button type="button" onClick={toggleAll} className="text-[11px] font-medium text-accent-400 hover:underline">
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
        {options.map((opt) => {
          const checked = selected.includes(opt.type);
          return (
            <label
              key={opt.type}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
                checked
                  ? 'border-accent-400/40 bg-accent-400/5 text-paper-100'
                  : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.type)}
                className="mt-0.5 h-3.5 w-3.5 accent-accent-400 rounded"
              />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-semibold text-paper-100">{opt.type}</div>
                <div className="text-[10px] text-paper-400 leading-tight mt-0.5 line-clamp-2">{opt.description}</div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default WebhookEventPicker;
