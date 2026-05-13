import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { ToastProvider } from './contexts/ToastContext';
import { ImpersonationProvider, useImpersonation } from './contexts/ImpersonationContext';
import { ImpersonationBanner } from './components/common/ImpersonationBanner';
import { BroadcastBanner } from './components/common/BroadcastBanner';
import { OnboardingTour, shouldShowTour } from './components/onboarding/OnboardingTour';
import { ErrorBoundaryWithTranslation as ErrorBoundary } from './components/ErrorBoundaryWithTranslation';
import { RequireRole } from './components/common/RequireRole';
import { LanguageProvider } from './contexts/LanguageContext';
import { SimpleModeProvider } from './contexts/SimpleModeContext';
import { Flock } from './types/database';
import { OverflowModal } from './components/billing/OverflowModal';
import { getMaxFarms, getMaxFlocks, getMaxTeamMembers } from './utils/planGating';
import { useFarmHeadcount } from './hooks/useFarmHeadcount';

// Auth screens — kept eager (shown before JS finishes loading)
import { LoginScreen } from './components/auth/LoginScreen';
import { SignUpScreen } from './components/auth/SignUpScreen';
import { ForgotPasswordScreen } from './components/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { InviteAcceptPage } from './components/auth/InviteAcceptPage';
import { WaitingApprovalPage } from './components/auth/WaitingApprovalPage';

// All page-level components — lazy-loaded on first visit
const lazy1 = <T extends { [k: string]: React.ComponentType<any> }>(path: () => Promise<T>, name: keyof T) =>
  lazy(() => (path() as Promise<T>).then(m => ({ default: m[name] as React.ComponentType<any> })));

const LandingPage            = lazy(() => import('./components/landing/LandingPage'));
const PrivacyPolicy          = lazy(() => import('./components/legal/PrivacyPolicy'));
const TermsOfService         = lazy(() => import('./components/legal/TermsOfService'));
const WelcomeAfterSignup     = lazy(() => import('./components/landing/WelcomeAfterSignup'));
const DashboardLayout        = lazy1(() => import('./components/dashboard/DashboardLayout'), 'DashboardLayout');
const DashboardHome          = lazy1(() => import('./components/dashboard/DashboardHome'), 'DashboardHome');
const SmartDashboard         = lazy1(() => import('./components/dashboard/SmartDashboard'), 'SmartDashboard');
const FlockManagement        = lazy1(() => import('./components/flocks/FlockManagement'), 'FlockManagement');
const MortalityTracking      = lazy1(() => import('./components/mortality/MortalityTracking'), 'MortalityTracking');
const WeightTracking         = lazy1(() => import('./components/weight/WeightTracking'), 'WeightTracking');
const WeightCheckPage        = lazy1(() => import('./components/weight/WeightCheckPage'), 'WeightCheckPage');
const AnalyticsDashboard     = lazy1(() => import('./components/analytics/AnalyticsDashboard'), 'AnalyticsDashboard');
const VaccinationSchedule    = lazy1(() => import('./components/vaccinations/VaccinationSchedule'), 'VaccinationSchedule');
const VetLog                 = lazy1(() => import('./components/vet/VetLog'), 'VetLog');
const ExpenseTracking        = lazy1(() => import('./components/expenses/ExpenseTracking'), 'ExpenseTracking');
const InventoryPage          = lazy1(() => import('./components/inventory/InventoryPage'), 'InventoryPage');
const SettingsPage           = lazy1(() => import('./components/settings/SettingsPage'), 'SettingsPage');
const WorkerDashboard        = lazy1(() => import('./components/worker/WorkerDashboard'), 'WorkerDashboard');
const SalesManagement        = lazy1(() => import('./components/sales/SalesManagement'), 'SalesManagement');
const TeamManagement         = lazy1(() => import('./components/team/TeamManagement'), 'TeamManagement');
const ShiftsPage             = lazy1(() => import('./components/shifts/ShiftsPage'), 'ShiftsPage');
const PayrollPage            = lazy1(() => import('./components/payroll/PayrollPage'), 'PayrollPage');
const TasksPage2             = lazy1(() => import('./components/tasks2/TasksPage2'), 'TasksPage2');
const JournalPage            = lazy1(() => import('./components/journal/JournalPage'), 'JournalPage');
const TaskHistoryPage        = lazy1(() => import('./components/tasks/TaskHistoryPage'), 'TaskHistoryPage');
const InsightsPage           = lazy1(() => import('./components/insights/InsightsPage'), 'InsightsPage');
const EggCollectionsPage     = lazy1(() => import('./components/eggs/EggCollectionsPage'), 'EggCollectionsPage');
const AIAssistantPage        = lazy1(() => import('./components/ai/AIAssistantPage'), 'AIAssistantPage');
const SmartUploadPage        = lazy1(() => import('./components/import/SmartUploadPage'), 'SmartUploadPage');
const OnboardingWizard       = lazy1(() => import('./components/onboarding/OnboardingWizard'), 'OnboardingWizard');
const OnboardingChoice       = lazy1(() => import('./components/onboarding/OnboardingChoice'), 'OnboardingChoice');
const OnboardingChat         = lazy1(() => import('./components/onboarding/OnboardingChat'), 'OnboardingChat');
const SubscribePage          = lazy1(() => import('./components/billing/SubscribePage'), 'SubscribePage');
const ComparePage            = lazy1(() => import('./components/compare/ComparePage'), 'ComparePage');
const MarketplacePage        = lazy1(() => import('./components/marketplace/MarketplacePage'), 'MarketplacePage');
const FarmActivityAudit      = lazy1(() => import('./components/audit/FarmActivityAudit'), 'FarmActivityAudit');
const SuperAdminGuard        = lazy1(() => import('./components/superadmin/SuperAdminGuard'), 'SuperAdminGuard');
const SuperAdminDashboard    = lazy1(() => import('./components/superadmin/SuperAdminDashboard'), 'SuperAdminDashboard');
const UserApprovals          = lazy1(() => import('./components/superadmin/UserApprovals'), 'UserApprovals');
const UsersManagement        = lazy1(() => import('./components/superadmin/UsersManagement'), 'UsersManagement');
const PricingManagement      = lazy1(() => import('./components/superadmin/PricingManagement'), 'PricingManagement');
const FarmsManagement        = lazy1(() => import('./components/superadmin/FarmsManagement'), 'FarmsManagement');
const MarketplaceAdmin       = lazy1(() => import('./components/superadmin/MarketplaceAdmin'), 'MarketplaceAdmin');
const Announcements          = lazy1(() => import('./components/superadmin/Announcements'), 'Announcements');
const BroadcastManager       = lazy1(() => import('./components/superadmin/BroadcastManager'), 'BroadcastManager');
const NotificationsPage      = lazy1(() => import('./components/notifications/NotificationsPage'), 'NotificationsPage');
const SupportTickets         = lazy1(() => import('./components/superadmin/SupportTickets'), 'SupportTickets');
const ActivityLogs           = lazy1(() => import('./components/superadmin/ActivityLogs'), 'ActivityLogs');
const BillingSubscriptions   = lazy1(() => import('./components/superadmin/BillingSubscriptions'), 'BillingSubscriptions');
const PlatformSettings       = lazy1(() => import('./components/superadmin/PlatformSettings'), 'PlatformSettings');
const WaterQualityPage       = lazy1(() => import('./components/aquaculture/WaterQualityPage'), 'WaterQualityPage');
const HarvestPage            = lazy1(() => import('./components/aquaculture/HarvestPage'), 'HarvestPage');
const SamplingEventsPage     = lazy1(() => import('./components/aquaculture/SamplingEventsPage'), 'SamplingEventsPage');
const StockingEventsPage     = lazy1(() => import('./components/aquaculture/StockingEventsPage'), 'StockingEventsPage');
const FishHealthPage         = lazy1(() => import('./components/aquaculture/FishHealthPage'), 'FishHealthPage');
const PondInspectionsPage    = lazy1(() => import('./components/aquaculture/PondInspectionsPage'), 'PondInspectionsPage');
const PondCheckPage          = lazy1(() => import('./components/aquaculture/PondCheckPage'), 'PondCheckPage');
const RabbitSalesPage        = lazy1(() => import('./components/rabbits/RabbitSalesPage'), 'RabbitSalesPage');
const RabbitGrowoutPage      = lazy1(() => import('./components/rabbits/RabbitGrowoutPage'), 'RabbitGrowoutPage');
const BreedingEventsPage     = lazy1(() => import('./components/rabbits/BreedingEventsPage'), 'BreedingEventsPage');
const LittersPage            = lazy1(() => import('./components/rabbits/LittersPage'), 'LittersPage');
const RabbitsRegistryPage    = lazy1(() => import('./components/rabbits/RabbitsRegistryPage'), 'RabbitsRegistryPage');
const ReportsPage            = lazy1(() => import('./components/reports/ReportsPage'), 'ReportsPage');
const CooperativesPage       = lazy1(() => import('./components/cooperatives/CooperativesPage'), 'CooperativesPage');
const CooperativeDashboard   = lazy1(() => import('./components/cooperatives/CooperativeDashboard'), 'CooperativeDashboard');
const CreditScorePage        = lazy1(() => import('./components/credit/CreditScorePage'), 'CreditScorePage');
const PondCyclePlanningPage  = lazy1(() => import('./components/aquaculture/planning/PondCyclePlanningPage'), 'PondCyclePlanningPage');

/**
 * Routes where the Crisp support launcher is allowed to render.
 * Everywhere else we hide the bubble — the user explicitly asked for this:
 * the Crisp button followed them through every page including data-entry
 * forms, which was visually noisy. Dashboard and Settings are the natural
 * places to ask for help; the rest of the app is for getting work done.
 */
const CRISP_ALLOWED_ROUTES = new Set([
  'dashboard',
  'settings',
  'profile', // settings sub-route
]);

function getCrispRoute(): string {
  // Hash routes look like "#/dashboard", "#/settings?tab=my-farms", etc.
  const hash = window.location.hash || '';
  const route = hash.replace(/^#\//, '').split(/[?#]/)[0] || 'dashboard';
  return route;
}

function CrispChat() {
  const { profile, user } = useAuth();
  const [route, setRoute] = useState<string>(getCrispRoute());

  // Track hash changes so the bubble visibility follows the route.
  useEffect(() => {
    const onHashChange = () => setRoute(getCrispRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    // Skip Crisp entirely on Capacitor native builds. Two reasons:
    //   1. Crisp's iframe injects an input that auto-focuses on load,
    //      popping the iOS keyboard up before the user does anything.
    //   2. Mobile users have other support paths (in-app help, email)
    //      and a floating chat bubble feels off in a native shell.
    // The web build at edentrack.app keeps Crisp untouched.
    if ((window as any).Capacitor?.isNativePlatform?.()) return;

    const id = import.meta.env.VITE_CRISP_WEBSITE_ID;
    if (!id) return;
    (window as any).$crisp = [];
    (window as any).CRISP_WEBSITE_ID = id;
    const s = document.createElement('script');
    s.src = 'https://client.crisp.chat/l.js';
    s.async = true;
    document.head.appendChild(s);
    // Keep chat closed by default — user opens it manually
    s.onload = () => {
      const crisp = (window as any).$crisp;
      if (crisp) {
        crisp.push(['do', 'chat:close']);
        crisp.push(['on', 'session:loaded', () => crisp.push(['do', 'chat:close'])]);
      }
    };
  }, []);

  // Show/hide the launcher based on the current route. Crisp's API:
  //   ['do', 'chat:show'] mounts the launcher
  //   ['do', 'chat:hide'] removes it
  // We poll briefly until $crisp is ready since Crisp's script loads async.
  useEffect(() => {
    const apply = () => {
      const crisp = (window as any).$crisp;
      if (!crisp || typeof crisp.push !== 'function') return false;
      const allowed = CRISP_ALLOWED_ROUTES.has(route);
      crisp.push(['do', allowed ? 'chat:show' : 'chat:hide']);
      return true;
    };
    if (apply()) return;
    // Retry until the script loads (gives up after ~5s).
    let tries = 0;
    const id = window.setInterval(() => {
      if (apply() || ++tries > 25) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [route]);

  // Yellow-halo painter. CSS alone can't reach into the Crisp iframe and
  // some Crisp builds put the launcher in a sibling sandbox. We paint a
  // div *behind* the launcher with the brand yellow halo so it visually
  // belongs to EdenTrack regardless of what Crisp ships in their iframe.
  // The Crisp dashboard's "Theme color" still controls the fill — change
  // it there to #ffdd00 for the full brand match.
  useEffect(() => {
    const ensureHalo = () => {
      const launcher = document.querySelector(
        'iframe[id^="crisp-chatbox"], iframe[name^="crisp-chatbox"], #crisp-chatbox > div',
      ) as HTMLElement | null;
      if (!launcher) return;
      let halo = document.getElementById('eden-crisp-halo') as HTMLDivElement | null;
      if (!halo) {
        halo = document.createElement('div');
        halo.id = 'eden-crisp-halo';
        Object.assign(halo.style, {
          position: 'fixed',
          width: '74px',
          height: '74px',
          borderRadius: '50%',
          background:
            'radial-gradient(closest-side, rgba(255,221,0,0.55), rgba(255,221,0,0.18) 65%, rgba(255,221,0,0) 100%)',
          pointerEvents: 'none',
          zIndex: '2147483640', // just below Crisp's launcher
          transition: 'opacity 200ms ease',
        } as CSSStyleDeclaration);
        document.body.appendChild(halo);
      }
      // Position relative to the launcher every frame so it tracks layout.
      const r = launcher.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      halo.style.left = `${cx - 37}px`;
      halo.style.top = `${cy - 37}px`;
      halo.style.opacity = CRISP_ALLOWED_ROUTES.has(route) ? '1' : '0';
    };
    const id = window.setInterval(ensureHalo, 400);
    ensureHalo();
    return () => {
      window.clearInterval(id);
      const h = document.getElementById('eden-crisp-halo');
      if (h) h.style.opacity = '0';
    };
  }, [route]);

  useEffect(() => {
    const crisp = (window as any).$crisp;
    if (!crisp || !profile) return;
    if (profile.email)     crisp.push(['set', 'user:email',    [profile.email]]);
    if (profile.full_name) crisp.push(['set', 'user:nickname', [profile.full_name]]);
    crisp.push(['set', 'session:data', [[
      ['user_id',            user?.id],
      ['subscription_tier',  profile.subscription_tier],
      ['country',            profile.country],
    ]]]);
  }, [profile, user]);

  return null;
}

function AppContent() {
  const { t } = useTranslation();
  const { user, profile, loading, refreshSession, currentRole, currentFarm, allFarms, effectiveTier } = useAuth();
  const { isImpersonating } = useImpersonation();
  const [authRoute, setAuthRoute] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password' | 'invite'>('login');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedFlock, setSelectedFlock] = useState<Flock | null>(null);
  const [selectedCooperativeId, setSelectedCooperativeId] = useState<string | null>(null);
  const [pullToRefresh, setPullToRefresh] = useState({ isActive: false, distance: 0, isRefreshing: false });
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [, setShowNoFarmMessage] = useState(false);
  const [showTour, setShowTour] = useState(false);
  // Overflow modal state — fires when trial expires and user has data exceeding free limits
  const [overflowItems, setOverflowItems] = useState<Array<{ id: string; type: 'farm' | 'flock' | 'team_member'; name: string; context?: string; isCurrentlyActive: boolean }>>([]);
  const [showOverflow, setShowOverflow] = useState(false);
  const prevEffectiveTierRef = useRef<string | null>(null);

  // Detect Flutterwave payment return (lands at origin with ?status=...&tx_ref=...&transaction_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('tx_ref') && params.has('transaction_id') && params.has('status')) {
      // guest=1 means unauthenticated checkout — LandingPage handles it, don't redirect
      if (params.get('guest') === '1') return;
      if (!window.location.hash || window.location.hash === '#') {
        window.location.hash = '#/subscribe';
      }
    }
  }, []);

  // Show onboarding tour for first-time users once farm loads
  useEffect(() => {
    if (user && currentFarm && !loading && shouldShowTour()) {
      const t = window.setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(t);
    }
  }, [user, currentFarm, loading]);

  // Overflow detection — fires when effectiveTier drops (e.g. trial expires) and the user
  // has data exceeding the new tier's limits. Runs 60s after tier is first seen so we
  // don't flash the modal on initial page load while data is still loading.
  useEffect(() => {
    if (!user || !profile || loading) return;
    const prev = prevEffectiveTierRef.current;
    prevEffectiveTierRef.current = effectiveTier;
    // Only trigger when tier has dropped (was higher, now lower)
    const tierRank: Record<string, number> = { free: 0, pro: 1, enterprise: 2, industry: 3 };
    if (prev !== null && (tierRank[prev] ?? 0) > (tierRank[effectiveTier] ?? 0)) {
      // Query current data to see if anything overflows the new tier
      const maxFarms = getMaxFarms(effectiveTier);
      const maxFlocks = getMaxFlocks(effectiveTier);
      const maxTeam = getMaxTeamMembers(effectiveTier);
      import('./lib/supabaseClient').then(({ supabase }) => {
        Promise.all([
          supabase.from('farms').select('id,name').eq('owner_id', user.id),
          supabase.from('flocks').select('id,name,farm_id,status').in('farm_id', allFarms.map(f => f.id)),
          supabase.from('farm_members').select('id,user_id,farm_id').in('farm_id', allFarms.map(f => f.id)),
        ]).then(([farmsRes, flocksRes, teamRes]) => {
          const farms = farmsRes.data ?? [];
          const flocks = (flocksRes.data ?? []).filter((fl: any) => fl.status === 'active');
          const team = teamRes.data ?? [];
          const items: typeof overflowItems = [];
          farms.forEach((f: any, i: number) => {
            if (i >= maxFarms) items.push({ id: f.id, type: 'farm', name: f.name, isCurrentlyActive: true });
          });
          flocks.forEach((fl: any, i: number) => {
            if (i >= maxFlocks) {
              const farmName = allFarms.find(f => f.id === fl.farm_id)?.name;
              items.push({ id: fl.id, type: 'flock', name: fl.name, context: farmName ? `in ${farmName}` : undefined, isCurrentlyActive: true });
            }
          });
          team.forEach((m: any, i: number) => {
            if (i >= maxTeam) items.push({ id: m.id, type: 'team_member', name: m.user_id, isCurrentlyActive: true });
          });
          if (items.length > 0) {
            setOverflowItems(items);
            setShowOverflow(true);
          }
        });
      });
    }
  }, [effectiveTier, user, profile, loading, allFarms]);

  // Only show "No farm assigned" for users who completed onboarding but lost their farm link (edge case).
  // New users who haven't completed onboarding go to the OnboardingWizard instead.
  useEffect(() => {
    if (user && !loading && !currentFarm && authRoute !== 'invite' && !inviteToken && !profile?.is_super_admin && profile?.onboarding_completed) {
      const t = window.setTimeout(() => setShowNoFarmMessage(true), 600);
      return () => clearTimeout(t);
    }
    setShowNoFarmMessage(false);
  }, [user, loading, currentFarm, authRoute, inviteToken, profile?.is_super_admin]);

  useEffect(() => {
    // Don't redirect super admin when they're actively impersonating — let them view the target user's farm
    if (user && profile?.is_super_admin && !isImpersonating && !window.location.hash.includes('#/super-admin')) {
      window.location.hash = '#/super-admin';
      setCurrentView('super-admin');
      return;
    }

    // Onboarding wizard removed - users go directly to dashboard after approval

    // New-user welcome screen.
    //
    // Show ONCE to users who:
    //   1. Have no farms yet (allFarms.length === 0), AND
    //   2. Haven't completed onboarding (profile.onboarding_completed
    //      is not true / status !== 'completed'), AND
    //   3. Haven't already seen this welcome on this device.
    //
    // PRIOR BUG (May 2026): the check was just (allFarms.length === 0
    // && !seen). That misfired for established users signing in on a
    // fresh Capacitor install: their localStorage was empty (so seen
    // was null), AND there's a brief window between auth completing
    // and the farms query resolving where allFarms is still []. The
    // useEffect fired during that gap and shoved them onto /welcome
    // even though they already had farms server-side. User feedback:
    // "I logged in on the test capacitor app, it still took me to the
    // landing page and asked me to continue to my account on dashboard."
    //
    // Adding the onboarding_completed check fixes this — that field
    // is set server-side after first-ever sign-up and follows the
    // user across devices, so an established user on a new install
    // still has it true and skips the welcome correctly.
    const hasCompletedOnboarding =
      profile?.onboarding_completed === true ||
      profile?.onboarding_status === 'completed';
    if (
      user &&
      profile &&
      !profile.is_super_admin &&
      !loading &&
      allFarms.length === 0 &&
      !hasCompletedOnboarding &&
      !window.location.hash.includes('#/welcome') &&
      !window.location.hash.includes('#/onboarding') &&
      !window.location.hash.includes('#/invite')
    ) {
      try {
        const seen = localStorage.getItem('eden_seen_welcome_after_signup');
        if (!seen) {
          window.location.hash = '#/welcome';
          setCurrentView('welcome');
        }
      } catch { /* localStorage unavailable */ }
    }
  }, [user, profile, currentRole, isImpersonating, loading, allFarms]);

  useEffect(() => {
    if (user && pendingInviteToken) {
      window.location.hash = `#/invite/${pendingInviteToken}`;
      setPendingInviteToken(null);
    }
  }, [user, pendingInviteToken]);

  // Auto-create farm from details collected during sign-up (stored in localStorage)
  useEffect(() => {
    if (!user || loading) return;
    const pendingFarmName = localStorage.getItem('pending_farm_name');
    if (!pendingFarmName) return;
    const pendingCountry = localStorage.getItem('pending_farm_country') || 'Nigeria';
    // Read the species the user picked at signup. Default to 'poultry' for any
    // legacy localStorage state from before the species selector landed, so we
    // don't crash existing in-flight signups during the rollout. Going forward
    // every new signup writes this key explicitly.
    const pendingFarmTypeRaw = localStorage.getItem('pending_farm_type');
    const pendingFarmType: 'poultry' | 'aquaculture' | 'rabbits' =
      pendingFarmTypeRaw === 'aquaculture' || pendingFarmTypeRaw === 'rabbits'
        ? pendingFarmTypeRaw
        : 'poultry';
    // Language picked on the signup screen (or auto-detected from
    // browser/OS) — copy it to the profile so Eden's first reply
    // is already in the right language. Without this, the user's
    // first chat with Eden was in English even when their UI was
    // French because the model only reads profile.preferred_language.
    const pendingPreferredLanguage = localStorage.getItem('pending_preferred_language');
    const preferredLanguage: 'en' | 'fr' | null =
      pendingPreferredLanguage === 'fr' || pendingPreferredLanguage === 'en'
        ? pendingPreferredLanguage
        : null;
    localStorage.removeItem('pending_farm_name');
    localStorage.removeItem('pending_farm_country');
    localStorage.removeItem('pending_farm_type');
    localStorage.removeItem('pending_preferred_language');

    import('./lib/supabaseClient').then(async ({ supabase }) => {
      // Don't create if already has a farm membership
      const { data: existing } = await supabase
        .from('farm_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        const profileUpdate: Record<string, any> = { onboarding_completed: true };
        if (preferredLanguage) profileUpdate.preferred_language = preferredLanguage;
        await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
        refreshSession?.();
        return;
      }

      const { getCurrencyForCountry } = await import('./utils/currency');
      const currencyCode = getCurrencyForCountry(pendingCountry);

      const { data: farm, error: farmError } = await supabase
        .from('farms')
        .insert({ name: pendingFarmName, owner_id: user.id, country: pendingCountry, currency_code: currencyCode, farm_type: pendingFarmType })
        .select('id')
        .single();
      if (farmError || !farm) {
        console.error('Auto-farm creation failed:', farmError);
        return;
      }

      const profileUpdate: Record<string, any> = { onboarding_completed: true, country: pendingCountry };
      if (preferredLanguage) profileUpdate.preferred_language = preferredLanguage;

      await Promise.all([
        supabase.from('farm_members').insert({ farm_id: farm.id, user_id: user.id, role: 'owner', is_active: true }),
        supabase.from('profiles').update(profileUpdate).eq('id', user.id),
      ]);

      refreshSession?.();
    });
  }, [user, loading]);


  // Apply pending farm join after signup — triggered when user auth resolves
  useEffect(() => {
    if (!user || loading) return;
    const pendingFarmId = sessionStorage.getItem('pending_farm_join_id');
    if (!pendingFarmId) return;
    const pendingSecret = sessionStorage.getItem('pending_farm_join_secret') || '';
    sessionStorage.removeItem('pending_farm_join_id');
    sessionStorage.removeItem('pending_farm_join_secret');
    import('./lib/supabaseClient').then(({ supabase }) => {
      supabase.rpc('join_farm_by_id', { p_farm_id: pendingFarmId, p_secret: pendingSecret }).then(({ data }) => {
        if (data?.ok) {
          if (data.already_member) {
            // Owner tapped their own link — just continue
          } else {
            // Worker successfully joined — mark onboarding complete so wizard doesn't show
            supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id).then(() => {
              refreshSession?.().then(() => {
                window.location.hash = '#/dashboard';
              });
            });
          }
        }
      });
    });
  }, [user, loading]);

  // Pull-to-refresh functionality for mobile
  useEffect(() => {
    if (!user) return; // Only enable when logged in

    let touchStartY = 0;
    let touchCurrentY = 0;
    let isPulling = false;
    let touchStartX = 0;
    const PULL_THRESHOLD = 200; // High threshold to prevent accidental reloads on mobile
    const MAX_PULL = 180; // max visual pull distance
    const HORIZONTAL_THRESHOLD = 50; // If horizontal movement exceeds this, cancel pull

    const handleTouchStart = (e: TouchEvent) => {
      // Don't activate if touching a button, link, or interactive element
      const target = e.target as HTMLElement;
      if (target.tagName === 'BUTTON' || 
          target.tagName === 'A' || 
          target.closest('button') || 
          target.closest('a') ||
          target.closest('[role="button"]') ||
          target.closest('.nav-pill') ||
          target.closest('nav')) {
        return;
      }

      // Only activate if at the top of the page and single touch
      if (window.scrollY === 0 && e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        isPulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || e.touches.length !== 1) return;

      touchCurrentY = e.touches[0].clientY;
      const touchCurrentX = e.touches[0].clientX;
      const pullDistance = Math.max(0, touchCurrentY - touchStartY);
      const horizontalDistance = Math.abs(touchCurrentX - touchStartX);

      // Cancel if horizontal movement is too much (user is swiping horizontally, not pulling down)
      if (horizontalDistance > HORIZONTAL_THRESHOLD) {
        setPullToRefresh({ isActive: false, distance: 0, isRefreshing: false });
        isPulling = false;
        return;
      }

      // Only allow pulling down (not up)
      if (pullDistance > 0 && window.scrollY === 0 && pullDistance > 20) {
        // Only prevent default if we're actually pulling (more than 20px)
        e.preventDefault();
        const clampedDistance = Math.min(pullDistance, MAX_PULL);
        setPullToRefresh({
          isActive: true,
          distance: clampedDistance,
          isRefreshing: false,
        });
      } else {
        setPullToRefresh({ isActive: false, distance: 0, isRefreshing: false });
        if (pullDistance < 10) {
          isPulling = false;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isPulling) return;

      const pullDistance = touchCurrentY - touchStartY;
      const horizontalDistance = Math.abs((e.changedTouches[0]?.clientX || touchStartX) - touchStartX);
      
      // Cancel if horizontal movement was significant
      if (horizontalDistance > HORIZONTAL_THRESHOLD) {
        setPullToRefresh({ isActive: false, distance: 0, isRefreshing: false });
        isPulling = false;
        touchStartY = 0;
        touchCurrentY = 0;
        touchStartX = 0;
        return;
      }
      
      if (pullDistance >= PULL_THRESHOLD) {
        // Trigger refresh
        setPullToRefresh({ isActive: true, distance: PULL_THRESHOLD, isRefreshing: true });
        
        // Dispatch refresh event so active views re-fetch their data
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('edentrack:refresh'));
          setPullToRefresh({ isActive: false, distance: 0, isRefreshing: false });
        }, 300);
      } else {
        // Reset pull indicator
        setPullToRefresh({ isActive: false, distance: 0, isRefreshing: false });
      }

      isPulling = false;
      touchStartY = 0;
      touchCurrentY = 0;
      touchStartX = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [user]);

  // Create a stable navigation function that updates both view and hash IMMEDIATELY
  const navigateToView = useCallback((view: string) => {
    // Update view state IMMEDIATELY (don't wait for hash change)
    setCurrentView(view);
    
    // Also update hash for URL consistency
    const hashMap: Record<string, string> = {
      'dashboard': '#/dashboard',
      'flocks': '#/flocks',
      'tasks': '#/tasks',
      'inventory': '#/inventory',
      'expenses': '#/expenses',
      'sales': '#/sales',
      'vaccinations': '#/vaccinations',
      'vet-log': '#/vet-log',
      'mortality': '#/mortality',
      'water-quality': '#/water-quality',
      'harvest': '#/harvest',
      'sampling': '#/sampling',
      'stocking': '#/stocking',
      'fish-health': '#/fish-health',
      'pond-inspections': '#/pond-inspections',
      'rabbit-sales': '#/rabbit-sales',
      'rabbit-growout': '#/rabbit-growout',
      'breeding-events': '#/breeding-events',
      'litters': '#/litters',
      'rabbit-registry': '#/rabbit-registry',
      'reports': '#/reports',
      'weight': '#/weight',
      'analytics': '#/analytics',
      'insights': '#/insights',
      'compare': '#/compare',
      'shifts': '#/shifts',
      'team': '#/team',
      'payroll': '#/payroll',
      'settings': '#/settings',
      'audit': '#/audit',
      'task-history': '#/task-history',
      'smart-dashboard': '#/smart-dashboard',
      'marketplace': '#/marketplace',
      'subscribe': '#/subscribe',
      'ai-assistant': '#/ai-assistant',
      'smart-upload': '#/smart-upload',
      'my-work': '#/my-work',
      'cooperatives': '#/cooperatives',
      'credit-score': '#/credit-score',
      'pond-planner': '#/pond-planner',
      'pond-check': '#/pond-check',
      'journal': '#/journal',
    };

    const hash = hashMap[view] ?? `#/${view}`;
    // Update hash and dispatch event for mobile compatibility
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      // Dispatch hashchange event to ensure React re-renders immediately on mobile
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);

  useEffect(() => {
    let lastProcessedHash = '';
    
    const handleHashChange = () => {
      const hash = window.location.hash;
      
      // Don't process if hash hasn't actually changed (prevents loops)
      if (hash === lastProcessedHash) return;
      
      lastProcessedHash = hash;
      
      // Update currentHash state (but don't use it as dependency to prevent loops)
      setCurrentHash(hash);
      
      // Handle auth routes even when not logged in (for landing page buttons)
      if (!user) {
        if (hash.includes('#/signup') || hash.includes('#/auth/signup')) {
          setAuthRoute('signup');
          return;
        } else if (hash.includes('#/forgot-password') || hash.includes('#/auth/forgot-password')) {
          setAuthRoute('forgot-password');
          return;
        } else if (hash.includes('#/reset-password') || hash.includes('#/auth/reset-password') || hash.includes('type=recovery')) {
          setAuthRoute('reset-password');
          return;
        } else if (hash.includes('#/login') || hash.includes('#/auth/login')) {
          setAuthRoute('login');
          return;
        } else if (hash.includes('#/auth/callback')) {
          // Email verification callback — Supabase handles the token automatically.
          // Redirect to dashboard; AuthContext will see email_confirmed_at set and activate profile.
          window.location.hash = '#/dashboard';
          return;
        }
        // Don't process further if not logged in and not an auth route
        return;
      }
      
      // Only handle app routes when logged in

      if (hash.includes('#/super-admin/approvals')) {
        setCurrentView('super-admin-approvals');
        return;
      }

      if (hash.includes('#/super-admin/users')) {
        setCurrentView('super-admin-users');
        return;
      }

      if (hash.includes('#/super-admin/pricing')) {
        setCurrentView('super-admin-pricing');
        return;
      }

      if (hash.includes('#/super-admin/farms')) {
        setCurrentView('super-admin-farms');
        return;
      }

      if (hash.includes('#/super-admin/marketplace')) {
        setCurrentView('super-admin-marketplace');
        return;
      }

      if (hash.includes('#/super-admin/announcements')) {
        setCurrentView('super-admin-announcements');
        return;
      }

      if (hash.includes('#/super-admin/broadcasts')) {
        setCurrentView('super-admin-broadcasts');
        return;
      }

      if (hash.includes('#/super-admin/support')) {
        setCurrentView('super-admin-support');
        return;
      }

      if (hash.includes('#/super-admin/activity')) {
        setCurrentView('super-admin-activity');
        return;
      }

      if (hash.includes('#/super-admin/billing')) {
        setCurrentView('super-admin-billing');
        return;
      }

      if (hash.includes('#/super-admin/settings')) {
        setCurrentView('super-admin-settings');
        return;
      }

      if (hash.includes('#/super-admin')) {
        setCurrentView('super-admin');
        return;
      }

      const inviteMatch = hash.match(/#\/invite\/([a-zA-Z0-9]+)/);
      if (inviteMatch) {
        setInviteToken(inviteMatch[1]);
        if (!user) {
          setPendingInviteToken(inviteMatch[1]);
        }
        setAuthRoute('invite');
        return;
      }

      // Farm join link: #/join/:farm_id/:secret
      const joinMatch = hash.match(/#\/join\/([0-9a-f-]{36})\/([0-9a-f]{32})/i);
      if (joinMatch) {
        const farmId = joinMatch[1];
        const secret = joinMatch[2];
        if (!user) {
          // Not logged in — store farm ID + secret and send to signup
          sessionStorage.setItem('pending_farm_join_id', farmId);
          sessionStorage.setItem('pending_farm_join_secret', secret);
          setAuthRoute('signup');
          window.location.hash = '#/signup';
        } else {
          // Already logged in — join directly
          import('./lib/supabaseClient').then(({ supabase }) => {
            supabase.rpc('join_farm_by_id', { p_farm_id: farmId, p_secret: secret }).then(({ data }) => {
              if (data?.ok) {
                if (!data.already_member) {
                  // Worker joined — mark onboarding complete so wizard doesn't show
                  supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id).then(() => {
                    refreshSession?.().then(() => {
                      window.location.hash = '#/dashboard';
                    });
                  });
                } else {
                  window.location.hash = '#/dashboard';
                }
              }
            });
          });
        }
        return;
      }

      // Demo booking is now handled inline in HeroSection

      // Handle main app routes (only when logged in)
      if (hash.includes('#/settings')) {
        setCurrentView('settings');
        return;
      }
      if (hash.includes('#/flocks')) {
        setCurrentView('flocks');
        return;
      }
      if (hash.includes('#/tasks')) {
        setCurrentView('tasks');
        return;
      }
      if (hash.includes('#/egg-records')) {
        setCurrentView('egg-records');
        return;
      }
      if (hash.includes('#/inventory')) {
        setCurrentView('inventory');
        return;
      }
      if (hash.includes('#/expenses')) {
        setCurrentView('expenses');
        return;
      }
      if (hash.includes('#/sales')) {
        setCurrentView('sales');
        return;
      }
      if (hash.includes('#/vaccinations')) {
        setCurrentView('vaccinations');
        return;
      }
      if (hash.includes('#/mortality')) {
        setCurrentView('mortality');
        return;
      }
      if (hash.includes('#/water-quality')) {
        setCurrentView('water-quality');
        return;
      }
      if (hash.includes('#/harvest')) {
        setCurrentView('harvest');
        return;
      }
      if (hash.includes('#/sampling')) {
        setCurrentView('sampling');
        return;
      }
      if (hash.includes('#/stocking')) {
        setCurrentView('stocking');
        return;
      }
      if (hash.includes('#/fish-health')) {
        setCurrentView('fish-health');
        return;
      }
      if (hash.includes('#/pond-inspections')) {
        setCurrentView('pond-inspections');
        return;
      }
      if (hash.includes('#/pond-check')) {
        setCurrentView('pond-check');
        return;
      }
      // Accept both the legacy '#/rabbit-harvest' hash and the new
      // '#/rabbit-sales' hash so bookmarks / WhatsApp links from
      // before the rename still land on the right page.
      if (hash.includes('#/rabbit-sales') || hash.includes('#/rabbit-harvest')) {
        setCurrentView('rabbit-sales');
        return;
      }
      if (hash.includes('#/rabbit-growout')) {
        setCurrentView('rabbit-growout');
        return;
      }
      if (hash.includes('#/breeding-events')) {
        setCurrentView('breeding-events');
        return;
      }
      if (hash.includes('#/litters')) {
        setCurrentView('litters');
        return;
      }
      if (hash.includes('#/rabbit-registry')) {
        setCurrentView('rabbit-registry');
        return;
      }
      if (hash.includes('#/reports')) {
        setCurrentView('reports');
        return;
      }
      if (hash.includes('#/weight')) {
        setCurrentView('weight');
        return;
      }
      if (hash.includes('#/analytics')) {
        setCurrentView('analytics');
        return;
      }
      if (hash.includes('#/insights')) {
        setCurrentView('insights');
        return;
      }
      if (hash.includes('#/compare')) {
        setCurrentView('compare');
        return;
      }
      if (hash.includes('#/shifts')) {
        setCurrentView('shifts');
        return;
      }
      if (hash.includes('#/team')) {
        setCurrentView('team');
        return;
      }
      if (hash.includes('#/payroll')) {
        setCurrentView('payroll');
        return;
      }
      if (hash.includes('#/audit')) {
        setCurrentView('audit');
        return;
      }
      if (hash.includes('#/task-history')) {
        setCurrentView('task-history');
        return;
      }
      if (hash.includes('#/journal')) {
        setCurrentView('journal');
        return;
      }
      if (hash.includes('#/smart-dashboard')) {
        setCurrentView('smart-dashboard');
        return;
      }
      if (hash.includes('#/marketplace')) {
        setCurrentView('marketplace');
        return;
      }
      if (hash.includes('#/subscribe') || hash.includes('#/billing') || hash.includes('#/subscription')) {
        setCurrentView('subscribe');
        return;
      }
      if (hash.includes('#/notifications')) {
        setCurrentView('notifications');
        return;
      }
      if (hash.includes('#/ai-assistant')) {
        setCurrentView('ai-assistant');
        return;
      }
      if (hash.includes('#/privacy')) {
        setCurrentView('privacy');
        return;
      }
      if (hash.includes('#/terms')) {
        setCurrentView('terms');
        return;
      }
      if (hash.includes('#/welcome')) {
        setCurrentView('welcome');
        return;
      }
      const coopMatch = hash.match(/#\/cooperatives\/([0-9a-f-]{36})/i);
      if (coopMatch) {
        setSelectedCooperativeId(coopMatch[1]);
        setCurrentView('cooperative-dashboard');
        return;
      }
      if (hash.includes('#/cooperatives')) {
        setSelectedCooperativeId(null);
        setCurrentView('cooperatives');
        return;
      }
      if (hash.includes('#/credit-score') || hash.includes('#/creditworthiness')) {
        setCurrentView('credit-score');
        return;
      }
      if (hash.includes('#/pond-planner') || hash.includes('#/pond-planning')) {
        setCurrentView('pond-planner');
        return;
      }
      if (hash.includes('#/dashboard')) {
        setCurrentView('dashboard');
        return;
      }

      // Auth routes are handled above when not logged in
      // Only process these if logged in (to handle navigation from within app)
      if (user) {
        if (hash.includes('#/signup') || hash.includes('#/auth/signup')) {
          setAuthRoute('signup');
          return;
        } else if (hash.includes('#/forgot-password') || hash.includes('#/auth/forgot-password')) {
          setAuthRoute('forgot-password');
          return;
        } else if (hash.includes('#/reset-password') || hash.includes('#/auth/reset-password') || hash.includes('type=recovery')) {
          setAuthRoute('reset-password');
          return;
        } else if (hash.includes('#/login') || hash.includes('#/auth/login')) {
          setAuthRoute('login');
          return;
        }

        // If hash is empty or doesn't match any route, only default to dashboard if logged in
        // Don't redirect if user is actively navigating (prevent interrupting navigation)
        if (!hash || hash === '#' || hash === '') {
          // Only set dashboard if we're not already there and we're logged in
          if (currentView !== 'dashboard' && user) {
            setCurrentView('dashboard');
            window.location.hash = '#/dashboard';
          }
          return;
        }

        // Audit fix: for unknown app routes (e.g. mistyped URLs like #/deaths
        // when the real route is #/mortality), normalise the hash so the URL
        // bar stops contradicting the rendered page. Previously the URL would
        // stick on /deaths while the dashboard rendered underneath, which
        // looked like a broken link.
        setCurrentView('dashboard');
        window.location.hash = '#/dashboard';
      }

      setInviteToken(null);
    };

    // Process initial hash immediately
    handleHashChange();
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    // Also listen for popstate (browser back/forward)
    window.addEventListener('popstate', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, [user]); // Removed currentHash from dependencies to prevent loops

  // Must be before any conditional returns (Rules of Hooks)
  const handleUnauthorized = useCallback(() => {
    navigateToView('dashboard');
  }, [navigateToView]);

  const navigateToAuth = (route: 'login' | 'signup' | 'forgot-password' | 'reset-password') => {
    // Update auth route immediately
    setAuthRoute(route);
    // Also update hash for URL consistency
    window.location.hash = `#/auth/${route}`;
    // Dispatch event for immediate React re-render
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const clearInviteAndGoToDashboard = async () => {
    setInviteToken(null);
    setPendingInviteToken(null);
    if (refreshSession) {
      await refreshSession();
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    window.location.hash = '';
    setCurrentView('dashboard');
  };

  const pageFallback = (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full mx-4 text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('auth.signing_you_in')}</h2>
          <p className="text-gray-600 text-sm">{t('auth.setting_up_account')}</p>
        </div>
      </div>
    );
  }

  if (authRoute === 'invite' && inviteToken) {
    return (
      <InviteAcceptPage
        token={inviteToken}
        onGoToLogin={() => navigateToAuth('login')}
        onGoToSignup={() => navigateToAuth('signup')}
        onSuccess={clearInviteAndGoToDashboard}
      />
    );
  }

  if (!user) {
    // Demo booking is now handled inline in HeroSection

    // Check hash directly for auth routes (use state to ensure re-render on change)
    const hash = currentHash || window.location.hash;
    if (hash.includes('#/signup') || hash.includes('#/auth/signup')) {
      // Native: account creation goes to web. Sign-up forms inside the
      // app are a fast path to App Store rejection (paywall, pricing,
      // collection of payment data outside IAP). On native, kick the
      // user to edentrack.app/#/signup in an in-app browser sheet,
      // then drop them on the Login screen so when they return after
      // signing up + paying on the web, they can immediately sign in.
      if ((window as any).Capacitor?.isNativePlatform?.()) {
        // Native shell tried to land on /#/signup. Route to the
        // marketing landing page instead — pricing UI inside the
        // native shell is an Apple Guideline 3.1 risk, and the
        // landing page is the canonical entry point for new users.
        import('./lib/capacitorNative').then(({ openInAppBrowser }) => {
          openInAppBrowser('https://edentrack.app/', { fullscreen: true });
        });
        return (
          <LoginScreen
            onToggle={() => {
              import('./lib/capacitorNative').then(({ openInAppBrowser }) => {
                openInAppBrowser('https://edentrack.app/', { fullscreen: true });
              });
            }}
            onForgotPassword={() => navigateToAuth('forgot-password')}
          />
        );
      }
      return <SignUpScreen onToggle={() => navigateToAuth('login')} />;
    }
    if (hash.includes('#/forgot-password') || hash.includes('#/auth/forgot-password')) {
      return <ForgotPasswordScreen onBack={() => navigateToAuth('login')} />;
    }
    if (hash.includes('#/reset-password') || hash.includes('#/auth/reset-password') || hash.includes('type=recovery')) {
      return <ResetPasswordScreen onSuccess={() => navigateToAuth('login')} />;
    }
    if (hash.includes('#/login') || hash.includes('#/auth/login')) {
      return (
        <LoginScreen
          // "Don't have an account? Sign up" — now sends the user to
          // the landing page rather than dumping them straight into a
          // 7-field wizard. From the landing they can read the pitch,
          // pick a plan from the pricing section, and the CTA there
          // routes them to the trimmed signup form. One smooth path
          // for new users; no parallel sign-up surfaces.
          onToggle={() => {
            window.location.hash = '';
            window.location.href = window.location.pathname || '/';
          }}
          onForgotPassword={() => navigateToAuth('forgot-password')}
        />
      );
    }
    
    // Handle specific auth routes from state (for cases where hash doesn't match)
    if (authRoute === 'reset-password') {
      return <ResetPasswordScreen onSuccess={() => navigateToAuth('login')} />;
    }
    if (authRoute === 'forgot-password') {
      return <ForgotPasswordScreen onBack={() => navigateToAuth('login')} />;
    }
    if (authRoute === 'signup') {
      return <SignUpScreen onToggle={() => navigateToAuth('login')} />;
    }
    if (authRoute === 'invite') {
      return (
        <InviteAcceptPage
          token={inviteToken || ''}
          onGoToLogin={() => navigateToAuth('login')}
          onGoToSignup={() => navigateToAuth('signup')}
          onSuccess={clearInviteAndGoToDashboard}
        />
      );
    }
    
    // Native shell: skip the marketing landing page entirely and drop
    // straight into Sign In. The landing page is a paywall + pricing
    // pitch for new visitors on the web; inside the iOS/Android app,
    // every user is either an existing customer signing back in or a
    // brand-new user who'll do the signup flow. Pricing UI inside the
    // app risks Apple Guideline 3.1 review issues anyway.
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      return (
        <LoginScreen
          onToggle={() => {
            // "Don't have an account? Sign Up" → open the marketing
            // LANDING PAGE in an in-app Safari sheet. The user sees
            // the full pitch, picks a plan from the pricing section,
            // and account creation happens on the web (so we don't
            // run the Apple Guideline 3.1 risk of pricing UI inside
            // the native shell). Once they finish, they come back
            // here to sign in.
            import('./lib/capacitorNative').then(({ openInAppBrowser }) => {
              openInAppBrowser('https://edentrack.app/', { fullscreen: true });
            });
          }}
          onForgotPassword={() => navigateToAuth('forgot-password')}
        />
      );
    }

    // Public pages — no auth required
    if (window.location.hash.includes('#/privacy')) {
      return <Suspense fallback={pageFallback}><PrivacyPolicy /></Suspense>;
    }
    if (window.location.hash.includes('#/terms')) {
      return <Suspense fallback={pageFallback}><TermsOfService /></Suspense>;
    }
    if (window.location.hash.includes('#/welcome')) {
      return (
        <Suspense fallback={pageFallback}>
          <WelcomeAfterSignup onContinue={() => {
            window.location.hash = '#/dashboard';
          }} />
        </Suspense>
      );
    }

    // Web: show landing page by default when not authenticated
    return <LandingPage />;
  }

  if (profile?.account_status === 'pending' && !profile?.is_super_admin) {
    // Show waiting approval page
    return <WaitingApprovalPage />;
  }

  if (profile?.account_status === 'suspended' && !profile?.is_super_admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🚫</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Suspended</h1>
          <p className="text-gray-600 mb-6">
            Your account has been suspended. Please contact support for more information.
          </p>
        </div>
      </div>
    );
  }

  if (profile?.account_status === 'rejected' && !profile?.is_super_admin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">❌</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Account Rejected</h1>
          <p className="text-gray-600 mb-6">
            Unfortunately, your account application was not approved.
          </p>
        </div>
      </div>
    );
  }

  // Subscription expiry gate — show subscribe page if trial/sub has expired
  // Super admins and free-tier users are exempt
  const subscriptionExpired =
    profile?.subscription_tier !== 'free' &&
    !profile?.is_super_admin &&
    profile?.subscription_expires_at != null &&
    new Date(profile.subscription_expires_at) < new Date();

  if (subscriptionExpired && currentView !== 'subscribe' && currentView !== 'settings') {
    return (
      <SubscribePage onBack={() => {
        window.location.hash = '#/dashboard';
        setCurrentView('dashboard');
      }} />
    );
  }

  // Phase 6 onboarding routing — read profiles.onboarding_status:
  //   not_started → ChoiceScreen (PR #ONBO-B)
  //   chose_chat  → conversational flow (PR #ONBO-C; falls through to
  //                 the wizard for now with a future hand-off, see below)
  //   chose_form  → existing wizard (unchanged)
  //   completed   → normal app
  // Backward-compat: if onboarding_status is undefined (column not yet
  // migrated on this DB) fall back to the legacy onboarding_completed
  // boolean.
  if (user && !loading && profile && !profile.is_super_admin && !profile.onboarding_completed) {
    const status = profile.onboarding_status;
    if (status === 'not_started' || status === undefined) {
      return (
        <OnboardingChoice
          onChose={async () => {
            if (refreshSession) await refreshSession();
          }}
        />
      );
    }
    if (status === 'chose_chat') {
      return (
        <OnboardingChat
          onComplete={async () => {
            if (refreshSession) await refreshSession();
          }}
          onSwitchToForm={async () => {
            if (refreshSession) await refreshSession();
          }}
        />
      );
    }
    // 'chose_form' (and any other state) → existing wizard.
    return (
      <OnboardingWizard
        onComplete={async () => {
          if (refreshSession) await refreshSession();
        }}
      />
    );
  }

  // ── Standalone Subscribe page ──────────────────────────────────────
  // When a logged-in user manually navigates to /#/subscribe (e.g. via
  // an Upgrade button), render the page WITHOUT the DashboardLayout
  // chrome around it. This makes the in-app upgrade page look
  // identical to the landing's pricing section — full-screen black
  // with the gold Grower card, no cream nav above. Previously
  // SubscribePage was wrapped by DashboardLayout via renderView(),
  // which broke the visual continuity from the marketing site.
  //
  // We deliberately skip this when ?cross_dashboard params or invite
  // tokens are mid-flight, so we don't strand a user in-progress.
  if (currentView === 'subscribe' && !inviteToken) {
    return (
      <Suspense fallback={pageFallback}>
        <SubscribePage onBack={() => {
          window.location.hash = '#/dashboard';
          setCurrentView('dashboard');
        }} />
      </Suspense>
    );
  }



  const renderView = () => {
    switch (currentView) {
      case 'super-admin':
        return (
          <SuperAdminGuard>
            <SuperAdminDashboard />
          </SuperAdminGuard>
        );
      case 'super-admin-approvals':
        return (
          <SuperAdminGuard>
            <UserApprovals />
          </SuperAdminGuard>
        );
      case 'super-admin-users':
        return (
          <SuperAdminGuard>
            <UsersManagement />
          </SuperAdminGuard>
        );
      case 'super-admin-pricing':
        return (
          <SuperAdminGuard>
            <PricingManagement />
          </SuperAdminGuard>
        );
      case 'super-admin-farms':
        return (
          <SuperAdminGuard>
            <FarmsManagement />
          </SuperAdminGuard>
        );
      case 'super-admin-marketplace':
        return (
          <SuperAdminGuard>
            <MarketplaceAdmin />
          </SuperAdminGuard>
        );
      case 'super-admin-announcements':
        return (
          <SuperAdminGuard>
            <Announcements />
          </SuperAdminGuard>
        );
      case 'super-admin-broadcasts':
        return (
          <SuperAdminGuard>
            <BroadcastManager />
          </SuperAdminGuard>
        );
      case 'super-admin-support':
        return (
          <SuperAdminGuard>
            <SupportTickets />
          </SuperAdminGuard>
        );
      case 'super-admin-activity':
        return (
          <SuperAdminGuard>
            <ActivityLogs />
          </SuperAdminGuard>
        );
      case 'super-admin-billing':
        return (
          <SuperAdminGuard>
            <BillingSubscriptions />
          </SuperAdminGuard>
        );
      case 'super-admin-settings':
        return (
          <SuperAdminGuard>
            <PlatformSettings />
          </SuperAdminGuard>
        );
      case 'worker':
        return <WorkerDashboard onNavigate={setCurrentView} />;
      case 'dashboard':
        return (
          <RequireRole moduleId="dashboard" onUnauthorized={handleUnauthorized}>
            <DashboardHome
              onNavigate={setCurrentView}
              onSelectFlock={setSelectedFlock}
            />
          </RequireRole>
        );
      case 'flocks':
        return (
          <RequireRole moduleId="flocks" onUnauthorized={handleUnauthorized}>
            <FlockManagement
              onSelectFlock={setSelectedFlock}
              onNavigate={setCurrentView}
            />
          </RequireRole>
        );
      case 'tasks':
        return (
          <RequireRole moduleId="tasks" onUnauthorized={handleUnauthorized}>
            <TasksPage2 />
          </RequireRole>
        );
      case 'egg-records':
        return (
          <RequireRole moduleId="egg-records" onUnauthorized={handleUnauthorized}>
            <EggCollectionsPage />
          </RequireRole>
        );
      case 'mortality':
        return (
          <RequireRole moduleId="mortality" onUnauthorized={handleUnauthorized}>
            <MortalityTracking flock={selectedFlock} />
          </RequireRole>
        );
      case 'weight':
        return (
          <RequireRole moduleId="weight" onUnauthorized={handleUnauthorized}>
            <WeightTracking flock={selectedFlock} onNavigate={navigateToView} />
          </RequireRole>
        );
      case 'weight-check':
        return selectedFlock ? (
          <RequireRole moduleId="weight" onUnauthorized={handleUnauthorized}>
            <WeightCheckPage
              flock={selectedFlock}
              onBack={() => setCurrentView('flocks')}
            />
          </RequireRole>
        ) : (
          <DashboardHome
            onNavigate={setCurrentView}
            onSelectFlock={setSelectedFlock}
          />
        );
      case 'insights':
        return (
          <RequireRole moduleId="insights" onUnauthorized={handleUnauthorized}>
            <InsightsPage />
          </RequireRole>
        );
      case 'compare':
        return (
          <RequireRole moduleId="compare" onUnauthorized={handleUnauthorized}>
            <ComparePage onNavigate={setCurrentView} />
          </RequireRole>
        );
      case 'analytics':
        return (
          <RequireRole moduleId="analytics" onUnauthorized={handleUnauthorized}>
            <AnalyticsDashboard flock={selectedFlock} />
          </RequireRole>
        );
      case 'inventory':
        return (
          <RequireRole moduleId="inventory" onUnauthorized={handleUnauthorized}>
            <InventoryPage onNavigate={setCurrentView} />
          </RequireRole>
        );
      case 'journal':
        return <JournalPage />;
      case 'vaccinations':
        return (
          <RequireRole moduleId="vaccinations" onUnauthorized={handleUnauthorized}>
            <VaccinationSchedule flock={selectedFlock} />
          </RequireRole>
        );
      case 'water-quality':
        return <WaterQualityPage onNavigate={navigateToView} />;
      case 'harvest':
        return <HarvestPage />;
      case 'sampling':
        return <SamplingEventsPage onNavigate={navigateToView} />;
      case 'stocking':
        return <StockingEventsPage />;
      case 'fish-health':
        return <FishHealthPage />;
      case 'pond-inspections':
        return <PondInspectionsPage />;
      case 'pond-check':
        return <PondCheckPage />;
      case 'rabbit-sales':
        return <RabbitSalesPage />;
      case 'rabbit-growout':
        return <RabbitGrowoutPage />;
      case 'breeding-events':
        return <BreedingEventsPage />;
      case 'litters':
        return <LittersPage />;
      case 'rabbit-registry':
        return <RabbitsRegistryPage />;
      case 'reports':
        return <ReportsPage />;
      case 'vet-log':
        return (
          <RequireRole moduleId="vet-log" onUnauthorized={handleUnauthorized}>
            <VetLog />
          </RequireRole>
        );
      case 'expenses':
        return (
          <RequireRole moduleId="expenses" onUnauthorized={handleUnauthorized}>
            <ExpenseTracking />
          </RequireRole>
        );
      case 'sales':
        return (
          <RequireRole moduleId="sales" onUnauthorized={handleUnauthorized}>
            <SalesManagement />
          </RequireRole>
        );
      case 'shifts':
        return (
          <RequireRole moduleId="shifts" onUnauthorized={handleUnauthorized}>
            <ShiftsPage />
          </RequireRole>
        );
      case 'team':
        return (
          <RequireRole moduleId="team" onUnauthorized={handleUnauthorized}>
            <TeamManagement />
          </RequireRole>
        );
      case 'payroll':
        return (
          <RequireRole moduleId="payroll" onUnauthorized={handleUnauthorized}>
            <PayrollPage />
          </RequireRole>
        );
      case 'task-history':
        return (
          <RequireRole moduleId="task-history" onUnauthorized={handleUnauthorized}>
            <TaskHistoryPage />
          </RequireRole>
        );
      case 'audit':
        return (
          <RequireRole moduleId="audit" onUnauthorized={handleUnauthorized}>
            <FarmActivityAudit />
          </RequireRole>
        );
      case 'settings':
        return (
          <RequireRole moduleId="settings" onUnauthorized={handleUnauthorized}>
            <SettingsPage onNavigate={setCurrentView} />
          </RequireRole>
        );
      case 'smart-dashboard':
        return (
          <RequireRole moduleId="smart-dashboard" onUnauthorized={handleUnauthorized}>
            <SmartDashboard />
          </RequireRole>
        );
      case 'ai-assistant':
        return (
          <RequireRole moduleId="ai-assistant" onUnauthorized={handleUnauthorized}>
            <AIAssistantPage />
          </RequireRole>
        );
      case 'smart-upload':
        return (
          <RequireRole moduleId="smart-upload" onUnauthorized={handleUnauthorized}>
            <SmartUploadPage />
          </RequireRole>
        );
      case 'marketplace':
        return (
          <RequireRole moduleId="marketplace" onUnauthorized={handleUnauthorized}>
            <MarketplacePage />
          </RequireRole>
        );
      case 'subscribe':
        return (
          <SubscribePage onBack={() => {
            window.location.hash = '#/dashboard';
            setCurrentView('dashboard');
          }} />
        );
      case 'welcome':
        return (
          <Suspense fallback={pageFallback}>
            <WelcomeAfterSignup onContinue={() => {
              window.location.hash = '#/dashboard';
              setCurrentView('dashboard');
            }} />
          </Suspense>
        );
      case 'privacy':
        return <PrivacyPolicy />;
      case 'terms':
        return <TermsOfService />;
      case 'notifications':
        return <NotificationsPage />;
      case 'cooperatives':
        return <CooperativesPage />;
      case 'cooperative-dashboard':
        return selectedCooperativeId ? (
          <CooperativeDashboard
            cooperativeId={selectedCooperativeId}
            onBack={() => {
              window.location.hash = '#/cooperatives';
              setSelectedCooperativeId(null);
              setCurrentView('cooperatives');
            }}
          />
        ) : (
          <CooperativesPage />
        );
      case 'credit-score':
        return (
          <RequireRole moduleId="credit-score" onUnauthorized={handleUnauthorized}>
            <CreditScorePage />
          </RequireRole>
        );
      case 'pond-planner':
        return (
          <RequireRole moduleId="pond-planner" onUnauthorized={handleUnauthorized}>
            <PondCyclePlanningPage />
          </RequireRole>
        );
      // case 'roadmap': // Disabled for now
      //   return (
      //     <RequireRole moduleId="roadmap" onUnauthorized={handleUnauthorized}>
      //       <ComingSoonPage />
      //     </RequireRole>
      //   );
      // case 'helper':
      //   return <HelperAssistant onNavigate={setCurrentView} />; // Wave 1: KILLED
      default:
        return (
          <RequireRole moduleId="dashboard" onUnauthorized={handleUnauthorized}>
            <DashboardHome
              onNavigate={setCurrentView}
              onSelectFlock={setSelectedFlock}
            />
          </RequireRole>
        );
    }
  };

  if (currentView.startsWith('super-admin')) {
    return <Suspense fallback={pageFallback}>{renderView()}</Suspense>;
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #ebe4d8 50%, #f0e9dd 100%)', minHeight: '100vh', position: 'relative' }}>
      {/* Pull-to-refresh indicator */}
      {pullToRefresh.isActive && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            transition: pullToRefresh.isRefreshing ? 'none' : 'transform 0.2s ease-out',
            transformOrigin: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            paddingTop: `${Math.max(0, pullToRefresh.distance - 40)}px`,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(75, 61, 36, 0.3)',
              borderTopColor: '#4B3D24',
              borderRadius: '50%',
              animation: pullToRefresh.isRefreshing ? 'spin 0.6s linear infinite' : 'none',
              transition: 'transform 0.2s',
              transform: pullToRefresh.isRefreshing
                ? 'rotate(0deg)'
                : `rotate(${Math.min(pullToRefresh.distance * 3, 180)}deg)`,
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#4B3D24',
              opacity: Math.min(pullToRefresh.distance / 80, 1),
            }}
          >
            {pullToRefresh.distance >= 80 ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <BroadcastBanner />
      <ImpersonationBanner />
      <OverflowModalWithHeadcount
        showOverflow={showOverflow}
        onClose={() => setShowOverflow(false)}
        effectiveTier={effectiveTier}
        overflowItems={overflowItems}
        onUpgrade={() => {
          window.location.hash = '#/subscribe';
          setCurrentView('subscribe');
          setShowOverflow(false);
        }}
      />
      <Suspense fallback={null}>
        <DashboardLayout currentView={currentView} onNavigate={navigateToView}>
          <Suspense fallback={pageFallback}>
            {renderView()}
          </Suspense>
        </DashboardLayout>
      </Suspense>
      {showTour && (
        <OnboardingTour
          onComplete={() => setShowTour(false)}
          onNavigate={navigateToView}
        />
      )}
    </div>
  );
}

/**
 * Wrapper that reads the current farm's animal headcount and threads
 * it into OverflowModal so the user sees the headcount overflow
 * banner alongside the farm/flock/team archiving choices.
 *
 * Kept here (not in OverflowModal itself) because OverflowModal is
 * deliberately a pure presentational component — the consumer owns
 * data fetching. Same reason we read flocks/teams/farms upstream.
 */
function OverflowModalWithHeadcount(props: {
  showOverflow: boolean;
  onClose: () => void;
  effectiveTier: 'free' | 'pro' | 'enterprise' | 'industry';
  overflowItems: Parameters<typeof OverflowModal>[0]['items'];
  onUpgrade: () => void;
}) {
  const { currentFarm } = useAuth();
  const { status } = useFarmHeadcount(currentFarm?.id, props.effectiveTier);
  return (
    <OverflowModal
      open={props.showOverflow}
      onClose={props.onClose}
      effectiveTier={props.effectiveTier}
      items={props.overflowItems}
      onUpgrade={props.onUpgrade}
      onArchive={async () => props.onClose()}
      headcount={status}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ImpersonationProvider>
          <PermissionsProvider>
            <RealtimeProvider>
              <ToastProvider>
                <SimpleModeProvider>
                <LanguageProvider>
                  <CrispChat />
                  <AppContent />
                </LanguageProvider>
                </SimpleModeProvider>
              </ToastProvider>
            </RealtimeProvider>
          </PermissionsProvider>
        </ImpersonationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
