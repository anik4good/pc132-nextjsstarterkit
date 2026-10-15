import { CompanyStatus } from '@/app/models/company';

// Default status mapping
export const CompanyStatusProps = {
  [CompanyStatus.ACTIVE]: {
    label: 'Active',
    variant: 'success',
  },
  [CompanyStatus.SUSPENDED]: {
    label: 'Suspended',
    variant: 'destructive',
  },
};

// Function to get status properties
export const getCompanyStatusProps = (status: CompanyStatus) => {
  return (
    CompanyStatusProps[status] || { label: 'Unknown', variant: 'success' }
  );
};
