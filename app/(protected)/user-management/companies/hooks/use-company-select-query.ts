import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

// Custom hook to use companies for selection
export const useCompanySelectQuery = () => {
  const fetchCompanyList = async () => {
    const response = await apiFetch('/api/user-management/companies/select');

    if (!response.ok) {
      toast.error(
        'Something went wrong while loading the records. Please try again.',
        {
          position: 'top-center',
        },
      );
    }

    return response.json();
  };

  return useQuery({
    queryKey: ['user-company-select'],
    queryFn: fetchCompanyList,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60, // 60 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
};
