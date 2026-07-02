import { FullScreenLoader } from '@/shared/components/ui/FullScreenLoader';

/**
 * Route-level loading fallback (App Router). Shown instantly during navigation
 * and initial segment streaming so users never stare at a blank white screen.
 */
export default function Loading() {
  return <FullScreenLoader />;
}
