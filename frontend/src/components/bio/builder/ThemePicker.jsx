import { Check } from 'lucide-react';
import ColorField from '../../ui/ColorField';
import { BIO_THEME_FONTS, BIO_THEME_PRESETS, fontClass } from '../../../utils/bioTheme';

/**
 * Presets from the QR studio's palette, then fine-tuning with the same
 * color control and segmented buttons the QR customizer uses.
 * @param {{ theme: { primaryColor: string, bgColor: string, font: string }, onChange: (changes: object) => void, disabled?: boolean }} props
 */
const ThemePicker = ({ theme, onChange, disabled }) => (
  <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
    <div>
      <span className="text-xs font-semibold uppercase tracking-wider text-paper-400">Themes</span>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {BIO_THEME_PRESETS.map((preset) => {
          const isSelected =
            theme.primaryColor.toLowerCase() === preset.primaryColor.toLowerCase() &&
            theme.bgColor.toLowerCase() === preset.bgColor.toLowerCase();
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ primaryColor: preset.primaryColor, bgColor: preset.bgColor })}
              aria-pressed={isSelected}
              className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? 'border-accent-400 bg-accent-400/10 shadow-glow'
                  : 'border-ink-700 bg-ink-800/80 hover:border-ink-600 hover:bg-ink-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-white/20"
                  style={{ backgroundColor: preset.bgColor }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.primaryColor }} />
                </span>
                <span className="text-xs font-bold text-paper-100">{preset.name}</span>
              </span>
              {isSelected && <Check size={14} className="text-accent-400" />}
            </button>
          );
        })}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <ColorField label="Button color" value={theme.primaryColor} onChange={(primaryColor) => onChange({ primaryColor })} />
      <ColorField label="Background" value={theme.bgColor} onChange={(bgColor) => onChange({ bgColor })} />
    </div>

    <div>
      <span className="field-label">Font</span>
      <div className="flex gap-2">
        {BIO_THEME_FONTS.map((font) => {
          const isSelected = theme.font === font.id;
          return (
            <button
              key={font.id}
              type="button"
              onClick={() => onChange({ font: font.id })}
              aria-pressed={isSelected}
              className={`flex-1 rounded-xl border py-2 text-center text-xs font-medium transition-all ${fontClass(font.id)} ${
                isSelected
                  ? 'border-accent-400 bg-accent-400/10 text-paper-100 ring-1 ring-accent-400/30'
                  : 'border-ink-700 bg-ink-800 text-paper-400 hover:border-ink-600'
              }`}
            >
              {font.label}
            </button>
          );
        })}
      </div>
    </div>
  </fieldset>
);

export default ThemePicker;
