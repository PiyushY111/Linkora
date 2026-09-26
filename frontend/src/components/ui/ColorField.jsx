/**
 * Swatch picker plus hex text input: the one color control shared by the QR
 * studio and the bio page builder.
 * @param {{ label?: string, value: string, onChange: (hex: string) => void, size?: 'md' | 'sm' }} props
 */
const ColorField = ({ label, value, onChange, size = 'md' }) => {
  const isSmall = size === 'sm';
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label ? `${label} swatch` : 'Color swatch'}
          className={`${isSmall ? 'h-8 w-9' : 'h-9 w-10'} cursor-pointer rounded-lg border border-ink-600 bg-ink-800 p-0.5`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label ? `${label} hex value` : 'Hex color value'}
          className={`input font-mono text-xs uppercase${isSmall ? ' py-1.5' : ''}`}
        />
      </div>
    </div>
  );
};

export default ColorField;
