import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Copy, ExternalLink, Plus, QrCode, RotateCw, Link2, BarChart3 } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import AppShell from '../components/layout/AppShell';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import CreateQRModal from '../components/qr/CreateQRModal';
import BioPageView from '../components/bio/BioPageView';
import BioItemList from '../components/bio/builder/BioItemList';
import AddBioItemModal from '../components/bio/builder/AddBioItemModal';
import PageDetailsEditor from '../components/bio/builder/PageDetailsEditor';
import CreateBioPageForm from '../components/bio/builder/CreateBioPageForm';
import { useSlugAvailability } from '../components/bio/builder/SlugField';
import { useBioPageBuilder } from '../components/bio/builder/useBioPageBuilder';
import {
  savedDetails,
  mergeDetails,
  changedDetails,
  detailsProblem,
} from '../components/bio/builder/bioBuilderHelpers';
import { publicBioUrl, toVisibleBioItems } from '../utils/bioTheme';
import { useCan } from '../context/authStore';

const EMPTY_EDITS = { theme: {} };

const BuilderSkeleton = () => (
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
    <div className="space-y-4">
      <Skeleton className="h-96" />
      <Skeleton className="h-48" />
    </div>
    <Skeleton className="h-[560px]" />
  </div>
);

const BioPageBuilder = () => {
  const canEdit = useCan('links:write');
  const builder = useBioPageBuilder();
  const { status, page } = builder;

  // Unsaved detail edits, kept apart from the saved page so item changes
  // (which return a fresh page) never clobber them.
  const [edits, setEdits] = useState(EMPTY_EDITS);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);

  const saved = page ? savedDetails(page) : null;
  const details = saved ? mergeDetails(saved, edits) : null;
  const changes = saved ? changedDetails(saved, edits) : {};
  const isDirty = Object.keys(changes).length > 0;
  const slugStatus = useSlugAvailability(details?.slug ?? '', saved?.slug ?? null);
  const problem = details ? detailsProblem(details, slugStatus) : null;

  const handleDetailsChange = (change) =>
    setEdits((prev) => (change.theme ? { ...prev, theme: { ...prev.theme, ...change.theme } } : { ...prev, ...change }));

  const handleSaveDetails = async () => {
    if (!isDirty || problem) return;
    setIsSavingDetails(true);
    const isSaved = await builder.saveDetails(changes);
    setIsSavingDetails(false);
    if (isSaved) {
      setEdits(EMPTY_EDITS);
      toast.success('Page saved');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicBioUrl(page.slug));
      toast.success('Page link copied');
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const handleRemove = async (item) => {
    if (await builder.removeItem(item._id)) toast.success(`Removed “${item.label}” (the short link itself is kept)`);
  };

  const preview = details && {
    slug: saved.slug,
    title: details.title,
    bio: details.bio,
    avatarUrl: details.avatarUrl,
    theme: details.theme,
    items: toVisibleBioItems(page.items),
  };

  return (
    <>
      <Helmet>
        <title>Bio Page — Linkora</title>
      </Helmet>
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-paper-100">Bio Page</h1>
            <p className="mt-1 text-sm text-paper-400">
              One shareable page for all your links. Every click is tracked like any other short link.
            </p>
          </div>
          {status === 'ready' && (
            <div className="flex flex-wrap items-center gap-2">
              <a href={publicBioUrl(page.slug)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">
                <ExternalLink size={14} />
                <span>View page</span>
              </a>
              <RouterLink to="/analytics/all?view=bio" className="btn-secondary text-xs">
                <BarChart3 size={14} />
                <span>View analytics</span>
              </RouterLink>
              <button type="button" onClick={handleCopyLink} className="btn-secondary text-xs">
                <Copy size={14} />
                <span>Copy page link</span>
              </button>
              {canEdit && (
                <button type="button" onClick={() => setIsQrOpen(true)} className="btn-secondary text-xs">
                  <QrCode size={14} />
                  <span>Generate QR code</span>
                </button>
              )}
            </div>
          )}
        </div>

        {status === 'loading' && <BuilderSkeleton />}

        {status === 'error' && (
          <EmptyState
            icon={RotateCw}
            title="Couldn't load your bio page"
            description="Check your connection and try again."
            action={
              <button type="button" onClick={builder.reload} className="btn-secondary">
                Try again
              </button>
            }
          />
        )}

        {status === 'missing' && <CreateBioPageForm canEdit={canEdit} onCreate={builder.createPage} />}

        {status === 'ready' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <PageDetailsEditor
                details={details}
                onChange={handleDetailsChange}
                slugStatus={slugStatus}
                canEdit={canEdit}
                problem={problem}
                isDirty={isDirty}
                isSaving={isSavingDetails}
                onSave={handleSaveDetails}
                onDiscard={() => setEdits(EMPTY_EDITS)}
              />

              <section className="panel space-y-4 p-5" aria-labelledby="bio-links-heading">
                <div className="flex items-center justify-between border-b border-ink-700/60 pb-3">
                  <div>
                    <h2 id="bio-links-heading" className="text-sm font-semibold text-paper-100">
                      Links
                    </h2>
                    <p className="text-xs text-paper-500">Drag to reorder. Changes here save immediately.</p>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => setIsAddOpen(true)} className="btn-primary text-xs">
                      <Plus size={14} />
                      <span>Add link</span>
                    </button>
                  )}
                </div>

                {page.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-700 py-10 text-center">
                    <Link2 size={24} className="mb-2 text-paper-500" />
                    <p className="text-sm font-medium text-paper-300">No links on your page yet</p>
                    <p className="mt-0.5 text-xs text-paper-500">Paste a URL or pick one of your existing short links.</p>
                  </div>
                ) : (
                  <BioItemList
                    items={page.items}
                    canEdit={canEdit}
                    onPreviewOrder={builder.previewOrder}
                    onSaveOrder={builder.reorderItems}
                    onUpdate={builder.updateItem}
                    onRemove={handleRemove}
                  />
                )}
              </section>
            </div>

            <aside className="lg:sticky lg:top-6 lg:self-start" aria-label="Live preview">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-paper-500">
                <span>Live preview</span>
                {isDirty && <span className="normal-case tracking-normal text-amber-300">Includes unsaved changes</span>}
              </div>
              <div className="overflow-hidden rounded-3xl border border-ink-700 shadow-panel">
                <BioPageView page={preview} isPreview className="min-h-[560px]" />
              </div>
            </aside>
          </div>
        )}
      </AppShell>

      <AddBioItemModal open={isAddOpen} onClose={() => setIsAddOpen(false)} onAdd={builder.addItem} />

      {page && (
        <CreateQRModal
          open={isQrOpen}
          onClose={() => setIsQrOpen(false)}
          initialDestinationUrl={publicBioUrl(page.slug)}
          initialTitle={`${page.title || `@${page.slug}`} bio page`}
        />
      )}
    </>
  );
};

export default BioPageBuilder;
