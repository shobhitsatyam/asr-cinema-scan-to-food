import { useEffect, useState } from 'react';
import api from '../services/api';

export function useMenu() {
  const [menu, setMenu] = useState({ categories: [], products: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchMenu = async () => {
      try {
        setLoading(true);
        const response = await api.get('/menu');
        if (isMounted) {
          setMenu(response.data);
          setError('');
        }
      } catch (err) {
        if (isMounted) {
          setError('Food menu is temporarily unavailable.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchMenu();
    return () => {
      isMounted = false;
    };
  }, []);

  return { menu, loading, error };
}
