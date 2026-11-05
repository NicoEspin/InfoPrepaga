'use client';
import React from 'react';
import { ActiveThemeProvider } from '@/components/themes/active-theme';
import QueryProvider from '@/components/layout/query-provider';
import { LeadProfileProvider } from '@/features/lead-profile/components/lead-profile-provider';

export default function Providers({
  activeThemeValue,
  children
}: {
  activeThemeValue: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <ActiveThemeProvider initialTheme={activeThemeValue}>
        <QueryProvider>
          <LeadProfileProvider>{children}</LeadProfileProvider>
        </QueryProvider>
      </ActiveThemeProvider>
    </>
  );
}
