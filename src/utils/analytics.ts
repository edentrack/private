/**
 * trackEvent — thin wrapper around analytics that's a no-op when no provider
 * is wired up. Currently looks for window.posthog (loaded via the existing
 * Crisp/PostHog snippet pattern in App.tsx). If neither is present, the
 * call is silently dropped.
 *
 * This lets product instrument events without committing to a specific
 * vendor SDK. Add a vendor-specific implementation here when the analytics
 * provider is finalised.
 */

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProps = Record<string, AnalyticsValue>;

interface PostHogLike {
  capture: (event: string, props?: AnalyticsProps) => void;
}

function getProvider(): PostHogLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { posthog?: PostHogLike };
  if (w.posthog && typeof w.posthog.capture === 'function') {
    return w.posthog;
  }
  return null;
}

export function trackEvent(event: string, props?: AnalyticsProps): void {
  try {
    const provider = getProvider();
    if (provider) {
      provider.capture(event, props);
      return;
    }
    // Dev visibility — log only in non-production.
    if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
      // eslint-disable-next-line no-console
      console.debug('[analytics:noop]', event, props);
    }
  } catch {
    /* never throw out of analytics */
  }
}
