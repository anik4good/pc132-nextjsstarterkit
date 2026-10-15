'use client';

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react';
import {
  ArchiveRestoreIcon,
  MoreHorizontal,
  PencilIcon,
  Plus,
  Search,
  Trash2Icon,
  UserRoundCog,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { formatDate, getInitials } from '@/lib/helpers';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge, BadgeDot, BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader, CardTable } from '@/components/ui/card';
import {
  DataGrid,
  DataGridApiFetchParams,
  DataGridApiResponse,
} from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { DataGridTable } from '@/components/ui/data-grid-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Company, CompanyStatus } from '@/app/models/company';
import {
  CompanyStatusProps,
  getCompanyStatusProps,
} from '../constants/status';
import CompanyAddDialog from './company-add-dialog';
import CompanyEditDialog from './company-edit-dialog';
import CompanyImpersonateDialog from './company-impersonate-dialog';
import CompanyTrashDialog from './company-trash-dialog';

const CompanyList = () => {
  const queryClient = useQueryClient();
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>('all');

  // Fetch companies from the server API
  const fetchCompanies = async ({
    pageIndex,
    pageSize,
    sorting,
    searchQuery,
    selectedStatus,
  }: DataGridApiFetchParams & {
    searchQuery: string;
    selectedStatus: string | null;
  }): Promise<DataGridApiResponse<Company>> => {
    const sortField = sorting?.[0]?.id || '';
    const sortDirection = sorting?.[0]?.desc ? 'desc' : 'asc';

    const params = new URLSearchParams({
      page: String(pageIndex + 1),
      limit: String(pageSize),
      ...(sortField ? { sort: sortField, dir: sortDirection } : {}),
      ...(searchQuery ? { query: searchQuery } : {}),
      ...(selectedStatus && selectedStatus !== 'all'
        ? { status: selectedStatus }
        : {}),
    });

    const response = await apiFetch(
      `/api/user-management/companies?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error(
        'Oops! Something didn’t go as planned. Please try again in a moment.',
      );
    }

    return response.json();
  };

  // Companies query
  const { data, isLoading } = useQuery({
    queryKey: [
      'user-companies',
      pagination,
      sorting,
      searchQuery,
      selectedStatus,
    ],
    queryFn: () =>
      fetchCompanies({
        pageIndex: pagination.pageIndex,
        pageSize: pagination.pageSize,
        sorting,
        searchQuery,
        selectedStatus,
      }),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60, // 60 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const handleStatusSelection = (status: string) => {
    setSelectedStatus(status);
    setPagination({ ...pagination, pageIndex: 0 });
  };

  const openEdit = (company: Company) => {
    setSelectedCompany(company);
    setEditDialogOpen(true);
  };

  const openTrash = (company: Company) => {
    setSelectedCompany(company);
    setTrashDialogOpen(true);
  };

  const openImpersonate = (company: Company) => {
    setSelectedCompany(company);
    setImpersonateDialogOpen(true);
  };

  const restoreMutation = useMutation({
    mutationFn: async (company: Company) => {
      const response = await apiFetch(
        `/api/user-management/companies/${company.id}/restore`,
        { method: 'PATCH' },
      );

      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: () => {
      toast.custom(
        () => (
          <Alert variant="mono" icon="success" close={false}>
            <AlertIcon>
              <RiCheckboxCircleFill />
            </AlertIcon>
            <AlertTitle>Company restored successfully</AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );

      queryClient.invalidateQueries({ queryKey: ['user-companies'] });
      queryClient.invalidateQueries({ queryKey: ['user-company-select'] });
    },
    onError: (error: Error) => {
      toast.custom(
        () => (
          <Alert variant="mono" icon="destructive" close={false}>
            <AlertIcon>
              <RiErrorWarningFill />
            </AlertIcon>
            <AlertTitle>{error.message}</AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );
    },
  });

  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      {
        accessorKey: 'name',
        id: 'name',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Company"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const company = row.original;

          return (
            <div className="flex items-center gap-3">
              <span className="bg-accent text-accent-foreground flex size-8 items-center justify-center rounded-lg text-xs font-semibold uppercase">
                {getInitials(company.name)}
              </span>
              <div className="space-y-px">
                <div className="font-medium text-sm">{company.name}</div>
                <div className="text-muted-foreground text-xs">
                  {company.slug}
                </div>
              </div>
            </div>
          );
        },
        size: 300,
        meta: {
          headerTitle: 'Company',
          skeleton: (
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ),
        },
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'users_count',
        id: 'users_count',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Users"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original._count?.users ?? 0}</span>
        ),
        size: 100,
        meta: {
          headerTitle: 'Users',
          skeleton: <Skeleton className="w-8 h-7" />,
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'status',
        id: 'status',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Status"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const statusProps = getCompanyStatusProps(
            row.original.status as CompanyStatus,
          );
          const isTrashed = row.original.isTrashed;
          const variant = statusProps.variant as keyof BadgeProps['variant'];

          return (
            <div className="inline-flex gap-2.5">
              <Badge variant={variant} appearance="ghost">
                <BadgeDot />
                {statusProps.label}
              </Badge>
              {isTrashed && (
                <Badge variant="destructive" appearance="light">
                  Trashed
                </Badge>
              )}
            </div>
          );
        },
        size: 150,
        meta: {
          headerTitle: 'Status',
          skeleton: <Skeleton className="w-14 h-7" />,
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'createdAt',
        id: 'createdAt',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Created"
            visibility={true}
            column={column}
          />
        ),
        cell: (info) => formatDate(new Date(info.getValue() as string)),
        size: 150,
        meta: {
          headerTitle: 'Created',
          skeleton: <Skeleton className="w-20 h-7" />,
        },
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'actions',
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const company = row.original;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  mode="icon"
                  size="sm"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Company actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => openEdit(company)}>
                  <PencilIcon className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openImpersonate(company)}>
                  <UserRoundCog className="size-4" />
                  Impersonate
                </DropdownMenuItem>
                {company.isTrashed ? (
                  <>
                    <DropdownMenuItem
                      onClick={() => restoreMutation.mutate(company)}
                    >
                      <ArchiveRestoreIcon className="size-4" />
                      Restore
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => openTrash(company)}
                    >
                      <Trash2Icon className="size-4" />
                      Delete permanently
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => openTrash(company)}
                  >
                    <Trash2Icon className="size-4" />
                    Move to trash
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
        meta: {
          skeleton: <Skeleton className="size-6" />,
        },
        size: 60,
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
      },
    ],
    [],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((column) => column.id as string),
  );

  const table = useReactTable({
    columns,
    data: data?.data || [],
    pageCount: Math.ceil((data?.pagination.total || 0) / pagination.pageSize),
    getRowId: (row: Company) => row.id,
    state: {
      pagination,
      sorting,
      columnOrder,
    },
    columnResizeMode: 'onChange',
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const DataGridToolbar = () => {
    const [inputValue, setInputValue] = useState(searchQuery);

    const handleSearch = () => {
      setSearchQuery(inputValue);
      setPagination({ ...pagination, pageIndex: 0 });
    };

    return (
      <CardHeader className="flex-col flex-wrap sm:flex-row items-stretch sm:items-center py-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search companies"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={isLoading}
              className="ps-9 w-full sm:40 md:w-64"
            />
            {searchQuery.length > 0 && (
              <Button
                mode="icon"
                variant="dim"
                className="absolute end-1.5 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery('')}
              >
                <X />
              </Button>
            )}
          </div>
          <Select
            onValueChange={handleStatusSelection}
            value={selectedStatus || 'all'}
            defaultValue="all"
            disabled={isLoading}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {Object.entries(CompanyStatusProps).map(
                ([status, { label }]) => (
                  <SelectItem key={status} value={status}>
                    {label}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-end">
          <Button
            disabled={isLoading && true}
            onClick={() => {
              setAddDialogOpen(true);
            }}
          >
            <Plus />
            Add company
          </Button>
        </div>
      </CardHeader>
    );
  };

  return (
    <>
      <DataGrid
        table={table}
        recordCount={data?.pagination.total || 0}
        isLoading={isLoading}
        tableLayout={{
          columnsResizable: true,
          columnsPinnable: true,
          columnsMovable: true,
          columnsVisibility: true,
        }}
        tableClassNames={{
          edgeCell: 'px-5',
        }}
      >
        <Card>
          <DataGridToolbar />
          <CardTable>
            <ScrollArea>
              <DataGridTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardTable>
          <CardFooter>
            <DataGridPagination />
          </CardFooter>
        </Card>
      </DataGrid>

      <CompanyAddDialog
        open={addDialogOpen}
        closeDialog={() => setAddDialogOpen(false)}
      />
      <CompanyEditDialog
        open={editDialogOpen}
        closeDialog={() => setEditDialogOpen(false)}
        company={selectedCompany}
      />
      <CompanyTrashDialog
        open={trashDialogOpen}
        closeDialog={() => setTrashDialogOpen(false)}
        company={selectedCompany}
      />
      <CompanyImpersonateDialog
        open={impersonateDialogOpen}
        closeDialog={() => setImpersonateDialogOpen(false)}
        company={selectedCompany}
      />
    </>
  );
};

export default CompanyList;
