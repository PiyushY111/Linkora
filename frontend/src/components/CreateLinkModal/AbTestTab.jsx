import { Split, Trash2, Plus } from 'lucide-react';
import { MAX_VARIANTS } from './constants';
import { totalVariantWeight } from './createLinkHelpers';

function WeightTotal({ variants }) {
  const sum = totalVariantWeight(variants);
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-3.5 py-2 text-xs font-mono font-medium ${
        sum === 100
          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
      }`}
    >
      <span>Total Traffic Allocation: {sum}%</span>
      <span>{sum === 100 ? '✓ Balanced (100%)' : `Need ${100 - sum}% to reach 100%`}</span>
    </div>
  );
}

function VariantRow({ variant, index, canRemove, actions }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={variant.name}
          onChange={(e) => actions.updateVariant(index, 'name', e.target.value)}
          className="bg-transparent font-semibold text-xs text-paper-100 outline-none border-b border-dashed border-ink-600 focus:border-accent-400 pb-0.5"
          placeholder={`Variant ${String.fromCharCode(65 + index)}`}
        />

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-xs text-accent-400 font-bold">
            <span>{variant.weight}%</span>
          </div>
          {canRemove && (
            <button
              type="button"
              onClick={() => actions.removeVariant(index)}
              className="rounded p-1 text-paper-500 hover:text-rose-400 transition-colors"
              title="Remove variant"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      <div>
        <input
          type="url"
          placeholder="https://yourlandingpage-v1.com"
          value={variant.url}
          onChange={(e) => actions.updateVariant(index, 'url', e.target.value)}
          className="input font-mono text-xs"
        />
      </div>

      {/* Slider for weight */}
      <div className="space-y-1">
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={variant.weight}
          onChange={(e) => actions.updateVariant(index, 'weight', parseInt(e.target.value, 10))}
          className="w-full accent-accent-400 cursor-pointer h-1.5 rounded-lg bg-ink-800"
        />
      </div>
    </div>
  );
}

export default function AbTestTab({ formData, actions }) {
  const isActive = formData.routingType === 'ab_test';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Split size={16} className="text-accent-400" />
            <h4 className="text-sm font-semibold text-paper-100">A/B Split Testing & Traffic Routing</h4>
          </div>
          <button
            type="button"
            onClick={actions.toggleRouting}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-accent-400 text-ink-950 shadow-glow'
                : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
            }`}
          >
            {isActive ? 'A/B Split Active' : 'Enable A/B Test'}
          </button>
        </div>
        <p className="text-xs text-paper-400 leading-relaxed">
          Direct a percentage of visitors to different destination URLs. Uses deterministic sticky hashing (IP + User-Agent) so the same visitor consistently lands on the exact same variant.
        </p>
      </div>

      {isActive ? (
        <div className="space-y-4">
          {/* Total weight check */}
          <WeightTotal variants={formData.variants} />

          {/* Variant Rows */}
          <div className="space-y-3">
            {formData.variants.map((variant, index) => (
              <VariantRow
                key={variant.id || index}
                variant={variant}
                index={index}
                canRemove={formData.variants.length > 2}
                actions={actions}
              />
            ))}
          </div>

          {formData.variants.length < MAX_VARIANTS && (
            <button type="button" onClick={actions.addVariant} className="btn-secondary btn-sm w-full">
              <Plus size={13} />
              <span>Add Challenger Variant</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-ink-800 p-6 text-center text-xs text-paper-500">
          Direct routing is active. Click <strong>Enable A/B Test</strong> above to split incoming visitors across multiple target URLs.
        </div>
      )}
    </div>
  );
}
