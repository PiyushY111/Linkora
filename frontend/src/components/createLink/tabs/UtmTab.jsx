import { UTM_PRESETS } from '../constants';

/** UTM parameters, presets and the resulting tracked URL. */
export default function UtmTab({ formData, setFormData, applyUtmPreset, computedDestinationUrl }) {
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
        <div>
          <label className="field-label" htmlFor="utmSource">
            UTM Source
          </label>
          <input
            id="utmSource"
            type="text"
            placeholder="google / twitter"
            value={formData.utmSource}
            onChange={(e) => setFormData({ ...formData, utmSource: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="utmMedium">
            UTM Medium
          </label>
          <input
            id="utmMedium"
            type="text"
            placeholder="cpc / social / email"
            value={formData.utmMedium}
            onChange={(e) => setFormData({ ...formData, utmMedium: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="utmCampaign">
            UTM Campaign
          </label>
          <input
            id="utmCampaign"
            type="text"
            placeholder="summer_sale_2026"
            value={formData.utmCampaign}
            onChange={(e) => setFormData({ ...formData, utmCampaign: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="utmTerm">
            UTM Term (Keywords)
          </label>
          <input
            id="utmTerm"
            type="text"
            placeholder="cloud_hosting"
            value={formData.utmTerm}
            onChange={(e) => setFormData({ ...formData, utmTerm: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <label className="field-label" htmlFor="utmContent">
            UTM Content (Ad variation)
          </label>
          <input
            id="utmContent"
            type="text"
            placeholder="blue_banner_v2"
            value={formData.utmContent}
            onChange={(e) => setFormData({ ...formData, utmContent: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
      </div>

      {/* Live Computed URL Preview */}
      {computedDestinationUrl && (
        <div className="rounded-lg border border-ink-700 bg-ink-950 p-3">
          <span className="field-label mb-1">Generated Tracked Target URL:</span>
          <p className="truncate font-mono text-xs text-accent-400">
            {computedDestinationUrl}
          </p>
        </div>
      )}
    </div>
  );
}
