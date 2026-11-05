'use client';

import { createContext, useCallback, useContext, useId, useRef, useState } from 'react';
import { getLeadProfile } from '../api/service';
import type { LeadProfileLoader } from '../api/types';
import { LeadProfileModal } from './lead-profile-modal';
import dynamic from 'next/dynamic';
const CommercialProfileModal = dynamic(() =>
  import('@/features/crm/components/profile').then((module) => module.CommercialProfileModal)
);

const LeadProfileContext = createContext<((leadId: string) => void) | null>(null);

export function useLeadProfile() {
  const openLead = useContext(LeadProfileContext);
  if (!openLead) throw new Error('useLeadProfile requiere LeadProfileProvider');
  return { openLead };
}

export function LeadProfileProvider({
  children,
  loader = getLeadProfile
}: {
  children: React.ReactNode;
  loader?: LeadProfileLoader;
}) {
  const providerId = useId();
  const sequence = useRef(0);
  const currentOpening = useRef(0);
  const [selection, setSelection] = useState<{
    leadId: string;
    opening: number;
    trigger: HTMLElement | null;
  } | null>(null);
  const openLead = useCallback((leadId: string) => {
    const opening = ++sequence.current;
    currentOpening.current = opening;
    setSelection({
      leadId,
      opening,
      trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null
    });
  }, []);
  return (
    <LeadProfileContext.Provider value={openLead}>
      {children}
      {selection ? (
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(selection.leadId) ? (
          <CommercialProfileModal
            key={`${providerId}-${selection.opening}`}
            leadId={selection.leadId}
            opening={`${providerId}-${selection.opening}`}
            onClose={() => {
              currentOpening.current = 0;
              setSelection(null);
              requestAnimationFrame(() => {
                if (currentOpening.current === 0 && selection.trigger?.isConnected)
                  selection.trigger.focus({ preventScroll: true });
              });
            }}
          />
        ) : (
          <LeadProfileModal
            key={`${providerId}-${selection.opening}`}
            leadId={selection.leadId}
            opening={`${providerId}-${selection.opening}`}
            loader={loader}
            onClose={() => {
              if (currentOpening.current !== selection.opening) return;
              currentOpening.current = 0;
              setSelection(null);
              // Explicit restoration also covers immediate unmount and dynamic table triggers.
              requestAnimationFrame(() => {
                if (currentOpening.current !== 0) return;
                const target = selection.trigger?.isConnected
                  ? selection.trigger
                  : document.getElementById('crm-content');
                target?.focus({ preventScroll: true });
              });
            }}
          />
        )
      ) : null}
    </LeadProfileContext.Provider>
  );
}
