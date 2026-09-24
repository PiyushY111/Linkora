import { Share2 } from 'lucide-react';

/** OpenGraph title, description and image, with a card preview. */
export default function OpenGraphTab({ formData, setFormData, domain }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-1">
        <div className="flex items-center gap-2">
          <Share2 size={15} className="text-accent-400" />
          <span className="text-xs font-semibold text-paper-100">
            Social Preview & OpenGraph Customization
          </span>
        </div>
        <p className="text-xs text-paper-500">
          When social bots (Slack, Twitter, Discord, iMessage) crawl your short link, Linkora returns these custom tags for rich unfurling before redirecting.
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="field-label" htmlFor="ogTitle">Social Card Title</label>
          <input
            id="ogTitle"
            type="text"
            placeholder="e.g. Exclusive Launch: Linkora Developer Platform"
            value={formData.ogTitle}
            onChange={(e) => setFormData({ ...formData, ogTitle: e.target.value })}
            className="input text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="field-label" htmlFor="ogDescription">Social Card Description</label>
          <textarea
            id="ogDescription"
            rows={2}
            placeholder="Short compelling summary for Twitter cards, Slack unfurling, and LinkedIn preview..."
            value={formData.ogDescription}
            onChange={(e) => setFormData({ ...formData, ogDescription: e.target.value })}
            className="input text-xs resize-none"
          />
        </div>

        <div className="space-y-1">
          <label className="field-label" htmlFor="ogImage">Custom Preview Image URL (og:image)</label>
          <input
            id="ogImage"
            type="url"
            placeholder="https://yourbrand.com/images/hero-card.png"
            value={formData.ogImage}
            onChange={(e) => setFormData({ ...formData, ogImage: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
      </div>

      {/* Live Social Preview Mock Card */}
      <div className="space-y-2 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-paper-400">
          Live Social Card Unfurl Preview
        </span>
        <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-md">
          {formData.ogImage ? (
            <img
              src={formData.ogImage}
              alt="Preview"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              className="h-36 w-full object-cover border-b border-ink-800"
            />
          ) : (
            <div className="flex h-24 w-full items-center justify-center border-b border-ink-800 bg-ink-950 text-xs text-paper-500 font-mono">
              [No Image URL Specified — Standard Card]
            </div>
          )}
          <div className="p-3.5 space-y-1">
            <div className="text-[10px] uppercase font-mono text-paper-500">
              {domain || 'example.com'}
            </div>
            <h5 className="font-bold text-xs text-paper-100 truncate">
              {formData.ogTitle || formData.title || 'Linkora Short Link'}
            </h5>
            <p className="text-[11px] text-paper-400 line-clamp-2">
              {formData.ogDescription || formData.description || 'High-performance link infrastructure and intelligence.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
