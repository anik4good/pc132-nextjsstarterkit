'use client';

import { RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Company } from '@/app/models/company';

interface CompanyTrashDialogProps {
  open: boolean;
  closeDialog: () => void;
  company: Company | null;
}

/** First DELETE trashes the company, a second one removes it permanently. */
const CompanyTrashDialog = ({
  open,
  closeDialog,
  company,
}: CompanyTrashDialogProps) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        `/api/user-management/companies/${company?.id}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: (result: { message?: string }) => {
      toast.custom(
        () => (
          <Alert variant="mono" icon="success" close={false}>
            <AlertIcon>
              <RiCheckboxCircleFill />
            </AlertIcon>
            <AlertTitle>{result.message || 'Company deleted.'}</AlertTitle>
          </Alert>
        ),
        {
          position: 'top-center',
        },
      );

      queryClient.invalidateQueries({ queryKey: ['user-companies'] });
      queryClient.invalidateQueries({ queryKey: ['user-company-select'] });
      closeDialog();
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
        {
          position: 'top-center',
        },
      );
    },
  });

  const isProcessing = mutation.status === 'pending';
  const isTrashed = company?.isTrashed ?? false;

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isTrashed ? 'Delete permanently' : 'Move to trash'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="pt-2.5 space-y-2">
          {isTrashed ? (
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">
                {company?.name}
              </span>{' '}
              is already in the trash. Deleting removes it permanently. This
              action cannot be undone.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Move <span className="text-foreground font-medium">{company?.name}</span>{' '}
              to trash? The company will be suspended and can be restored later.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={isProcessing}
          >
            {isProcessing && <LoaderCircleIcon className="animate-spin" />}
            {isTrashed ? 'Delete permanently' : 'Move to trash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyTrashDialog;
