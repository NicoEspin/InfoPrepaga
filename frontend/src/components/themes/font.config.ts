import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cn } from '@/lib/utils';

// Fonts ship with the dependency; builds never contact Google Fonts.
export const fontVariables = cn(GeistSans.variable, GeistMono.variable);
