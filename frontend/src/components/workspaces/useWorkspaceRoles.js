import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { workspaceService } from '../../services';

/**
 * The organization's custom roles (via one of its workspaces), plus the
 * permission keys and descriptions a custom role may use.
 * @param {string | undefined} workspaceId
 */
export default function useWorkspaceRoles(workspaceId) {
  const [roles, setRoles] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceId));

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const data = await workspaceService.listRoles(workspaceId);
      setRoles(data.roles || []);
      setAvailablePermissions(data.availablePermissions || []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { roles, availablePermissions, isLoading, reload };
}
