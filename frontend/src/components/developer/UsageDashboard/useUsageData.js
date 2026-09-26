import { useEffect, useState } from 'react';
import { publicApiService } from '../../../services';
import { USAGE_POLL_INTERVAL_MS } from './usageHelpers';

function errorMessage(err, fallback) {
  return err.response?.data?.message || fallback;
}

/**
 * Live rate-limit status for `apiKey`, re-polled every USAGE_POLL_INTERVAL_MS
 * while the browser tab is visible. The interval is cleared on unmount.
 * Mount with `key={apiKey}` so switching keys starts from a clean state.
 */
export function useLiveUsage(apiKey) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    const load = async () => {
      try {
        const res = await publicApiService.getUsage(apiKey);
        if (isCancelled) return;
        setUsage(res);
        setError(null);
      } catch (err) {
        if (!isCancelled) setError(errorMessage(err, 'Failed to load rate limit status'));
      }
    };

    load();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, USAGE_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [apiKey]);

  return { usage, error };
}

/**
 * Request history for `apiKey` over the last `days` days. Refetched only
 * when the key or range changes; a response for a superseded range is
 * dropped.
 */
export function useUsageHistory(apiKey, days) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    publicApiService
      .getUsageHistory(apiKey, days)
      .then((res) => {
        if (!isCancelled) setHistory(res);
      })
      .catch((err) => {
        if (!isCancelled) setError(errorMessage(err, 'Failed to load usage history'));
      })
      .finally(() => {
        if (!isCancelled) setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [apiKey, days]);

  return { history, error, isLoading };
}
