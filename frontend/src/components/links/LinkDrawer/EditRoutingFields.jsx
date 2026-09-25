import { Globe, Smartphone, Sliders } from 'lucide-react';

const UTM_INPUTS = [
  { name: 'utmSource', placeholder: 'Source' },
  { name: 'utmMedium', placeholder: 'Medium' },
  { name: 'utmCampaign', placeholder: 'Campaign' },
];

/** Fallback URL, per-OS destinations and UTM parameters. */
export default function EditRoutingFields({ edit }) {
  const { form, setField } = edit;

  return (
    <>
      {/* Fallback Expired URL */}
      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
        <label className="field-label mb-0 flex items-center gap-1.5" htmlFor="drawerFallback">
          <Globe size={13} className="text-accent-400" />
          <span>Fallback Expired URL</span>
        </label>
        <input
          id="drawerFallback"
          type="url"
          placeholder="https://yourcompany.com/campaign-ended"
          value={form.expiredRedirectUrl}
          onChange={(e) => setField('expiredRedirectUrl', e.target.value)}
          className="input font-mono text-xs"
        />
        <p className="text-[11px] text-paper-500">Where to redirect users when link expires or max quota is reached.</p>
      </div>

      {/* Mobile & Device Targeting */}
      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2.5">
        <label className="field-label mb-0 flex items-center gap-1.5">
          <Smartphone size={13} className="text-accent-400" />
          <span>Device Targeting (Deep Linking)</span>
        </label>
        <div>
          <span className="text-[11px] text-paper-400 block mb-1">iOS / iPhone Destination:</span>
          <input
            type="url"
            placeholder="https://apps.apple.com/app/id..."
            value={form.iosRedirect}
            onChange={(e) => setField('iosRedirect', e.target.value)}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <span className="text-[11px] text-paper-400 block mb-1">Android Destination:</span>
          <input
            type="url"
            placeholder="https://play.google.com/store/apps/details?id=..."
            value={form.androidRedirect}
            onChange={(e) => setField('androidRedirect', e.target.value)}
            className="input font-mono text-xs"
          />
        </div>
      </div>

      {/* UTM Attribution */}
      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
        <label className="field-label mb-0 flex items-center gap-1.5">
          <Sliders size={13} className="text-accent-400" />
          <span>UTM Attribution Parameters</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {UTM_INPUTS.map(({ name, placeholder }) => (
            <input
              key={name}
              type="text"
              placeholder={placeholder}
              value={form[name]}
              onChange={(e) => setField(name, e.target.value)}
              className="input font-mono text-[11px]"
            />
          ))}
        </div>
      </div>
    </>
  );
}
