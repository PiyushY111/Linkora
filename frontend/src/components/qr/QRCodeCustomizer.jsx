import { useState, useRef } from 'react';
import {
  Palette,
  Shapes,
  Image as ImageIcon,
  Sparkles,
  LayoutTemplate,
  Upload,
  X,
  RotateCcw,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  QR_DOT_TYPES,
  QR_CORNER_SQUARE_TYPES,
  QR_CORNER_DOT_TYPES,
  QR_FRAME_STYLES,
  QR_BRAND_ICONS,
  QR_DESIGNER_PRESETS,
  DEFAULT_QR_CONFIG,
} from '../../utils/qrPresets';

const COLOR_SWATCHES = [
  '#C6FF3D', // Cyber Lime
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
  '#A855F7', // Violet
  '#EC4899', // Pink
  '#FF5C5C', // Crimson
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#FFFFFF', // White
  '#0A0A0B', // Dark Ink
];

export default function QRCodeCustomizer({ config, onChange, onReset }) {
  const [activeTab, setActiveTab] = useState('presets');
  const fileInputRef = useRef(null);

  const updateConfig = (patch) => {
    onChange((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const updateGradient = (patch) => {
    onChange((prev) => ({
      ...prev,
      gradient: {
        ...(prev.gradient || {}),
        ...patch,
      },
    }));
  };

  const updateFrame = (patch) => {
    onChange((prev) => ({
      ...prev,
      frame: {
        ...(prev.frame || {}),
        ...patch,
      },
    }));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo image must be smaller than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateConfig({ logo: reader.result });
      toast.success('Logo added to QR code');
    };
    reader.readAsDataURL(file);
  };

  const applyPreset = (preset) => {
    onChange({
      ...preset.config,
      logo: config.logo || null,
      logoSize: config.logoSize ?? 0.35,
      logoMargin: config.logoMargin ?? 6,
    });
    toast.success(`Applied ${preset.name} theme`);
  };

  const tabs = [
    { id: 'presets', label: 'Presets', icon: Sparkles },
    { id: 'shapes', label: 'Shapes', icon: Shapes },
    { id: 'colors', label: 'Colors', icon: Palette },
    { id: 'logo', label: 'Logo', icon: ImageIcon },
    { id: 'frame', label: 'Frames', icon: LayoutTemplate },
  ];

  return (
    <div className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900/90 shadow-panel backdrop-blur">
      {/* Tab Navigation Header */}
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
        <div className="flex gap-1 overflow-x-auto py-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-accent-400 text-ink-950 shadow-sm'
                    : 'text-paper-400 hover:bg-ink-800 hover:text-paper-100'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onReset}
          title="Reset to default design"
          className="flex items-center gap-1 rounded-lg p-1.5 text-xs text-paper-500 transition-colors hover:bg-ink-800 hover:text-paper-200"
        >
          <RotateCcw size={13} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="p-4 sm:p-5">
        {/* PRESETS TAB */}
        {activeTab === 'presets' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">
                Curated Designer Themes
              </span>
              <span className="text-[11px] text-paper-500">Click to apply instant theme</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {QR_DESIGNER_PRESETS.map((preset) => {
                const isSelected =
                  config.dotsColor === preset.config.dotsColor &&
                  config.dotsType === preset.config.dotsType &&
                  config.gradient?.enabled === preset.config.gradient?.enabled;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`group relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-accent-400 bg-accent-400/10 shadow-glow'
                        : 'border-ink-700 bg-ink-800/80 hover:border-ink-600 hover:bg-ink-800'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-3.5 w-3.5 rounded-full ring-1 ring-white/20"
                          style={{
                            background: preset.config.gradient?.enabled
                              ? `linear-gradient(135deg, ${preset.config.gradient.color1}, ${preset.config.gradient.color2})`
                              : preset.config.dotsColor,
                          }}
                        />
                        <span className="text-xs font-bold text-paper-100">{preset.name}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-accent-400" />}
                    </div>

                    <div className="mt-2 flex w-full items-center justify-between">
                      <span className="rounded bg-ink-950 px-1.5 py-0.5 text-[10px] font-mono text-paper-400">
                        {preset.tag}
                      </span>
                      <span className="text-[10px] capitalize text-paper-500">
                        {preset.config.dotsType}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* SHAPES & PATTERNS TAB */}
        {activeTab === 'shapes' && (
          <div className="space-y-5">
            {/* Body Dots Style */}
            <div>
              <label className="field-label">Body Pattern Style</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {QR_DOT_TYPES.map((type) => {
                  const isSelected = config.dotsType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => updateConfig({ dotsType: type.id })}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-accent-400 bg-accent-400/10 text-paper-100 ring-1 ring-accent-400/30'
                          : 'border-ink-700 bg-ink-800/80 text-paper-400 hover:border-ink-600 hover:text-paper-200'
                      }`}
                    >
                      <span className="text-xs font-semibold">{type.label}</span>
                      <span className="text-[10px] text-paper-500">{type.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Corner Eye Frame Style */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label">Corner Frame (Eye Outline)</label>
                <div className="flex gap-2">
                  {QR_CORNER_SQUARE_TYPES.map((type) => {
                    const isSelected = config.cornersSquareType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => updateConfig({ cornersSquareType: type.id })}
                        className={`flex-1 rounded-xl border py-2 text-center text-xs font-medium transition-all ${
                          isSelected
                            ? 'border-accent-400 bg-accent-400/10 text-paper-100 ring-1 ring-accent-400/30'
                            : 'border-ink-700 bg-ink-800 text-paper-400 hover:border-ink-600'
                        }`}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Corner Eye Pupil Style */}
              <div>
                <label className="field-label">Corner Pupil (Eye Dot)</label>
                <div className="flex gap-2">
                  {QR_CORNER_DOT_TYPES.map((type) => {
                    const isSelected = config.cornersDotType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => updateConfig({ cornersDotType: type.id })}
                        className={`flex-1 rounded-xl border py-2 text-center text-xs font-medium transition-all ${
                          isSelected
                            ? 'border-accent-400 bg-accent-400/10 text-paper-100 ring-1 ring-accent-400/30'
                            : 'border-ink-700 bg-ink-800 text-paper-400 hover:border-ink-600'
                        }`}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COLORS & GRADIENTS TAB */}
        {activeTab === 'colors' && (
          <div className="space-y-5">
            {/* Color Mode Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/80 p-2">
              <span className="px-2 text-xs font-semibold text-paper-300">Fill Mode</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => updateGradient({ enabled: false })}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    !config.gradient?.enabled
                      ? 'bg-accent-400 text-ink-950'
                      : 'text-paper-400 hover:text-paper-200'
                  }`}
                >
                  Solid Color
                </button>
                <button
                  type="button"
                  onClick={() => updateGradient({ enabled: true })}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    config.gradient?.enabled
                      ? 'bg-accent-400 text-ink-950'
                      : 'text-paper-400 hover:text-paper-200'
                  }`}
                >
                  Gradient
                </button>
              </div>
            </div>

            {/* Gradient Controls or Solid Color */}
            {config.gradient?.enabled ? (
              <div className="space-y-4 rounded-xl border border-ink-700 bg-ink-800/40 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Gradient Start</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.gradient?.color1 || '#C6FF3D'}
                        onChange={(e) => updateGradient({ color1: e.target.value })}
                        className="h-9 w-10 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                      />
                      <input
                        type="text"
                        value={config.gradient?.color1 || '#C6FF3D'}
                        onChange={(e) => updateGradient({ color1: e.target.value })}
                        className="input font-mono text-xs uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Gradient End</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.gradient?.color2 || '#06B6D4'}
                        onChange={(e) => updateGradient({ color2: e.target.value })}
                        className="h-9 w-10 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                      />
                      <input
                        type="text"
                        value={config.gradient?.color2 || '#06B6D4'}
                        onChange={(e) => updateGradient({ color2: e.target.value })}
                        className="input font-mono text-xs uppercase"
                      />
                    </div>
                  </div>
                </div>

                {/* Angle Slider */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label mb-0">Rotation Angle</label>
                    <span className="font-mono text-xs text-accent-400">
                      {config.gradient?.rotation ?? 45}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="15"
                    value={config.gradient?.rotation ?? 45}
                    onChange={(e) => updateGradient({ rotation: parseInt(e.target.value, 10) })}
                    className="mt-2 w-full accent-accent-400 cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="field-label">Pattern Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.dotsColor || '#C6FF3D'}
                    onChange={(e) => {
                      updateConfig({
                        dotsColor: e.target.value,
                        cornersSquareColor: e.target.value,
                        cornersDotColor: e.target.value,
                      });
                    }}
                    className="h-9 w-10 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                  />
                  <input
                    type="text"
                    value={config.dotsColor || '#C6FF3D'}
                    onChange={(e) => {
                      updateConfig({
                        dotsColor: e.target.value,
                        cornersSquareColor: e.target.value,
                        cornersDotColor: e.target.value,
                      });
                    }}
                    className="input font-mono text-xs uppercase"
                  />
                </div>
              </div>
            )}

            {/* Quick Color Swatches */}
            <div>
              <label className="field-label">Palette Swatches</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      if (config.gradient?.enabled) {
                        updateGradient({ color1: color });
                      } else {
                        updateConfig({
                          dotsColor: color,
                          cornersSquareColor: color,
                          cornersDotColor: color,
                        });
                      }
                    }}
                    className="h-6 w-6 rounded-full border border-ink-600 shadow-sm transition-transform hover:scale-125"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Background Color & Transparency */}
            <div className="border-t border-ink-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="field-label mb-0">Background</label>
                  <p className="text-[11px] text-paper-500">QR code canvas background surface</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.isTransparent || false}
                    onChange={(e) => updateConfig({ isTransparent: e.target.checked })}
                    className="rounded border-ink-600 bg-ink-800 text-accent-400 focus:ring-accent-400"
                  />
                  <span className="text-xs text-paper-300">Transparent</span>
                </label>
              </div>

              {!config.isTransparent && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="color"
                    value={config.bgColor || '#0A0A0B'}
                    onChange={(e) => updateConfig({ bgColor: e.target.value })}
                    className="h-9 w-10 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                  />
                  <input
                    type="text"
                    value={config.bgColor || '#0A0A0B'}
                    onChange={(e) => updateConfig({ bgColor: e.target.value })}
                    className="input font-mono text-xs uppercase"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* LOGO & BRANDING TAB */}
        {activeTab === 'logo' && (
          <div className="space-y-5">
            <div>
              <label className="field-label">Center Brand Logo</label>
              <p className="text-xs text-paper-500 mb-3">
                Embed your custom brand emblem into the middle of the QR code.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary btn-sm flex-1 sm:flex-initial"
                >
                  <Upload size={14} />
                  <span>Upload Logo (PNG, SVG)</span>
                </button>

                {config.logo && (
                  <button
                    type="button"
                    onClick={() => updateConfig({ logo: null })}
                    className="btn-danger btn-sm"
                  >
                    <X size={14} />
                    <span>Remove Logo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Icon Presets */}
            <div>
              <label className="field-label">Popular Icon Presets</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {QR_BRAND_ICONS.map((icon) => {
                  const isSelected = config.logo === icon.src;
                  return (
                    <button
                      key={icon.id}
                      type="button"
                      onClick={() => updateConfig({ logo: icon.src })}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all ${
                        isSelected
                          ? 'border-accent-400 bg-accent-400/10 ring-1 ring-accent-400/30'
                          : 'border-ink-700 bg-ink-800 hover:border-ink-600'
                      }`}
                    >
                      <img src={icon.src} alt={icon.name} className="h-6 w-6 object-contain" />
                      <span className="text-[11px] font-medium text-paper-300">{icon.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Logo Scaling Controls */}
            {config.logo && (
              <div className="space-y-4 rounded-xl border border-ink-700 bg-ink-800/40 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label mb-0">Logo Scale</label>
                    <span className="font-mono text-xs text-accent-400">
                      {Math.round((config.logoSize ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.15"
                    max="0.45"
                    step="0.05"
                    value={config.logoSize ?? 0.35}
                    onChange={(e) => updateConfig({ logoSize: parseFloat(e.target.value) })}
                    className="mt-2 w-full accent-accent-400 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label mb-0">Logo Clear Margin</label>
                    <span className="font-mono text-xs text-accent-400">
                      {config.logoMargin ?? 6}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="14"
                    step="2"
                    value={config.logoMargin ?? 6}
                    onChange={(e) => updateConfig({ logoMargin: parseInt(e.target.value, 10) })}
                    className="mt-2 w-full accent-accent-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* FRAMES & CTA TAB */}
        {activeTab === 'frame' && (
          <div className="space-y-5">
            <div>
              <label className="field-label">Frame & Call-to-Action Envelope</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {QR_FRAME_STYLES.map((frame) => {
                  const isSelected = (config.frame?.type || 'none') === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => updateFrame({ type: frame.id })}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-accent-400 bg-accent-400/10 text-paper-100 ring-1 ring-accent-400/30'
                          : 'border-ink-700 bg-ink-800 text-paper-400 hover:border-ink-600 hover:text-paper-200'
                      }`}
                    >
                      <span className="text-xs font-semibold">{frame.label}</span>
                      <span className="text-[10px] text-paper-500">{frame.preview}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {config.frame?.type && config.frame?.type !== 'none' && (
              <div className="space-y-4 rounded-xl border border-ink-700 bg-ink-800/40 p-4">
                <div>
                  <label className="field-label" htmlFor="frameText">
                    Banner CTA Text
                  </label>
                  <input
                    id="frameText"
                    type="text"
                    value={config.frame?.text || 'SCAN ME'}
                    onChange={(e) => updateFrame({ text: e.target.value })}
                    placeholder="e.g. SCAN ME, VIEW MENU, CONNECT"
                    className="input font-semibold uppercase"
                    maxLength={24}
                  />
                </div>

                {config.frame?.type === 'card' && (
                  <div>
                    <label className="field-label" htmlFor="frameSubtext">
                      Subtitle / Instructions
                    </label>
                    <input
                      id="frameSubtext"
                      type="text"
                      value={config.frame?.subtext || ''}
                      onChange={(e) => updateFrame({ subtext: e.target.value })}
                      placeholder="e.g. Point camera to open link"
                      className="input text-xs"
                      maxLength={40}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Frame Accent Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.frame?.color || '#C6FF3D'}
                        onChange={(e) => updateFrame({ color: e.target.value })}
                        className="h-8 w-9 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                      />
                      <input
                        type="text"
                        value={config.frame?.color || '#C6FF3D'}
                        onChange={(e) => updateFrame({ color: e.target.value })}
                        className="input font-mono text-xs uppercase py-1.5"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={config.frame?.textColor || '#0A0A0B'}
                        onChange={(e) => updateFrame({ textColor: e.target.value })}
                        className="h-8 w-9 cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5"
                      />
                      <input
                        type="text"
                        value={config.frame?.textColor || '#0A0A0B'}
                        onChange={(e) => updateFrame({ textColor: e.target.value })}
                        className="input font-mono text-xs uppercase py-1.5"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
