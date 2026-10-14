'use client';

import { ReactNode } from 'react';

/**
 * Starter-kit passthrough. The original Metronic template used this provider
 * to wire the demo store context; the kit keeps the hook point so additional
 * app-wide providers can be added in one place.
 */
export function ModulesProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
