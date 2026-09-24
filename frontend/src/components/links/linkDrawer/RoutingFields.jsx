import { Globe, Smartphone, Sliders } from 'lucide-react';

/** Fallback URL, iOS/Android destinations and UTM parameters. */
export default function RoutingFields({ editor }) {
  const { expiredRedirectUrl, setExpiredRedirectUrl, iosRedirect, setIosRedirect, androidRedirect, setAndroidRedirect, utmSource, setUtmSource, utmMedium, setUtmMedium, utmCampaign, setUtmCampaign } = editor;

  return (
    <>
      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2">
        <label
          className="field-label mb-0 flex items-center gap-1.5"
          htmlFor="drawerFallback"
        >
          <Globe size={13} className="text-accent-400" />
          <span>Fallback Expired URL</span>
        </label>
        <input
          id="drawerFallback"
          type="url"
          placeholder="https://yourcompany.com/campaign-ended"
          value={expiredRedirectUrl}
          onChange={(e) => setExpiredRedirectUrl(e.target.value)}
          className="input font-mono text-xs"
        />
        <p className="text-[11px] text-paper-500">
          Where to redirect users when link expires or max quota is reached.
        </p>
      </div>

      {/* Mobile & Device Targeting */}
      <div className="rounded-lg border border-ink-700 bg-ink-950/60 p-3 space-y-2.5">
        <label className="field-label mb-0 flex items-center gap-1.5">
          <Smartphone size={13} className="text-accent-400" />
          <span>Device Targeting (Deep Linking)</span>
        </label>
        <div>
          <span className="text-[11px] text-paper-400 block mb-1">
            iOS / iPhone Destination:
          </span>
          <input
            type="url"
            placeholder="https://apps.apple.com/app/id..."
            value={iosRedirect}
            onChange={(e) => setIosRedirect(e.target.value)}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <span className="text-[11px] text-paper-400 block mb-1">
            Android Destination:
          </span>
          <input
            type="url"
            placeholder="https://play.google.com/store/apps/details?id=..."
            value={androidRedirect}
            onChange={(e) => setAndroidRedirect(e.target.value)}
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
          <input
            type="text"
            placeholder="Source"
            value={utmSource}
            onChange={(e) => setUtmSource(e.target.value)}
            className="input font-mono text-[11px]"
          />
          <input
            type="text"
            placeholder="Medium"
            value={utmMedium}
            onChange={(e) => setUtmMedium(e.target.value)}
            className="input font-mono text-[11px]"
          />
          <input
            type="text"
            placeholder="Campaign"
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
            className="input font-mono text-[11px]"
          />
        </div>
      </div>
    </>
  );
}
