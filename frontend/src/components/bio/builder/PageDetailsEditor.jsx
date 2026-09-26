import SlugField from './SlugField';
import ThemePicker from './ThemePicker';

const BIO_MAX_LENGTH = 280;

/**
 * Title, bio, avatar, address and theme. Edits stay local (and show in the
 * preview) until saved.
 */
const PageDetailsEditor = ({ details, onChange, slugStatus, canEdit, problem, isDirty, isSaving, onSave, onDiscard }) => (
  <form
    className="panel space-y-5 p-5"
    onSubmit={(e) => {
      e.preventDefault();
      onSave();
    }}
  >
    <div className="flex items-center justify-between border-b border-ink-700/60 pb-3">
      <h2 className="text-sm font-semibold text-paper-100">Page details</h2>
      {isDirty && <span className="badge text-[10px] bg-amber-500/10 text-amber-300">Unsaved changes</span>}
    </div>

    <fieldset disabled={!canEdit} className="space-y-4">
      <SlugField value={details.slug} onChange={(slug) => onChange({ slug })} status={slugStatus} disabled={!canEdit} />

      <div>
        <label htmlFor="bio-title" className="field-label">
          Title
        </label>
        <input
          id="bio-title"
          type="text"
          value={details.title}
          maxLength={100}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Jane Doe"
          className="input"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="bio-text" className="field-label">
            Bio
          </label>
          <span className={`text-[11px] ${details.bio.length > BIO_MAX_LENGTH ? 'text-rose-400' : 'text-paper-500'}`}>
            {details.bio.length}/{BIO_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="bio-text"
          rows={3}
          value={details.bio}
          onChange={(e) => onChange({ bio: e.target.value })}
          placeholder="What you do, in a sentence or two."
          className="input resize-none"
        />
      </div>

      <div>
        <label htmlFor="bio-avatar" className="field-label">
          Avatar image URL
        </label>
        <input
          id="bio-avatar"
          type="url"
          value={details.avatarUrl}
          onChange={(e) => onChange({ avatarUrl: e.target.value })}
          placeholder="https://…/avatar.png"
          className="input"
        />
        <p className="mt-1 text-[11px] text-paper-500">Also used as the image when your page is shared on social apps.</p>
      </div>
    </fieldset>

    <div className="border-t border-ink-700/60 pt-4">
      <ThemePicker theme={details.theme} onChange={(theme) => onChange({ theme })} disabled={!canEdit} />
    </div>

    {canEdit && (
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-ink-700/60 pt-4">
        {isDirty && problem && <span className="mr-auto text-xs text-amber-300">{problem}</span>}
        <button type="button" onClick={onDiscard} disabled={!isDirty || isSaving} className="btn-secondary text-xs disabled:opacity-40">
          Discard
        </button>
        <button type="submit" disabled={!isDirty || Boolean(problem) || isSaving} className="btn-primary text-xs disabled:opacity-40">
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    )}
  </form>
);

export default PageDetailsEditor;
