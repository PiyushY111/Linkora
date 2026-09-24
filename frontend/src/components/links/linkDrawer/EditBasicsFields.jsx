import { CATEGORIES } from './constants';

/** Title, category, description and tags. */
export default function EditBasicsFields({ editor }) {
  const { title, setTitle, category, setCategory, description, setDescription, tagInput, setTagInput, tags, handleAddTag, handleRemoveTag } = editor;

  return (
    <>
      <div>
        <label className="field-label" htmlFor="drawerTitle">
          Title
        </label>
        <input
          id="drawerTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input text-xs"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="drawerCategory">
          Category
        </label>
        <select
          id="drawerCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="badge-neutral text-xs">
              #{t}
              <button
                type="button"
                onClick={() => handleRemoveTag(t)}
                className="ml-1 text-paper-500 hover:text-paper-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
