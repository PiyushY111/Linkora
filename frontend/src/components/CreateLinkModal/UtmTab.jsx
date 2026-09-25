import { UTM_PRESETS } from './constants';

const UTM_INPUTS_TOP = [
  { name: 'utmSource', label: 'UTM Source', placeholder: 'google / twitter' },
  { name: 'utmMedium', label: 'UTM Medium', placeholder: 'cpc / social / email' },
  { name: 'utmCampaign', label: 'UTM Campaign', placeholder: 'summer_sale_2026' },
];

const UTM_INPUTS_BOTTOM = [
  { name: 'utmTerm', label: 'UTM Term (Keywords)', placeholder: 'cloud_hosting' },
  { name: 'utmContent', label: 'UTM Content (Ad variation)', placeholder: 'blue_banner_v2' },
];

function UtmInput({ name, label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="field-label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        className="input font-mono text-xs"
      />
    </div>
  );
}

export default function UtmTab({ formData, computedDestinationUrl, actions }) {
  const { setField, applyUtmPreset } = actions;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-paper-400">
          Add standard marketing attribution parameters to trace leads and clicks.
        </p>
      </div>

      {/* Presets */}
      <div>
        <span className="field-label">Quick Campaign Presets</span>
        <div className="flex flex-wrap gap-1.5">
          {UTM_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyUtmPreset(p)}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1 text-xs text-paper-300 transition-colors hover:border-accent-400/50 hover:text-paper-100"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {UTM_INPUTS_TOP.map((input) => (
          <UtmInput key={input.name} {...input} value={formData[input.name]} onChange={setField} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {UTM_INPUTS_BOTTOM.map((input) => (
          <UtmInput key={input.name} {...input} value={formData[input.name]} onChange={setField} />
        ))}
      </div>

      {/* Live Computed URL Preview */}
      {computedDestinationUrl && (
        <div className="rounded-lg border border-ink-700 bg-ink-950 p-3">
          <span className="field-label mb-1">Generated Tracked Target URL:</span>
          <p className="truncate font-mono text-xs text-accent-400">{computedDestinationUrl}</p>
        </div>
      )}
    </div>
  );
}
