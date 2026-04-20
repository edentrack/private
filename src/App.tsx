import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { PermissionsProvider } from './contexts/PermissionsContext';
import { ToastProvider } from './contexts/ToastContext';
import { ImpersonationProvider } from './contexts/ImpersonationContext';
import { ImpersonationBanner } from './components/common/ImpersonationBanner';
import { LoginScreen } from './components/auth/LoginScreen';
import { SignUpScreen } from './components/auth/SignUpScreen';
import { ForgotPasswordScreen } from './components/auth/ForgotPasswordScreen';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { InviteAcceptPage } from './components/auth/InviteAcceptPage';
import { WaitingApprovalPage } from './components/auth/WaitingApprovalPage';
import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { SuperAdminGuard } from './components/superadmin/SuperAdminGuard';
import { SuperAdminDashboard } from './components/superadmin/SuperAdminDashboard';
import { UserApprovals } from './components/superadmin/UserApprovals';
import { UsersManagement } from './components/superadmin/UsersManagement';
import { PricingManagement } from './components/superadmin/PricingManagement';
import { FarmsManagement } from './components/superadmin/FarmsManagement';
import { MarketplaceAdmin } from './components/superadmin/MarketplaceAdmin';
import { Announcements } from './components/superadmin/Announcements';
import { SupportTickets } from './components/superadmin/SupportTickets';
import { ActivityLogs } from './components/superadmin/ActivityLogs';
import { BillingSubscriptions } from './components/superadmin/BillingSubscriptions';
import { PlatformSettings } from './components/superadmin/PlatformSettings';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { SmartDashboard } from './components/dashboard/SmartDashboard';
import { FlockManagement } from './components/flocks/FlockManagement';
import { MortalityTracking } from './components/mortality/MortalityTracking';
import { WeightTracking } from './components/weight/WeightTracking';
import { WeightCheckPage } from './components/weight/WeightCheckPage';
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard';
import { VaccinationSchedule } from './components/vaccinations/VaccinationSchedule';
import { ExpenseTracking } from './components/expenses/ExpenseTracking';
import { InventoryPage } from './components/inventory/InventoryPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { WorkerDashboard } from './components/worker/WorkerDashboard';
import { SalesManagement } from './components/sales/SalesManagement';
import { TeamManagement } from './components/team/TeamManagement';
import { ShiftsPage } from './components/shifts/ShiftsPage';
import { PayrollPage } from './components/payroll/PayrollPage';
import { TasksPage2 } from './components/tasks2/TasksPage2';
import { TaskHistoryPage } from './components/tasks/TaskHistoryPage';
import { InsightsPage } from './components/insights/InsightsPage';
import { AIAssistantPage } from './components/ai/AIAssistantPage';
import { HelperAssistant } from './components/helper/HelperAssistant';
// import { SmartUploadPage } from './components/import/SmartUploadPage';
import { ComparePage } from './components/compare/ComparePage';
import { MarketplacePage } from './components/marketplace/MarketplacePage';
// import ComingSoonPage from './components/roadmap/ComingSoonPage';
import LandingPage from './components/landing/LandingPage';
import { FarmActivityAudit } from './components/audit/FarmActivityAudit';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireRole } from './components/common/RequireRole';
import { LanguageProvider } from './contexts/LanguageContext';
import { Flock } from './types/database';

function AppContent() {
  const { t } = useTranslation();
  const { user, profile, loading, refreshSession, currentRole, currentFarm } = useAuth();
  const [authRoute, setAuthRoute] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password' | 'invite'>('login');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedFlock, setSelectedFlock] = useState<Flock | null>(null);
  const [pullToRefresh, setPullToRefresh] = useState({ isActive: false, distance: 0, isRefreshing: false });
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [showNoFarmMessage, setShowNoFarmMessage] = useState(false);

  // Only show "No farm assigned" after farm data has had time to load (avoid flash before currentFarm is set)
  useEffect(() => {
    if (user && !loading && !currentFarm && authRoute !== 'invite' && !inviteToken && !profile?.is_super_admin) {
      const t = window.setTimeout(() => setShowNoFarmMessage(true), 600);
      return () => clearTimeout(t);
    }
    setShowNoFarmMessage(false);
  }, [user, loading, currentFarm, authRoute, inviteToken, profile?.is_super_admin]);

  useEffect(() => {
    if (user && profile?.is_super_admin && !window.location.hash.includes('#/super-admin')) {
      window.location.hash = '#/super-admin';
      setCurrentView('super-admin');
      return;
    }

    // Onboarding wizard removed - users go directly to dashboard after approval
  }, [user, profile, currentRole]);

  useEffect(() => {
    if (user && pendingInviteToken) {
      window.location.hash = `#/invite/${pendingInviteToken}`;
      setPendingInviteToken(null);
    }
  }, [user, pendingInviteToken]);

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
        
        // Reload the page
        setTimeout(() => {
          window.location.reload();
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
      'mortality': '#/mortality',
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
    };
    
    const hash = hashMap[view] || '#/dashboard';
    // Update hash and dispatch event for mobile compatibility
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      // Dispatch hashchange event to ensure React re-renders immediately on mobile
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);

  useEffect(() => {
    let lastProcessedHash = window.location.hash;
    
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
      if (hash.includes('#/smart-dashboard')) {
        setCurrentView('smart-dashboard');
        return;
      }
      if (hash.includes('#/marketplace')) {
        setCurrentView('marketplace');
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
          onToggle={() => navigateToAuth('signup')}
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
    
    // Show landing page by default when not authenticated
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

  // Onboarding wizard removed - users go directly to dashboard

  // Logged-in user with no farm — show message only after load has settled (avoid flash before farm data loads)
  if (user && !loading && !currentFarm && authRoute !== 'invite' && !inviteToken && !profile?.is_super_admin) {
    if (!showNoFarmMessage) {
      return (
        <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full mx-4 text-center">
            <div className="w-12 h-12 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t('auth.setting_up_account', 'Setting up...')}</h2>
            <p className="text-gray-600 text-sm">{t('auth.loading_farm', 'Loading your farm')}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full mx-4 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('auth.no_farm_title', 'No farm assigned')}</h2>
          <p className="text-gray-600 text-sm mb-6">
            {t('auth.no_farm_message', 'Your account is not linked to a farm yet. If you accepted an invitation, try refreshing or sign out and sign in again.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => refreshSession?.()}
              className="px-4 py-2.5 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors font-medium"
            >
              {t('auth.retry_load', 'Retry')}
            </button>
          </div>
        </div>
      </div>
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
      case 'mortality':
        return (
          <RequireRole moduleId="mortality" onUnauthorized={handleUnauthorized}>
            <MortalityTracking flock={selectedFlock} />
          </RequireRole>
        );
      case 'weight':
        return (
          <RequireRole moduleId="weight" onUnauthorized={handleUnauthorized}>
            <WeightTracking flock={selectedFlock} />
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
      case 'vaccinations':
        return (
          <RequireRole moduleId="vaccinations" onUnauthorized={handleUnauthorized}>
            <VaccinationSchedule flock={selectedFlock} />
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
      // case 'smart-upload': // Disabled for now
      //   return (
      //     <RequireRole moduleId="smart-upload" onUnauthorized={handleUnauthorized}>
      //       <SmartUploadPage />
      //     </RequireRole>
      //   );
      case 'marketplace':
        return (
          <RequireRole moduleId="marketplace" onUnauthorized={handleUnauthorized}>
            <MarketplacePage />
          </RequireRole>
        );
      // case 'roadmap': // Disabled for now
      //   return (
      //     <RequireRole moduleId="roadmap" onUnauthorized={handleUnauthorized}>
      //       <ComingSoonPage />
      //     </RequireRole>
      //   );
      case 'helper':
        return <HelperAssistant onNavigate={setCurrentView} />;
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
    return renderView();
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
      <ImpersonationBanner />
      <DashboardLayout currentView={currentView} onNavigate={navigateToView}>
        {renderView()}
      </DashboardLayout>
    </div>
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
                <LanguageProvider>
                  <AppContent />
                </LanguageProvider>
              </ToastProvider>
            </RealtimeProvider>
          </PermissionsProvider>
        </ImpersonationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
