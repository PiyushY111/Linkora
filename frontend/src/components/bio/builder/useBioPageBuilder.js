import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { bioPageService } from '../../../services';

function errorMessage(err, fallback) {
  return err.response?.data?.message || fallback;
}

/**
 * The active workspace's bio page and every edit the builder makes to it.
 * Each action saves immediately and replaces local state with the server's
 * copy; failures toast and leave the page as the server has it.
 * status: 'loading' | 'missing' (no page yet) | 'ready' | 'error'
 */
export function useBioPageBuilder() {
  const [status, setStatus] = useState('loading');
  const [page, setPage] = useState(null);
  // The page as the server last confirmed it, to roll back a failed reorder
  // (while dragging, `page` already holds the unsaved order).
  const confirmedPage = useRef(null);

  const adopt = useCallback((serverPage) => {
    confirmedPage.current = serverPage;
    setPage(serverPage);
  }, []);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await bioPageService.getPage();
      adopt(res.bioPage);
      setStatus('ready');
    } catch (err) {
      if (err.response?.status === 404) {
        adopt(null);
        setStatus('missing');
        return;
      }
      toast.error(errorMessage(err, 'Failed to load your bio page'));
      setStatus('error');
    }
  }, [adopt]);

  useEffect(() => {
    load();
  }, [load]);

  // Runs one save; on success adopts the returned page. Returns whether it worked.
  const run = useCallback(async (request, fallbackMessage) => {
    try {
      const res = await request();
      adopt(res.bioPage);
      setStatus('ready');
      return true;
    } catch (err) {
      toast.error(errorMessage(err, fallbackMessage));
      return false;
    }
  }, [adopt]);

  const createPage = (data) => run(() => bioPageService.createPage(data), 'Failed to create your bio page');
  const saveDetails = (data) => run(() => bioPageService.updatePage(data), 'Failed to save your changes');
  const addItem = (item) => run(() => bioPageService.addItem(item), 'Failed to add the link');
  const updateItem = (itemId, changes) =>
    run(() => bioPageService.updateItem(itemId, changes), 'Failed to update the item');
  const removeItem = (itemId) => run(() => bioPageService.removeItem(itemId), 'Failed to remove the item');

  /** Shows `orderedItems` at once; puts the server's order back if saving fails. */
  const reorderItems = async (orderedItems) => {
    setPage((current) => ({ ...current, items: orderedItems }));
    const isSaved = await run(
      () => bioPageService.reorderItems(orderedItems.map((item) => item._id)),
      'Failed to save the new order'
    );
    if (!isSaved) setPage(confirmedPage.current);
    return isSaved;
  };

  /** Local-only reorder while dragging; persist with reorderItems on drop. */
  const previewOrder = (orderedItems) => setPage((current) => ({ ...current, items: orderedItems }));

  return {
    status,
    page,
    reload: load,
    createPage,
    saveDetails,
    addItem,
    updateItem,
    removeItem,
    reorderItems,
    previewOrder,
  };
}
