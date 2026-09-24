

/** iOS and Android destination overrides. */
export default function TargetingTab({ formData, setFormData }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-ink-700 bg-ink-950 p-3.5 space-y-1">
        <span className="text-xs font-semibold text-paper-200">
          Mobile Deep Linking & OS Routing
        </span>
        <p className="text-xs text-paper-500">
          Linkora automatically inspects visitor devices and redirects iPhone/iPad users to iOS target and Android users to Google Play target.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="field-label" htmlFor="iosRedirect">
          iOS / iPhone Destination (App Store or Universal Link)
        </label>
        <input
          id="iosRedirect"
          type="url"
          placeholder="https://apps.apple.com/app/id123456789"
          value={formData.iosRedirect}
          onChange={(e) => setFormData({ ...formData, iosRedirect: e.target.value })}
          className="input font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <label className="field-label" htmlFor="androidRedirect">
          Android Destination (Google Play Store or Package Intent)
        </label>
        <input
          id="androidRedirect"
          type="url"
          placeholder="https://play.google.com/store/apps/details?id=com.yourapp"
          value={formData.androidRedirect}
          onChange={(e) => setFormData({ ...formData, androidRedirect: e.target.value })}
          className="input font-mono text-xs"
        />
      </div>
    </div>
  );
}
