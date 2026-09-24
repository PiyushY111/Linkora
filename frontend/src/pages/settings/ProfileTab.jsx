import { motion } from 'framer-motion';
import { User as UserIcon, CheckCircle2, Check, Save, Sparkles, Clock, BarChart3 } from 'lucide-react';
import { AVATAR_COLORS } from './constants';

/** Name, bio and avatar colour, plus read-only account details. */
export default function ProfileTab({ user, form }) {
  const { name, setName, bio, setBio, avatarColor, setAvatarColor, isSavingProfile, handleSaveProfile } = form;
  const selectedAvatar = AVATAR_COLORS.find((c) => c.id === avatarColor) || AVATAR_COLORS[0];
  const userInitial = (user?.name || user?.email || 'U')[0].toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      {/* Profile Information Card */}
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <UserIcon size={18} className="text-accent-400" />
          <span>Personal Profile & Identity</span>
        </h2>
        <p className="mt-1 text-xs text-paper-500">
          Your visual avatar and name appear across your links and analytics dashboards.
        </p>

        <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
          {/* Visual Avatar Customizer */}
          <div>
            <label className="field-label">Avatar Accent Theme</label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Big Avatar Badge */}
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl font-bold text-xl shadow-lg transition-transform duration-200 ${selectedAvatar.bg}`}
              >
                {userInitial}
              </div>

              {/* Color Swatches */}
              <div>
                <div className="flex items-center gap-2.5">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setAvatarColor(c.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all border-2 ${
                        avatarColor === c.id ? `${c.border} scale-110 shadow-md` : 'border-transparent opacity-70 hover:opacity-100'
                      } ${c.bg}`}
                      title={c.label}
                    >
                      {avatarColor === c.id && <Check size={14} className="stroke-[3]" />}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-paper-500">
                  Selected: <span className="text-paper-300 font-medium">{selectedAvatar.label}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="profile-name">
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                className="input"
                placeholder="e.g. Satoshi Nakamoto"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="profile-email">
                Email Address
              </label>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  className="input opacity-60 cursor-not-allowed pr-24"
                  value={user?.email || ''}
                  disabled
                />
                <span className="absolute right-2.5 top-2.5 badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <CheckCircle2 size={11} className="mr-0.5" /> Verified
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="profile-bio">
              Bio / Description
            </label>
            <textarea
              id="profile-bio"
              className="input"
              rows="3"
              placeholder="Brief description of your projects or organization..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
            />
            <div className="mt-1 text-right text-[11px] text-paper-500">
              {bio.length}/500 characters
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary" disabled={isSavingProfile}>
              <Save size={15} />
              <span>{isSavingProfile ? 'Saving...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Account Metadata Telemetry Card */}
      <div className="panel p-6">
        <h2 className="text-base font-semibold text-paper-100 flex items-center gap-2">
          <Sparkles size={18} className="text-amber-400" />
          <span>Account Telemetry</span>
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
            <div className="text-xs text-paper-500">Member Since</div>
            <div className="mt-1 text-base font-semibold text-paper-100 flex items-center gap-1.5">
              <Clock size={15} className="text-accent-400" />
              <span>
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Active'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
            <div className="text-xs text-paper-500">Lifetime Traffic Routed</div>
            <div className="mt-1 text-base font-semibold text-paper-100 flex items-center gap-1.5">
              <BarChart3 size={15} className="text-cyan-400" />
              <span>{(user?.totalClicks || 0).toLocaleString()} clicks</span>
            </div>
          </div>

          <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
            <div className="text-xs text-paper-500">Account Status</div>
            <div className="mt-1 text-base font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Healthy & Active</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
