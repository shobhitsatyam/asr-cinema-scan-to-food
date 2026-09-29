import { useEffect, useState } from 'react';
import api from '../services/api';

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
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setSeat(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const resolveSeat = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/seats/resolve/${token}`, {
          validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
        });

        if (isMounted) {
          if (response.data && response.data.seat) {
            setSeat(response.data.seat);
            setError('');
            try {
              sessionStorage.setItem(`asr-seat-${token}`, JSON.stringify(response.data.seat));
            } catch {
              // Ignore storage errors
            }
          } else if (response.status === 304) {
            // Valid 304 Not Modified: use cached seat data if available
            try {
              const cached = sessionStorage.getItem(`asr-seat-${token}`);
              if (cached) {
                setSeat(JSON.parse(cached));
                setError('');
              } else {
                setError('Seat information could not be verified.');
                setSeat(null);
              }
            } catch {
              setError('Seat information could not be verified.');
              setSeat(null);
            }
          } else {
            setError(response.data?.message || 'Seat information could not be verified.');
            setSeat(null);
            try {
              sessionStorage.removeItem(`asr-seat-${token}`);
            } catch {
              // Ignore storage errors
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          // If 304 was treated as an error by network or proxy
          if (err?.response?.status === 304 || err?.status === 304) {
            try {
              const cached = sessionStorage.getItem(`asr-seat-${token}`);
              if (cached) {
                setSeat(JSON.parse(cached));
                setError('');
                return;
              }
            } catch {
              // Fall through to error
            }
          }
          try {
            sessionStorage.removeItem(`asr-seat-${token}`);
          } catch {
            // Ignore storage errors
          }
          setError(err?.response?.data?.message || 'Seat information could not be verified.');
          setSeat(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    resolveSeat();
    return () => {
      isMounted = false;
    };
  }, [token]);

  return { seat, loading, error };
}

