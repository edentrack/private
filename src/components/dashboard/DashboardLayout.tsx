import { ReactNode, useState, useRef, useEffect } from 'react';
import { LayoutDashboard, TrendingUp, Syringe, DollarSign, Settings, LogOut, Package, Briefcase, ShoppingCart, Users, Calendar, Wallet, User, ChevronDown, Menu, Shield, Scale, Store, GitCompare, ChevronRight, History, HelpCircle, FileText, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { ChickenIcon } from '../icons/ChickenIcon';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { canViewModule, ModuleName } from '../../utils/navigationPermissions';
import HelpModal from '../help/HelpModal';
import { LogoIcon } from '../common/Logo';
import { getNavigationGroups, getExpandedGroups, saveExpandedGroups, NavigationGroupId } from '../../utils/navigationGroups';
import { OfflineIndicator } from '../common/OfflineIndicator';
import { initOfflineSync } from '../../lib/offlineSync';
import { NotificationPermissionPrompt } from '../common/NotificationPermissionPrompt';
import { initPushNotifications } from '../../lib/pushNotifications';

interface DashboardLayoutProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

export function DashboardLayout({ children, currentView, onNavigate }: DashboardLayoutProps) {
  const { t } = useTranslation();
  const { profile, signOut, user, currentRole, currentFarm } = useAuth();
  const { farmPermissions } = usePermissions();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [desktopMoreMenuOpen, setDesktopMoreMenuOpen] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<NavigationGroupId>>(() => getExpandedGroups());
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const desktopMoreMenuRef = useRef<HTMLDivElement>(null);
  const mobileMoreMenuRef = useRef<HTMLDivElement>(null);

  const handleNavigate = (view: string) => {
    try {
      // Prevent rapid navigation clicks from causing issues
      if (currentView === view) return;
      
      onNavigate(view);
    } catch (error) {
      console.error('Navigation error:', error);
      onNavigate('dashboard');
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
      if (desktopMoreMenuRef.current && !desktopMoreMenuRef.current.contains(event.target as Node)) {
        setDesktopMoreMenuOpen(false);
      }
      if (mobileMoreMenuRef.current && !mobileMoreMenuRef.current.contains(event.target as Node)) {
        setMobileMoreMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    
    // Initialize offline sync
    initOfflineSync();
    
    // Initialize push notifications
    initPushNotifications();
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNavItems = () => {
    const allItems: Array<{ id: ModuleName; label: string; icon: any }> = [
      { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      { id: 'flocks', label: t('nav.flocks'), icon: ChickenIcon },
      { id: 'insights', label: t('nav.insights'), icon: TrendingUp },
      { id: 'tasks', label: t('nav.tasks') || 'Tasks', icon: ListChecks },
      { id: 'compare', label: t('nav.compare'), icon: GitCompare },
      { id: 'inventory', label: t('nav.inventory'), icon: Package },
      { id: 'vaccinations', label: t('nav.vaccinations'), icon: Syringe },
      { id: 'expenses', label: t('nav.expenses'), icon: DollarSign },
      { id: 'sales', label: t('nav.sales'), icon: ShoppingCart },
      { id: 'weight', label: t('nav.weight'), icon: Scale },
      { id: 'shifts', label: t('nav.shifts'), icon: Calendar },
      { id: 'team', label: t('nav.team'), icon: Users },
      { id: 'task-history', label: t('nav.task_history'), icon: History },
      { id: 'payroll', label: t('nav.payroll'), icon: Wallet },
      { id: 'audit', label: t('nav.audit'), icon: FileText },
      { id: 'settings', label: t('nav.settings') || 'Settings', icon: Settings },
      // { id: 'smart-upload', label: t('nav.import'), icon: Upload }, // Disabled for now
      { id: 'marketplace', label: t('nav.marketplace'), icon: Store },
      // { id: 'roadmap', label: 'Coming Soon', icon: Rocket }, // Disabled for now
    ];

    const filteredItems = allItems.filter(item => {
      const visibility = canViewModule(currentRole, item.id, farmPermissions);
      return visibility.visible;
    });

    if (currentRole === 'worker') {
      filteredItems.unshift({ id: 'my-work', label: t('nav.my_work'), icon: Briefcase });
    }

    return filteredItems;
  };

  const navItems = getNavItems();
  const navGroups = getNavigationGroups(navItems);

  const toggleGroup = (groupId: NavigationGroupId) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
    saveExpandedGroups(newExpanded);
  };

  const collapseAll = () => {
    const empty = new Set<NavigationGroupId>();
    setExpandedGroups(empty);
    saveExpandedGroups(empty);
  };

  const expandAll = () => {
    const all = new Set<NavigationGroupId>(['core', 'production', 'financial', 'operations', 'tools', 'other']);
    setExpandedGroups(all);
    saveExpandedGroups(all);
  };

  // Separate main tabs from others for mobile
  // (Keep "Expenses" as a primary tab on mobile as requested.)
  const mainTabIds = ['dashboard', 'flocks', 'insights', 'expenses'];
  
  const getMobileMainTabs = () => {
    return [
      navItems.find(item => item.id === 'dashboard'),
      navItems.find(item => item.id === 'flocks'),
      navItems.find(item => item.id === 'insights'),
      navItems.find(item => item.id === 'expenses')
    ].filter((item): item is { id: ModuleName; label: string; icon: any } => item !== undefined);
  };

  const getMobileOtherItems = () => {
    return navItems.filter(item => !mainTabIds.includes(item.id));
  };

  const mobileMainTabs = getMobileMainTabs();
  const mobileOtherItems = getMobileOtherItems();

  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateOfflineStatus = () => {
      setIsOffline(!navigator.onLine);
    };
    updateOfflineStatus();
    window.addEventListener('online', updateOfflineStatus);
    window.addEventListener('offline', updateOfflineStatus);
    return () => {
      window.removeEventListener('online', updateOfflineStatus);
      window.removeEventListener('offline', updateOfflineStatus);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F0E8]" style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #ebe4d8 50%, #f0e9dd 100%)' }}>
      <OfflineIndicator />
      <nav className="sticky top-0 z-40 glass-light border-b border-white/20" style={isOffline ? { marginTop: '40px' } : undefined}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center h-14 sm:h-16 gap-3 sm:gap-4 lg:gap-8">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <LogoIcon size="sm" />
              <div className="block">
                <h1 className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">
                  EDENTRACK
                </h1>
                <p className="text-[8px] sm:text-[9px] text-gray-600 leading-tight truncate max-w-[90px] sm:max-w-[120px] md:max-w-[150px]">
                  {currentFarm?.name || 'My Farm'}
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-white rounded-full p-2 shadow-soft flex-1 justify-center max-w-4xl mx-auto">
              {[
                navItems.find(item => item.id === 'dashboard'),
                navItems.find(item => item.id === 'flocks'),
                navItems.find(item => item.id === 'insights'),
                navItems.find(item => item.id === 'vaccinations'),
                navItems.find(item => item.id === 'inventory'),
                navItems.find(item => item.id === 'expenses'),
              ].filter((item): item is { id: ModuleName; label: string; icon: any } => item !== undefined).map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                
                // Show Flocks as plain text but still clickable
                if (item.id === 'flocks') {
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.id)}
                      className="flex items-center gap-1.5 flex-shrink-0 px-4 py-2 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <span className="font-medium text-gray-900 whitespace-nowrap">{item.label}</span>
                    </button>
                  );
                }
                
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`nav-pill flex items-center gap-1.5 flex-shrink-0 ${
                      isActive ? 'nav-pill-active' : 'nav-pill-inactive'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
              {navItems.length > 6 && (
                <div className="relative" ref={desktopMoreMenuRef}>
                  <button
                    onClick={() => setDesktopMoreMenuOpen(!desktopMoreMenuOpen)}
                    className="nav-pill nav-pill-inactive flex items-center gap-1"
                  >
                    {t('nav.more')}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {desktopMoreMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 z-50 max-h-[80vh] overflow-y-auto">
                      {/* Collapse All button */}
                      <button
                        onClick={expandedGroups.size === 0 ? expandAll : collapseAll}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                      >
                        {expandedGroups.size === 0 ? (
                          <>
                            <ChevronRight className="w-3 h-3" />
                            {t('nav.expand_all')}
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            {t('nav.collapse_all')}
                          </>
                        )}
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      
                      {/* Navigation Groups */}
                      {navGroups.map((group) => {
                        const isExpanded = expandedGroups.has(group.id);
                        const hasItems = group.items.length > 0;
                        
                        if (!hasItems) return null;

                        return (
                          <div key={group.id}>
                            <button
                              onClick={() => toggleGroup(group.id)}
                              className="w-full px-4 py-2.5 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-between transition-colors uppercase tracking-wide"
                            >
                              <span>{group.label}</span>
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-gray-400" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="pl-4">
                                {group.items.map((item) => {
                                  const Icon = item.icon;
                                  const isActive = currentView === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => {
                                        handleNavigate(item.id);
                                        setDesktopMoreMenuOpen(false);
                                      }}
                                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                                        isActive
                                          ? 'text-gray-900 bg-neon-500/10 font-medium'
                                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                      }`}
                                    >
                                      <Icon className="w-4 h-4 flex-shrink-0" />
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
              <NotificationCenter />

              <div className="relative" ref={accountMenuRef}>
                <button
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className="flex items-center gap-2 p-1.5 hover:bg-white/60 rounded-full transition-colors"
                >
                  <div className="w-9 h-9 bg-gradient-to-br from-neon-400 to-neon-500 rounded-full flex items-center justify-center shadow-md">
                    <User className="w-5 h-5 text-gray-900" />
                  </div>
                </button>

                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-medium py-2 z-50 animate-scale-in">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      {currentRole && (
                        <span className="inline-block mt-2 badge-yellow capitalize">
                          {currentRole}
                        </span>
                      )}
                    </div>
                    {profile?.is_super_admin && (
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          window.location.hash = '#/super-admin';
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-purple-600 hover:bg-purple-50 flex items-center gap-3 transition-colors font-medium"
                      >
                        <Shield className="w-4 h-4" />
                        Super Admin
                      </button>
                    )}
                    {canViewModule(currentRole, 'settings', farmPermissions).visible && (
                      <button
                        onClick={() => {
                          setAccountMenuOpen(false);
                          handleNavigate('settings');
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        {t('nav.settings') || 'Settings'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setHelpModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
                    >
                      <HelpCircle className="w-4 h-4" />
                      Help & Support
                    </button>
                    <button
                      onClick={() => {
                        setAccountMenuOpen(false);
                        signOut();
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {t('nav.sign_out') || 'Sign Out'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="lg:hidden glass-light border-b border-white/20 sticky top-14 sm:top-16 z-30">
        <div className="flex items-center py-2 px-2 sm:px-3 gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {mobileMainTabs.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              
              // Handle Flocks as plain text on mobile too
              if (item.id === 'flocks') {
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    className={`flex-shrink-0 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 rounded-full ${
                      isActive 
                        ? 'bg-neon-500 text-gray-900 shadow-sm' 
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              }
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  className={`flex-shrink-0 nav-pill ${
                    isActive ? 'nav-pill-active' : 'nav-pill-inactive'
                  } flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>

          {mobileOtherItems.length > 0 && (
            <div className="relative flex-shrink-0" ref={mobileMoreMenuRef}>
              <button
                onClick={() => setMobileMoreMenuOpen(!mobileMoreMenuOpen)}
                className={`nav-pill ${
                  mobileMoreMenuOpen ? 'nav-pill-active' : 'nav-pill-inactive'
                } flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200`}
              >
                <Menu className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="whitespace-nowrap hidden sm:inline">{t('nav.more')}</span>
              </button>

              {mobileMoreMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 bg-black/20 z-40"
                    onClick={() => setMobileMoreMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 sm:w-64 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 z-50 animate-scale-in max-h-[70vh] overflow-y-auto">
                    {mobileOtherItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentView === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            handleNavigate(item.id);
                            setMobileMoreMenuOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
                            isActive
                              ? 'text-gray-900 bg-neon-500/10 font-medium'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-20 sm:pb-24">
        <div className="animate-fade-in">
          {children}
        </div>
      </main>

      {helpModalOpen && (
        <HelpModal
          isOpen={helpModalOpen}
          onClose={() => setHelpModalOpen(false)}
          currentPage={`/${currentView}`}
        />
      )}

      <OfflineIndicator />
      <NotificationPermissionPrompt />
    </div>
  );
}
