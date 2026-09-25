import { TABS } from './constants';

export default function CreateLinkTabs({ activeTab, onChange, formData }) {
  return (
    <div className="flex items-center gap-1 border-b border-ink-700 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-ink-700 scrollbar-track-transparent shrink-0">
      {TABS.map(({ id, label, icon: Icon, hasValues }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold shrink-0 whitespace-nowrap transition-colors ${
            activeTab === id
              ? 'border-accent-400 text-accent-400'
              : 'border-transparent text-paper-500 hover:text-paper-300'
          }`}
        >
          <Icon size={14} />
          <span>{label}</span>
          {hasValues?.(formData) && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
        </button>
      ))}
    </div>
  );
}
