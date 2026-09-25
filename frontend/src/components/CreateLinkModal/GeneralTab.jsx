import { Dice5 } from 'lucide-react';
import { CATEGORIES } from './constants';

export default function GeneralTab({ formData, domain, actions }) {
  const { setField, randomAlias, handleAddTag, removeTag } = actions;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="field-label mb-0" htmlFor="originalUrl">
            Destination URL *
          </label>
          {domain && (
            <span className="flex items-center gap-1 text-xs text-paper-500">
              <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                alt=""
                className="h-3.5 w-3.5 rounded"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
              <span>{domain}</span>
            </span>
          )}
        </div>
        <input
          id="originalUrl"
          type="text"
          required
          autoFocus
          placeholder="https://yourcompany.com/landing-page"
          value={formData.originalUrl}
          onChange={(e) => setField('originalUrl', e.target.value)}
          className="input"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="field-label mb-0" htmlFor="customAlias">
              Custom Alias (Optional)
            </label>
            <button
              type="button"
              onClick={randomAlias}
              title="Generate random alias"
              className="flex items-center gap-1 text-xs text-accent-400 hover:underline"
            >
              <Dice5 size={12} />
              <span>Random</span>
            </button>
          </div>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-xs font-mono text-paper-500 pointer-events-none">
              /
            </span>
            <input
              id="customAlias"
              type="text"
              placeholder="launch-2026"
              value={formData.customAlias}
              onChange={(e) => setField('customAlias', e.target.value)}
              className="input-mono pl-6"
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            value={formData.category}
            onChange={(e) => setField('category', e.target.value)}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="title">
            Title (Internal reference)
          </label>
          <input
            id="title"
            type="text"
            placeholder="e.g. Q4 Growth Promo"
            value={formData.title}
            onChange={(e) => setField('title', e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="field-label" htmlFor="tags">
            Tags (Press Enter)
          </label>
          <input
            id="tags"
            type="text"
            placeholder="marketing, promo"
            value={formData.tagInput}
            onChange={(e) => setField('tagInput', e.target.value)}
            onKeyDown={handleAddTag}
            className="input"
          />
        </div>
      </div>

      {formData.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {formData.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-md bg-ink-800 px-2 py-0.5 text-xs text-paper-300 ring-1 ring-ink-600"
            >
              #{t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="text-paper-500 hover:text-paper-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div>
        <label className="field-label" htmlFor="description">
          Description (Optional)
        </label>
        <textarea
          id="description"
          rows={2}
          placeholder="Add operational notes or team context..."
          value={formData.description}
          onChange={(e) => setField('description', e.target.value)}
          className="input resize-none"
        />
      </div>
    </div>
  );
}
