import { Link as RouterLink } from 'react-router-dom';
import {
  Link2,
  MousePointerClick,
  Users,
  Key,
  Building2,
  User,
  ArrowRight,
  Plus,
  QrCode,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';

export default function WorkspaceOverview({
  workspace,
  detail,
  stats,
  onSwitchTab,
  canManage,
}) {
  const isPersonal = workspace.name?.toLowerCase() === 'personal' || workspace.organization?.name?.toLowerCase() === 'personal';
  const membersCount = detail?.members?.length ?? workspace.members?.length ?? 1;
  const linksCount = stats?.linksCount ?? 0;
  const clicksCount = stats?.clicksCount ?? 0;
  const webhooksCount = stats?.webhooksCount ?? 0;
  const apiKeysCount = stats?.apiKeysCount ?? 0;

  const createdDate = workspace.createdAt
    ? format(new Date(workspace.createdAt), 'MMM d, yyyy')
    : 'Recently';

  return (
    <div className="space-y-6 pt-2">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Links */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-4 transition-all hover:border-ink-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-paper-400">Total Links</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400 border border-accent-400/20">
              <Link2 size={14} />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{linksCount}</p>
          <RouterLink
            to="/dashboard"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-accent-400 hover:underline"
          >
            <span>View all links</span>
            <ArrowRight size={12} />
          </RouterLink>
        </div>

        {/* Clicks */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-4 transition-all hover:border-ink-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-paper-400">Total Clicks</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
              <MousePointerClick size={14} />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{clicksCount.toLocaleString()}</p>
          <RouterLink
            to="/analytics/all"
            className="mt-3 flex items-center gap-1 text-xs font-medium text-cyan-400 hover:underline"
          >
            <span>Analytics dashboard</span>
            <ArrowRight size={12} />
          </RouterLink>
        </div>

        {/* Members */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-4 transition-all hover:border-ink-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-paper-400">Team Members</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-400/10 text-purple-400 border border-purple-400/20">
              <Users size={14} />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{membersCount}</p>
          <button
            type="button"
            onClick={() => onSwitchTab('members')}
            className="mt-3 flex items-center gap-1 text-xs font-medium text-purple-400 hover:underline"
          >
            <span>Manage members</span>
            <ArrowRight size={12} />
          </button>
        </div>

        {/* Integrations */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-4 transition-all hover:border-ink-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-paper-400">Integrations</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Key size={14} />
            </div>
          </div>
          <p className="mt-2 font-mono text-2xl font-bold text-paper-100">{webhooksCount + apiKeysCount}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-paper-400">
            <span>{webhooksCount} webhooks</span>
            <span>•</span>
            <span>{apiKeysCount} keys</span>
          </div>
        </div>
      </div>

      {/* Details & Quick Actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Workspace Identity */}
        <div className="lg:col-span-2 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
          <div className="flex items-center gap-2 border-b border-ink-800 pb-3">
            {isPersonal ? <User size={16} className="text-accent-400" /> : <Building2 size={16} className="text-accent-400" />}
            <h4 className="text-xs font-semibold uppercase tracking-wider text-paper-300">
              Workspace Profile &amp; Policies
            </h4>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-paper-500">Workspace Name</p>
              <p className="mt-0.5 font-semibold text-paper-100">{workspace.name}</p>
            </div>
            <div>
              <p className="text-paper-500">Organization</p>
              <p className="mt-0.5 font-semibold text-paper-100">{workspace.organization?.name || 'Personal Account'}</p>
            </div>
            <div>
              <p className="text-paper-500">Workspace Type</p>
              <p className="mt-0.5 font-semibold text-paper-100">
                {isPersonal ? 'Personal Workspace' : 'Team / Organization Workspace'}
              </p>
            </div>
            <div>
              <p className="text-paper-500">Created Date</p>
              <p className="mt-0.5 font-medium text-paper-200">{createdDate}</p>
            </div>
            <div>
              <p className="text-paper-500">Default Category</p>
              <p className="mt-0.5 font-medium capitalize text-paper-200">
                {workspace.defaultLinkCategory || 'Marketing'}
              </p>
            </div>
            <div>
              <p className="text-paper-500">SSO &amp; Security</p>
              <p className="mt-0.5 font-medium text-paper-200">
                {detail?.organizationSso?.ssoEnforced
                  ? 'SSO Enforced'
                  : detail?.organizationIpAllowlist?.ipAllowlist?.length
                  ? 'IP Allowlist Active'
                  : 'Standard Email & Password'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-paper-300 border-b border-ink-800 pb-3">
              Quick Shortcuts
            </h4>
            <div className="mt-3 space-y-2">
              <RouterLink
                to="/dashboard"
                className="flex items-center justify-between rounded-lg border border-ink-750 bg-ink-800/60 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 hover:text-paper-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Plus size={14} className="text-accent-400" />
                  <span>Create Short Link</span>
                </div>
                <ArrowRight size={13} className="text-paper-500" />
              </RouterLink>

              <RouterLink
                to="/qr-codes"
                className="flex items-center justify-between rounded-lg border border-ink-750 bg-ink-800/60 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 hover:text-paper-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <QrCode size={14} className="text-cyan-400" />
                  <span>Generate QR Code</span>
                </div>
                <ArrowRight size={13} className="text-paper-500" />
              </RouterLink>

              {canManage && (
                <button
                  type="button"
                  onClick={() => onSwitchTab('members')}
                  className="flex w-full items-center justify-between rounded-lg border border-ink-750 bg-ink-800/60 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 hover:text-paper-100 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-purple-400" />
                    <span>Invite Team Members</span>
                  </div>
                  <ArrowRight size={13} className="text-paper-500" />
                </button>
              )}

              <button
                type="button"
                onClick={() => onSwitchTab('settings')}
                className="flex w-full items-center justify-between rounded-lg border border-ink-750 bg-ink-800/60 px-3 py-2 text-xs text-paper-200 hover:bg-ink-750 hover:text-paper-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-paper-400" />
                  <span>Workspace Settings</span>
                </div>
                <ArrowRight size={13} className="text-paper-500" />
              </button>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-ink-800/60 text-[11px] text-paper-500 flex items-center justify-between">
            <span>Workspace ID:</span>
            <span className="font-mono text-[10px] text-paper-400 truncate max-w-[130px]">{workspace._id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
