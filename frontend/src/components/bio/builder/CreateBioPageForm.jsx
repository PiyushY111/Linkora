import { useState } from 'react';
import { Contact } from 'lucide-react';
import EmptyState from '../../ui/EmptyState';
import SlugField, { useSlugAvailability } from './SlugField';

/** First-run state: pick an address (and optionally a title) to create the page. */
const CreateBioPageForm = ({ canEdit, onCreate }) => {
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const slugStatus = useSlugAvailability(slug, null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (slugStatus !== 'available') return;
    setIsCreating(true);
    await onCreate({ slug: slug.trim(), ...(title.trim() && { title: title.trim() }) });
    setIsCreating(false);
  };

  if (!canEdit) {
    return (
      <EmptyState
        icon={Contact}
        title="No bio page yet"
        description="Someone with permission to create links in this workspace can set one up."
      />
    );
  }

  return (
    <EmptyState
      icon={Contact}
      title="Create your link-in-bio page"
      description="One page listing your links, styled your way. Every click is tracked like any other short link."
      action={
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 text-left">
          <SlugField value={slug} onChange={setSlug} status={slugStatus} />
          <div>
            <label htmlFor="bio-create-title" className="field-label">
              Title <span className="text-paper-500">(optional)</span>
            </label>
            <input
              id="bio-create-title"
              type="text"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
            />
          </div>
          <button type="submit" disabled={slugStatus !== 'available' || isCreating} className="btn-primary w-full disabled:opacity-50">
            {isCreating ? 'Creating…' : 'Create page'}
          </button>
        </form>
      }
    />
  );
};

export default CreateBioPageForm;
