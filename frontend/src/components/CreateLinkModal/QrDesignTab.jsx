import { Sparkles, Sun, Moon } from 'lucide-react';
import QRCodeCustomizer from '../qr/QRCodeCustomizer';
import QRCodeViewer from '../qr/QRCodeViewer';
import { DEFAULT_QR_CONFIG, QR_DESIGNER_PRESETS } from '../../utils/qrPresets';
import { getHostedOrigin } from '../../utils/domain';

const QUICK_STYLE_COUNT = 4;

export default function QrDesignTab({
  formData,
  computedDestinationUrl,
  lightBackdrop,
  onToggleBackdrop,
  qrViewerRef,
  actions,
}) {
  const qrConfig = formData.qrConfig || DEFAULT_QR_CONFIG;
  const target = computedDestinationUrl || getHostedOrigin();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-1">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-accent-400" />
          <span className="text-xs font-semibold text-paper-100">Pre-configure Link QR Code Style</span>
        </div>
        <p className="text-xs text-paper-500">
          Apply designer presets, custom colors, gradients, logos, or callout frames before creating the link. Changes reflect live below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Live Sticky QR Preview Card */}
        <div className="lg:col-span-5 flex flex-col items-center rounded-2xl border border-ink-700 bg-ink-900/90 p-4 shadow-panel lg:sticky lg:top-2">
          <div className="flex w-full items-center justify-between pb-3 border-b border-ink-800">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent-400 animate-pulse" />
              <span className="text-xs font-semibold text-paper-200">Live Preview</span>
            </div>
            <button
              type="button"
              onClick={onToggleBackdrop}
              className="flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] font-medium text-paper-300 hover:text-paper-100 transition-colors"
              title="Toggle canvas backdrop for contrast testing"
            >
              {lightBackdrop ? <Moon size={12} /> : <Sun size={12} />}
              <span>{lightBackdrop ? 'Dark' : 'Light'} Test</span>
            </button>
          </div>

          {/* QR Canvas Container */}
          <div
            className={`relative mt-4 flex min-h-[220px] w-full items-center justify-center rounded-2xl border p-4 transition-colors ${
              lightBackdrop ? 'border-ink-300 bg-paper-100 shadow-inner' : 'border-ink-800 bg-ink-950 shadow-2xl'
            }`}
          >
            <QRCodeViewer ref={qrViewerRef} data={target} config={qrConfig} size={180} lightBackdrop={lightBackdrop} />
          </div>

          {/* Target preview label */}
          <div className="mt-3 w-full text-center">
            <p className="text-[11px] text-paper-500 truncate">
              Target:{' '}
              <span className="font-mono text-paper-300">{target}</span>
            </p>
          </div>

          {/* Quick Designer Presets */}
          <div className="mt-4 w-full border-t border-ink-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-paper-400">Quick Styles</span>
              <span className="text-[10px] text-paper-500 font-mono">{formData.qrConfig?.dotsType || 'rounded'}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {QR_DESIGNER_PRESETS.slice(0, QUICK_STYLE_COUNT).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => actions.applyQrPreset(preset)}
                  className="rounded-lg border border-ink-700 bg-ink-950 p-2 text-left text-[11px] font-medium text-paper-300 hover:border-accent-400/50 hover:text-accent-400 transition-colors"
                >
                  <p className="font-semibold">{preset.name}</p>
                  <p className="text-[10px] text-paper-500 truncate">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Customizer Controls */}
        <div className="lg:col-span-7">
          <QRCodeCustomizer config={qrConfig} onChange={actions.changeQrConfig} onReset={actions.resetQrConfig} />
        </div>
      </div>
    </div>
  );
}
