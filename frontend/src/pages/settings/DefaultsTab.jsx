import { motion } from 'framer-motion';
import { Link as LinkIcon, Check, Globe, Save } from 'lucide-react';
import { LINK_CATEGORIES, EXPIRATION_PRESETS } from './constants';

/** Default category, expiry and UTM parameters for new links. */
export default function DefaultsTab({ form }) {
  const { defaultCategory, setDefaultCategory, defaultExpiration, setDefaultExpiration, defaultUtmSource, setDefaultUtmSource, defaultUtmMedium, setDefaultUtmMedium, defaultUtmCampaign, setDefaultUtmCampaign, isSavingDefaults, handleSaveDefaults } = form;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      <div className="panel p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
              <LinkIcon size={18} className="text-accent-400" />
              <span>Default Link Creation Presets</span>
            </h2>
            <p className="mt-1 text-xs text-paper-500">
              Set standard values that automatically pre-fill whenever you shorten a link on Linkora.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveDefaults} className="mt-6 space-y-6">
          {/* Default Category */}
          <div>
            <label className="field-label">Default Category</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {LINK_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setDefaultCategory(cat.id)}
                  className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-xs font-medium transition-all ${
                    defaultCategory === cat.id
                      ? 'border-accent-400 bg-accent-400/10 text-accent-400 shadow-sm'
                      : 'border-ink-700 bg-ink-950 text-paper-400 hover:border-ink-600 hover:text-paper-100'
                  }`}
                >
                  <span>{cat.label}</span>
                  {defaultCategory === cat.id && <Check size={13} className="text-accent-400" />}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-paper-500">
              New short links will automatically categorize under this tag.
            </p>
          </div>

          {/* Default Expiration */}
          <div>
            <label className="field-label" htmlFor="default-expiration">
              Default Expiration Rule
            </label>
            <select
              id="default-expiration"
              className="input"
              value={defaultExpiration}
              onChange={(e) => setDefaultExpiration(Number(e.target.value))}
            >
              {EXPIRATION_PRESETS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Default UTM Parameters */}
          <div className="border-t border-ink-800 pt-5">
            <h3 className="text-sm font-semibold text-paper-100 flex items-center gap-2">
              <Globe size={15} className="text-cyan-400" />
              <span>Default UTM Campaign Parameters</span>
            </h3>
            <p className="mt-1 text-xs text-paper-500">
              Pre-populate marketing tracking parameters on newly generated links.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="utm-source">
                  utm_source
                </label>
                <input
                  id="utm-source"
                  type="text"
                  className="input"
                  placeholder="e.g. linkora, newsletter"
                  value={defaultUtmSource}
                  onChange={(e) => setDefaultUtmSource(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="utm-medium">
                  utm_medium
                </label>
                <input
                  id="utm-medium"
                  type="text"
                  className="input"
                  placeholder="e.g. social, email, cpc"
                  value={defaultUtmMedium}
                  onChange={(e) => setDefaultUtmMedium(e.target.value)}
                />
              </div>

              <div>
                <label className="field-label" htmlFor="utm-campaign">
                  utm_campaign
                </label>
                <input
                  id="utm-campaign"
                  type="text"
                  className="input"
                  placeholder="e.g. summer_promo, launch"
                  value={defaultUtmCampaign}
                  onChange={(e) => setDefaultUtmCampaign(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={isSavingDefaults}>
              <Save size={15} />
              <span>{isSavingDefaults ? 'Saving Defaults...' : 'Save Default Presets'}</span>
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
