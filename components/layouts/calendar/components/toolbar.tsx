'use client';

/**
 * Toolbar pieces for the EventCalendar suite.
 *
 * `ToolbarSidebarToggle` comes from Metronic's calendar page layout, which
 * wires it to that page's sidebar. Inside the starter kit the calendar is
 * embedded in the admin shell, where no such sidebar exists — so it renders
 * nothing unless a toggle function is provided via `CalendarSidebarToggleProvider`.
 */

import { createContext, useContext, ReactNode } from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SidebarToggleContext = createContext<(() => void) | null>(null);

export function CalendarSidebarToggleProvider({
  onToggle,
  children,
}: {
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <SidebarToggleContext.Provider value={onToggle}>
      {children}
    </SidebarToggleContext.Provider>
  );
}

export function ToolbarSidebarToggle() {
  const onToggle = useContext(SidebarToggleContext);
  if (!onToggle) return null;
  return (
    <Button
      variant="ghost"
      mode="icon"
      className="lg:hidden"
      onClick={onToggle}
      aria-label="Toggle sidebar"
    >
      <PanelLeft />
    </Button>
  );
}
