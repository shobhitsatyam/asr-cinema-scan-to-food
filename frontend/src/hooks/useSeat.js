import { useEffect, useState } from 'react';
import api from '../services/api';

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS = [2000, 4000]; // Attempt 2 after ~2s, Attempt 3 after ~4s

/**
 * Determines whether an error is temporary and eligible for automatic retry.
 * Temporary errors: network failure, fetch failure, timeouts, 5xx server errors, 408.
 * Non-temporary errors: 404 Not Found, other 4xx client errors, deliberate cancellations.
 */
function isTemporaryError(err) {
  if (!err) return false;

  // Do not retry if request was deliberately canceled/aborted on unmount
  if (api.isCancel?.(err) || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
    return false;
  }

  // Network failures, fetch failures, timeouts where no HTTP response was received
  if (!err.response) {
    return true;
  }

  const status = err.response.status;

  // 5xx server errors (500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout, etc.)
  if (status >= 500 && status < 600) {
    return true;
  }

  // Request timeout
  if (status === 408) {
    return true;
  }

  // 404 (invalid token) and other 4xx responses are not temporary
  return false;
}

/**
 * Cancellable sleep utility that cleans up its timer immediately upon abort.
 */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function useSeat(token) {
  const [seat, setSeat] = useState(() => {
    if (!token) return null;
    try {
      const cached = sessionStorage.getItem(`asr-seat-${token}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!seat && Boolean(token));
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setSeat(null);
      setLoading(false);
      setIsRetrying(false);
      setError('');
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const resolveSeat = async () => {
      setLoading(true);
      setIsRetrying(false);

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (!isMounted || abortController.signal.aborted) return;

        try {
          const response = await api.get(`/seats/resolve/${token}`, {
            signal: abortController.signal,
            validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
          });

          if (!isMounted || abortController.signal.aborted) return;

          if (response.data && response.data.seat) {
            setSeat(response.data.seat);
            setError('');
            setIsRetrying(false);
            try {
              sessionStorage.setItem(`asr-seat-${token}`, JSON.stringify(response.data.seat));
            } catch {
              // Ignore storage errors
            }
            return;
          } else if (response.status === 304) {
            // Valid 304 Not Modified: use cached seat data if available
            try {
              const cached = sessionStorage.getItem(`asr-seat-${token}`);
              if (cached) {
                setSeat(JSON.parse(cached));
                setError('');
                setIsRetrying(false);
                return;
              } else {
                setError('Seat information could not be verified.');
                setSeat(null);
                setIsRetrying(false);
                return;
              }
            } catch {
              setError('Seat information could not be verified.');
              setSeat(null);
              setIsRetrying(false);
              return;
            }
          } else {
            setError(response.data?.message || 'Seat information could not be verified.');
            setSeat(null);
            setIsRetrying(false);
            try {
              sessionStorage.removeItem(`asr-seat-${token}`);
            } catch {
              // Ignore storage errors
            }
            return;
          }
        } catch (err) {
          if (!isMounted || abortController.signal.aborted) return;

          // If 304 was treated as an error by network or proxy
          if (err?.response?.status === 304 || err?.status === 304) {
            try {
              const cached = sessionStorage.getItem(`asr-seat-${token}`);
              if (cached) {
                setSeat(JSON.parse(cached));
                setError('');
                setIsRetrying(false);
                return;
              }
            } catch {
              // Fall through to error
            }
          }

          const canRetry = attempt < MAX_ATTEMPTS && isTemporaryError(err);

          if (canRetry) {
            setIsRetrying(true);
            const delayMs = RETRY_DELAYS[attempt - 1] ?? 2000;
            await sleep(delayMs, abortController.signal);
            if (!isMounted || abortController.signal.aborted) return;
            continue;
          }

          // If non-temporary error (e.g. 404) or all 3 attempts failed:
          try {
            sessionStorage.removeItem(`asr-seat-${token}`);
          } catch {
            // Ignore storage errors
          }
          setError(err?.response?.data?.message || 'Seat information could not be verified.');
          setSeat(null);
          setIsRetrying(false);
          return;
        }
      }
    };

    resolveSeat().finally(() => {
      if (isMounted && !abortController.signal.aborted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [token]);

  return { seat, loading, error, isRetrying };
}

