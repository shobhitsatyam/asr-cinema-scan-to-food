import { useEffect, useState } from 'react';
import api from '../services/api';

export function useSeat(token) {
  const [seat, setSeat] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
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
        const response = await api.get(`/seats/resolve/${token}`);
        if (isMounted) {
          setSeat(response.data.seat);
          setError('');
        }
      } catch (err) {
        if (isMounted) {
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
