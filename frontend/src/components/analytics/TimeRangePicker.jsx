import { useState } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';

const PRESETS = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
];

export default function TimeRangePicker({
  value = '30d',
  onChange,
  customStart = '',
  customEnd = '',
  className = '',
}) {
  const [showCustomModal, setShowCustomModal] = useState(value === 'custom');
  const [startDate, setStartDate] = useState(customStart || '');
  const [endDate, setEndDate] = useState(customEnd || '');

  const handlePresetSelect = (presetId) => {
    if (presetId === 'custom') {
      setShowCustomModal(true);
      return;
    }
    setShowCustomModal(false);
    onChange({ timeRange: presetId });
  };

  const handleApplyCustom = (e) => {
    e?.preventDefault();
    if (!startDate) return;
    onChange({
      timeRange: 'custom',
      startDate: startDate,
      endDate: endDate || new Date().toISOString().slice(0, 10),
    });
    setShowCustomModal(false);
  };

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      {/* Segmented pill group */}
      <div className="inline-flex h-8.5 items-center rounded-xl bg-ink-900/90 p-1 ring-1 ring-ink-700/80 shadow-inner">
        {PRESETS.map((p) => {
          const isActive = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetSelect(p.id)}
              className={`relative h-6.5 rounded-lg px-2.5 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent-400 text-ink-950 font-bold shadow-sm shadow-accent-400/20'
                  : 'text-paper-400 hover:text-paper-100 hover:bg-ink-800/60'
              }`}
            >
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Custom date range trigger */}
      {value === 'custom' && (
        <button
          type="button"
          onClick={() => setShowCustomModal((prev) => !prev)}
          className="inline-flex h-8.5 items-center gap-1.5 rounded-xl border border-ink-700 bg-ink-850 px-2.5 text-xs text-paper-200 hover:border-ink-600 hover:text-paper-100 transition-colors"
        >
          <Calendar size={13} className="text-accent-400" />
          <span className="font-mono text-[11px]">
            {customStart || 'Start'} → {customEnd || 'Now'}
          </span>
          <ChevronDown size={13} className="text-paper-500" />
        </button>
      )}

      {/* Custom Date Modal */}
      {showCustomModal && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-ink-600 bg-ink-900/95 p-4 shadow-2xl ring-1 ring-black/40 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-ink-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-paper-300">
              Custom Timeframe
            </span>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-paper-500 hover:text-paper-300 text-xs"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleApplyCustom} className="mt-3 space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-paper-400 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input py-1.5 text-xs w-full"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-paper-400 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input py-1.5 text-xs w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="btn-ghost py-1 px-3 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary py-1 px-3 text-xs">
                Apply Window
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
