import { Split, Trash2, Plus } from 'lucide-react';

/** A/B split routing: variants, URLs and traffic weights. */
export default function AbTestTab({ formData, setFormData }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Split size={16} className="text-accent-400" />
            <h4 className="text-sm font-semibold text-paper-100">
              A/B Split Testing & Traffic Routing
            </h4>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = formData.routingType === 'ab_test' ? 'direct' : 'ab_test';
              setFormData({ ...formData, routingType: next });
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              formData.routingType === 'ab_test'
                ? 'bg-accent-400 text-ink-950 shadow-glow'
                : 'border border-ink-600 bg-ink-800 text-paper-300 hover:text-paper-100'
            }`}
          >
            {formData.routingType === 'ab_test' ? 'A/B Split Active' : 'Enable A/B Test'}
          </button>
        </div>
        <p className="text-xs text-paper-400 leading-relaxed">
          Direct a percentage of visitors to different destination URLs. Uses deterministic sticky hashing (IP + User-Agent) so the same visitor consistently lands on the exact same variant.
        </p>
      </div>

      {formData.routingType === 'ab_test' ? (
        <div className="space-y-4">
          {/* Total weight check */}
          {(() => {
            const sum = formData.variants.reduce((acc, v) => acc + (Number(v.weight) || 0), 0);
            return (
              <div className={`flex items-center justify-between rounded-lg px-3.5 py-2 text-xs font-mono font-medium ${
                sum === 100
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}>
                <span>Total Traffic Allocation: {sum}%</span>
                <span>{sum === 100 ? '✓ Balanced (100%)' : `Need ${100 - sum}% to reach 100%`}</span>
              </div>
            );
          })()}

          {/* Variant Rows */}
          <div className="space-y-3">
            {formData.variants.map((variant, index) => (
              <div
                key={variant.id || index}
                className="rounded-xl border border-ink-700 bg-ink-900/60 p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => {
                      const newVariants = [...formData.variants];
                      newVariants[index].name = e.target.value;
                      setFormData({ ...formData, variants: newVariants });
                    }}
                    className="bg-transparent font-semibold text-xs text-paper-100 outline-none border-b border-dashed border-ink-600 focus:border-accent-400 pb-0.5"
                    placeholder={`Variant ${String.fromCharCode(65 + index)}`}
                  />

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-accent-400 font-bold">
                      <span>{variant.weight}%</span>
                    </div>
                    {formData.variants.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newVariants = formData.variants.filter((_, i) => i !== index);
                          setFormData({ ...formData, variants: newVariants });
                        }}
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
                    onChange={(e) => {
                      const newVariants = [...formData.variants];
                      newVariants[index].url = e.target.value;
                      setFormData({ ...formData, variants: newVariants });
                    }}
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
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const newVariants = [...formData.variants];
                      newVariants[index].weight = val;
                      setFormData({ ...formData, variants: newVariants });
                    }}
                    className="w-full accent-accent-400 cursor-pointer h-1.5 rounded-lg bg-ink-800"
                  />
                </div>
              </div>
            ))}
          </div>

          {formData.variants.length < 4 && (
            <button
              type="button"
              onClick={() => {
                const char = String.fromCharCode(65 + formData.variants.length);
                setFormData({
                  ...formData,
                  variants: [
                    ...formData.variants,
                    {
                      id: `var_${char.toLowerCase()}_${Date.now()}`,
                      name: `Variant ${char}`,
                      url: '',
                      weight: 20,
                    },
                  ],
                });
              }}
              className="btn-secondary btn-sm w-full"
            >
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
