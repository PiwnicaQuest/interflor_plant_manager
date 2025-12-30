import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface TagInfo {
  name: string;
  productCount: number;
  isDefined: boolean;
}

interface UseTagsReturn {
  tags: string[];
  tagInfos: TagInfo[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTags(): UseTagsReturn {
  const [tagInfos, setTagInfos] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/tags`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Nie udało się pobrać tagów');
      }

      const data = await response.json();
      setTagInfos(data.tags || []);
    } catch (err: any) {
      console.error('Error fetching tags:', err);
      setError(err.message || 'Błąd pobierania tagów');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Extract just tag names for backward compatibility
  const tags = tagInfos.map(t => t.name);

  return {
    tags,
    tagInfos,
    loading,
    error,
    refetch: fetchTags,
  };
}

// Fallback tags for when API is not available
export const FALLBACK_TAGS = [
  'Anthurium',
  'Bonsai',
  'Bromelia',
  'Cebulowe',
  'Ceramika',
  'Cytrusy',
  'Doniczki',
  'Kwitnące',
  'Ogrodowe',
  'Palmy',
  'Rośliny Mini',
  'Spathiphyllum',
  'Sukulenty',
  'Zielone',
];
