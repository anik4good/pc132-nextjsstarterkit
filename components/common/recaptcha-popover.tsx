'use client';

import { useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { RiErrorWarningFill } from '@remixicon/react';
import { toast } from 'sonner';
import { useRecaptchaV2 } from '@/hooks/use-recaptcha-v2';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface RecaptchaPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerify: (token: string) => void;
  trigger: React.ReactNode;
  verifyButtonText?: string;
}

export function RecaptchaPopover({
  open,
  onOpenChange,
  onVerify,
  trigger,
  verifyButtonText = 'Verify & Submit',
}: RecaptchaPopoverProps) {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || '';
  const { containerRef, getToken, resetCaptcha, initializeRecaptcha } =
    useRecaptchaV2(siteKey);

  // Without a site key the widget can't render — submit immediately so the
  // flow works out of the box; the server skips verification accordingly.
  useEffect(() => {
    if (open && !siteKey) {
      onOpenChange(false);
      onVerify('recaptcha-not-configured');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteKey]);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (newOpen && siteKey) {
      resetCaptcha();
      // Small delay to ensure the popover content is rendered
      setTimeout(() => {
        initializeRecaptcha();
      }, 100);
    }
  };

  const handleVerify = () => {
    try {
      const token = getToken();
      if (!token) {
        toast.custom(
          () => (
            <Alert variant="mono" icon="destructive">
              <AlertIcon>
                <RiErrorWarningFill />
              </AlertIcon>
              <AlertTitle>
                Please complete the reCAPTCHA verification.
              </AlertTitle>
            </Alert>
          ),
          {
            position: 'top-center',
          },
        );
        return;
      }
      onVerify(token);
    } catch (error) {
      console.error('Error getting reCAPTCHA token:', error);
      toast.custom(
        () => (
          <Alert variant="mono" icon="destructive">
            <AlertIcon>
              <RiErrorWarningFill />
            </AlertIcon>
            <AlertTitle>Please complete the reCAPTCHA verification.</AlertTitle>
          </Alert>
        ),
        {
          position: 'top-center',
        },
      );
      return;
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="bg-white p-4 rounded-lg shadow-lg z-50"
          sideOffset={5}
          align="end"
          onInteractOutside={(e) => {
            // Prevent closing when interacting with reCAPTCHA iframe
            if ((e.target as HTMLElement).tagName === 'IFRAME') {
              e.preventDefault();
            }
          }}
        >
          <div className="flex flex-col gap-4">
            <div ref={containerRef} className="min-h-[78px]" />
            <Button
              type="button"
              variant="mono"
              onClick={handleVerify}
              className="w-full"
            >
              {verifyButtonText}
            </Button>
          </div>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
