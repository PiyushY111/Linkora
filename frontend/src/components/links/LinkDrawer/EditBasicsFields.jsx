import { CATEGORIES } from './linkDrawerHelpers';

export default function EditBasicsFields({ edit }) {
  const { form, setField, tagInput, setTagInput, handleAddTag, removeTag } = edit;

  return (
    <>
      <div>
        <label className="field-label" htmlFor="drawerTitle">
          Title
        </label>
        <input
          id="drawerTitle"
          type="text"
          value={form.title}
          onChange={(e) => setField('title', e.target.value)}
          className="input text-xs"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="drawerCategory">
          Category
        </label>
        <select
          id="drawerCategory"
          value={form.category}
          onChange={(e) => setField('category', e.target.value)}
          className="input text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="field-label" htmlFor="drawerDesc">
          Description
        </label>
        <textarea
          id="drawerDesc"
          rows={2}
          value={form.description}
          onChange={(e) => setField('description', e.target.value)}
          className="input resize-none text-xs"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="drawerTags">
          Tags (Press Enter)
        </label>
        <input
          id="drawerTags"
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          placeholder="Add tag..."
          className="input text-xs"
        />
      </div>
      {form.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {form.tags.map((t) => (
            <span key={t} className="badge-neutral text-xs">
              #{t}
              <button type="button" onClick={() => removeTag(t)} className="ml-1 text-paper-500 hover:text-paper-100">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
