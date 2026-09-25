/**
 * A titled row with an on/off switch.
 * @param {{ icon?: import('react').ReactNode, title: string, children?: import('react').ReactNode,
 *   checked: boolean, onToggle: () => void, disabled?: boolean }} props
 */
export default function ToggleRow({ icon, title, children, checked, onToggle, disabled = false }) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-ink-700 bg-ink-950 p-4">
      <div>
        <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </h3>
        <p className="mt-1 text-xs text-paper-400 max-w-xl leading-relaxed">{children}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-accent-400' : 'bg-ink-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-ink-950 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
