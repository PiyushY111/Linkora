import { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  History,
  SlidersHorizontal,
  ShieldCheck,
  LayoutDashboard,
  User,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from '../ui/Skeleton';
import { workspaceService } from '../../services';
import useAuthStore from '../../context/authStore';
import WorkspaceOverview from './WorkspaceOverview';
import WorkspaceMembers from './WorkspaceMembers';
import WorkspaceActivity from './WorkspaceActivity';
import WorkspaceSettings from './WorkspaceSettings';
import CustomRolesSettings from './CustomRolesSettings';
import useWorkspaceRoles from './useWorkspaceRoles';
import { roleLabel } from '../../utils/roles';

// `permission` is checked against this workspace's permission list (from
// GET /workspaces/:id), since it may not be the active workspace.
const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'roles', label: 'Roles', icon: ShieldCheck, permission: 'roles:manage' },
  { id: 'activity', label: 'Activity', icon: History, permission: 'activity:read' },
  { id: 'settings', label: 'Settings', icon: SlidersHorizontal, permission: 'settings:manage' },
];

/**
 * WorkspaceCard on the Workspaces page.
 * For the active workspace, defaults to expanded with an Overview dashboard of all
 * stats, links, members, and quick shortcuts.
 *
 * @param {{ workspace: object, roleNames?: Record<string, string>, isActive?: boolean, onSwitched?: () => void }} props
 */
export default function WorkspaceCard({ workspace, roleNames = {}, isActive = false, onSwitched }) {
  const { user, switchActiveWorkspace } = useAuthStore();
  const [expanded, setExpanded] = useState(isActive);
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSwitching, setIsSwitching] = useState(false);

  const customRoles = useWorkspaceRoles(expanded ? workspace._id : undefined);

  // /auth/me returns user with _id; login/register return id.
  const userId = user?.id ?? user?._id;
  const myMembership = workspace.members?.find((m) => String(m.user?._id ?? m.user) === String(userId));
  const isPersonal = workspace.name?.toLowerCase() === 'personal' || workspace.organization?.name?.toLowerCase() === 'personal';

  const loadDetail = async () => {
    try {
      const data = await workspaceService.getWorkspace(workspace._id);
      setDetail({
        workspace: data.workspace,
        stats: data.stats || {
          linksCount: 0,
          clicksCount: 0,
          webhooksCount: 0,
          apiKeysCount: 0,
          membersCount: data.workspace?.members?.length || 1,
        },
        permissions: data.permissions || [],
        roleNames: data.roleNames || {},
        organizationSso: data.organizationSso ?? null,
        organizationIpAllowlist: data.organizationIpAllowlist ?? null,
        organizationAudit: data.organizationAudit ?? null,
        organizationDirectorySync: data.organizationDirectorySync ?? null,
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load workspace details');
    }
  };

  // If active workspace, automatically load detail so all stats and overview are instantly visible
  useEffect(() => {
    if (isActive && !detail) {
      loadDetail();
    }
  }, [isActive]);

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
  };

  const handleSwitch = async (e) => {
    e.stopPropagation();
    if (isActive) return;
    setIsSwitching(true);
    try {
      await switchActiveWorkspace(workspace._id);
      onSwitched?.();
      toast.success(`Switched active workspace to ${workspace.name}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to switch workspace');
    } finally {
      setIsSwitching(false);
    }
  };

  const allowed = (permission) => !permission || Boolean(detail?.permissions.includes(permission));
  const visibleTabs = TABS.filter((tab) => allowed(tab.permission));

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isActive
          ? 'border-accent-400/40 bg-ink-900/90 shadow-xl shadow-accent-400/5 ring-1 ring-accent-400/20'
          : 'border-ink-700 bg-ink-900/60 hover:border-ink-600'
      } p-5`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={toggleExpand}
          className="flex min-w-0 flex-1 items-center gap-3.5 text-left focus:outline-none"
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
              isActive
                ? 'bg-accent-400/15 text-accent-400 ring-1 ring-accent-400/30'
                : 'bg-ink-800 text-paper-300 ring-1 ring-ink-650'
            }`}
          >
            {isPersonal ? <User size={19} /> : <Building2 size={19} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold tracking-tight text-paper-100">{workspace.name}</h3>
              {isActive && (
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-accent-400/30 bg-accent-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
                  Active Workspace
                </span>
              )}
            </div>
            <p className="truncate text-xs text-paper-400 mt-0.5">
              {workspace.organization?.name || 'Personal'} · {workspace.members?.length || 1} {workspace.members?.length === 1 ? 'member' : 'members'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2.5 self-end sm:self-center">
          <span className="badge-accent capitalize">
            {roleLabel(myMembership?.role, roleNames)}
          </span>

          {!isActive && (
            <button
              type="button"
              onClick={handleSwitch}
              disabled={isSwitching}
              className="flex items-center gap-1.5 rounded-lg border border-ink-650 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-paper-200 transition-colors hover:border-accent-400/40 hover:bg-ink-750 hover:text-accent-400 disabled:opacity-60"
            >
              {isSwitching ? (
                <span className="h-3 w-3 animate-spin rounded-full border border-ink-600 border-t-accent-400" />
              ) : (
                <ArrowRightLeft size={13} />
              )}
              <span>Switch</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleExpand}
            title={expanded ? 'Collapse' : 'Expand'}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-700 bg-ink-800 text-paper-400 transition-colors hover:bg-ink-750 hover:text-paper-100"
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-ink-800 pt-4">
          {!detail ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <>
              {visibleTabs.length > 1 && (
                <div className="mb-4 flex gap-1 border-b border-ink-800 overflow-x-auto pb-px">
                  {visibleTabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                        activeTab === id
                          ? 'border-accent-400 text-accent-400'
                          : 'border-transparent text-paper-400 hover:text-paper-100'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Tab: Overview (All things of the workspace visible) */}
              {activeTab === 'overview' && (
                <WorkspaceOverview
                  workspace={workspace}
                  detail={detail.workspace}
                  stats={detail.stats}
                  roleNames={detail.roleNames}
                  onSwitchTab={(tabId) => setActiveTab(tabId)}
                  canManage={detail.permissions?.includes('members:manage')}
                />
              )}

              {/* Tab: Members */}
              {activeTab === 'members' && (
                <div className="pt-2">
                  <WorkspaceMembers
                    workspaceId={workspace._id}
                    detail={detail.workspace}
                    canManage={detail.permissions.includes('members:manage')}
                    onChanged={loadDetail}
                    roleNames={{
                      ...detail.roleNames,
                      ...Object.fromEntries(customRoles.roles.map((r) => [String(r.id), r.name])),
                    }}
                    customRoles={customRoles.roles}
                  />
                </div>
              )}

              {/* Tab: Roles */}
              {activeTab === 'roles' && allowed('roles:manage') && (
                <CustomRolesSettings
                  workspaceId={workspace._id}
                  roles={customRoles.roles}
                  availablePermissions={customRoles.availablePermissions}
                  heldPermissions={detail.permissions}
                  isLoading={customRoles.isLoading}
                  onChanged={async () => {
                    await customRoles.reload();
                    await loadDetail();
                  }}
                />
              )}

              {/* Tab: Activity */}
              {activeTab === 'activity' && allowed('activity:read') && (
                <WorkspaceActivity workspaceId={workspace._id} workspaceName={workspace.name} />
              )}

              {/* Tab: Settings */}
              {activeTab === 'settings' && allowed('settings:manage') && (
                <WorkspaceSettings
                  workspaceId={workspace._id}
                  detail={detail.workspace}
                  organizationSso={detail.organizationSso}
                  organizationIpAllowlist={detail.organizationIpAllowlist}
                  organizationAudit={detail.organizationAudit}
                  organizationDirectorySync={detail.organizationDirectorySync}
                  workspaceName={workspace.name}
                  customRoles={customRoles.roles}
                  onChanged={loadDetail}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
