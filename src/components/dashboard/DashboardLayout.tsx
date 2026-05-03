import { ReactNode, useState, useRef, useEffect } from 'react';
import { LayoutDashboard, TrendingUp, Syringe, DollarSign, Settings, LogOut, Package, Briefcase, ShoppingCart, Users, Calendar, User, ChevronDown, Menu, Shield, Scale, ChevronRight, HelpCircle, ListChecks, Crown, Zap, Sprout, Egg, HeartOff, Fish, Waves } from 'lucide-react';
import { FarmSwitcherDropdown } from '../farms/FarmSwitcherDropdown';
import { CreateFarmModal } from '../farms/CreateFarmModal';
import { FarmHealthRing } from './FarmHealthRing';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSimpleMode } from '../../contexts/SimpleModeContext';
import { useFarmType } from '../../hooks/useFarmType';
import { ChickenIcon } from '../icons/ChickenIcon';
import { NotificationCenter } from '../notifications/NotificationCenter';
import { canViewModule, ModuleName } from '../../utils/navigationPermissions';
import HelpModal from '../help/HelpModal';
import { LogoIcon } from '../common/Logo';
import { getNavigationGroups, getExpandedGroups, saveExpandedGroups, NavigationGroupId } from '../../utils/navigationGroups';
import { OfflineIndicator } from '../common/OfflineIndicator';
import { initOfflineSync } from '../../lib/offlineSync';
import { offlineDB } from '../../lib/offlineDB';
import { NotificationPermissionPrompt } from '../common/NotificationPermissionPrompt';
import { initPushNotifications } from '../../lib/pushNotifications';

interface DashboardLayoutProps {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: string) => void;
}

type TierStyle = { label: string; bg: string; text: string; border: string; Icon: React.ElementType };

function getTierStyle(tier: string | undefined | null): TierStyle {
  switch (tier) {
    case 'pro':
      return { label: 'Grower', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', Icon: Sprout };
    case 'enterprise':
      return { label: 'Farm Boss', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', Icon: Crown };
    default:
      return { label: 'Starter', bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-200', Icon: Zap };
  }
}

export function DashboardLayout({ children, currentView, onNavigate }: DashboardLayoutProps) {
  const { t } = useTranslation();
  const { profile, signOut, user, currentRole, currentFarm, switchFarm } = useAuth();
  const { farmPermissions } = usePermissions();
  const { simpleMode } = useSimpleMode();
  const { showEggs, showFCR, showHarvest, isAquaculture, loading: farmTypeLoading } = useFarmType();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [desktopMoreMenuOpen, setDesktopMoreMenuOpen] = useState(false);
  const [mobileMoreMenuOpen, setMobileMoreMenuOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [createFarmOpen, setCreateFarmOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<NavigationGroupId>>(() => getExpandedGroups());
  const [isOffline, setIsOffline] = useState(false);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const desktopMoreMenuRef = useRef<HTMLDivElement>(null);
  const mobileMoreMenuRef = useRef<HTMLDivElement>(null);

  const handleNavigate = (view: string) => {
    if (currentView === view) return;
    onNavigate(view);
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
    const flocksLabel = isAquaculture ? 'Ponds' : (t('nav.flocks') || 'Flocks');
    const flocksIcon = isAquaculture ? Fish : ChickenIcon;

    const allItems: Array<{ id: ModuleName; label: string; icon: any; badge?: number }> = [
      { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      { id: 'flocks', label: flocksLabel, icon: flocksIcon },
      { id: 'insights', label: t('nav.insights'), icon: TrendingUp },
      { id: 'tasks', label: t('nav.tasks') || 'Tasks', icon: ListChecks },
      { id: 'egg-records', label: 'Egg Records', icon: Egg },
      { id: 'mortality', label: isAquaculture ? 'Fish Losses' : 'Mortality', icon: HeartOff },
      { id: 'harvest', label: 'Harvest', icon: Waves },
      { id: 'inventory', label: t('nav.inventory'), icon: Package },
      { id: 'vaccinations', label: t('nav.vaccinations'), icon: Syringe },
      { id: 'expenses', label: t('nav.expenses'), icon: DollarSign },
      { id: 'sales', label: t('nav.sales'), icon: ShoppingCart },
      { id: 'weight', label: isAquaculture ? 'Weight & FCR' : t('nav.weight'), icon: Scale },
      { id: 'shifts', label: t('nav.shifts'), icon: Calendar },
      { id: 'team', label: t('nav.team'), icon: Users },
      { id: 'ai-assistant', label: t('nav.ai_assistant') || 'Eden AI', icon: Zap },
      { id: 'settings', label: t('nav.settings') || 'Settings', icon: Settings, badge: deadLetterCount > 0 ? deadLetterCount : undefined },
    ];

    // Items hidden in Simple Mode (advanced features)
    const simpleModeHidden = new Set(['vet-log', 'shifts']);
    // Items only relevant when eggs are tracked (layer/mixed farms)
    const eggOnlyItems = new Set(['sales', 'egg-records']);
    // Items only for aquaculture farms
    const aquacultureOnlyItems = new Set(['harvest']);
    // Items hidden for aquaculture farms
    const poultryOnlyItems = new Set(['vaccinations']);

    const filteredItems = allItems.filter(item => {
      const visibility = canViewModule(currentRole, item.id, farmPermissions);
      if (!visibility.visible) return false;
      if (simpleMode && simpleModeHidden.has(item.id)) return false;
      if (!farmTypeLoading) {
        if (!showEggs && eggOnlyItems.has(item.id)) return false;
        if (!isAquaculture && aquacultureOnlyItems.has(item.id)) return false;
        if (isAquaculture && poultryOnlyItems.has(item.id)) return false;
      }
      return true;
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
    const all = new Set<NavigationGroupId>(['analytics', 'health', 'money', 'team', 'other']);
    setExpandedGroups(all);
    saveExpandedGroups(all);
  };

  // Primary tabs on mobile: Dashboard, Flocks, Tasks, Eden AI
  const mainTabIds = ['dashboard', 'flocks', 'tasks', 'ai-assistant'];

  const getMobileMainTabs = () => {
    return [
      navItems.find(item => item.id === 'dashboard'),
      navItems.find(item => item.id === 'flocks'),
      navItems.find(item => item.id === 'tasks'),
      navItems.find(item => item.id === 'ai-assistant'),
    ].filter((item): item is { id: ModuleName; label: string; icon: any } => item !== undefined);
  };

  const getMobileOtherItems = () => {
    return navItems.filter(item => !mainTabIds.includes(item.id));
  };

  const mobileMainTabs = getMobileMainTabs();
  const mobileOtherItems = getMobileOtherItems();

  useEffect(() => {
    const updateOfflineStatus = () => setIsOffline(!navigator.onLine);
    updateOfflineStatus();
    window.addEventListener('online', updateOfflineStatus);
    window.addEventListener('offline', updateOfflineStatus);
    return () => {
      window.removeEventListener('online', updateOfflineStatus);
      window.removeEventListener('offline', updateOfflineStatus);
    };
  }, []);

  useEffect(() => {
    const checkDeadLetter = async () => {
      try {
        const count = await offlineDB.deadLetter.count();
        setDeadLetterCount(count);
      } catch {}
    };
    checkDeadLetter();
    // Re-check whenever user comes back online
    window.addEventListener('online', checkDeadLetter);
    return () => window.removeEventListener('online', checkDeadLetter);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F0E8]" style={{ background: 'linear-gradient(135deg, #f5f0e8 0%, #ebe4d8 50%, #f0e9dd 100%)' }}>
      <OfflineIndicator />
      <nav className="sticky top-0 z-40 glass-light border-b border-white/20" style={isOffline ? { marginTop: '40px' } : undefined}>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="flex items-center h-14 sm:h-16 gap-3 sm:gap-4 lg:gap-8">
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <LogoIcon size="sm" blend />
              <div className="block">
                <h1 className="text-xs sm:text-sm font-bold text-gray-900 leading-tight">
                  EDENTRACK
                </h1>
                <FarmSwitcherDropdown onAddFarm={() => setCreateFarmOpen(true)} />
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-white rounded-full p-2 shadow-soft flex-1 justify-center max-w-4xl mx-auto">
              {[
                navItems.find(item => item.id === 'dashboard'),
                navItems.find(item => item.id === 'flocks'),
                navItems.find(item => item.id === 'tasks'),
                navItems.find(item => item.id === 'ai-assistant'),
              ].filter((item): item is { id: ModuleName; label: string; icon: any } => item !== undefined).map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                
                // Tour data attributes for key nav items
                const tourAttr: Record<string, string> = {
                  flocks: 'nav-flocks',
                  expenses: 'nav-expenses',
                  tasks: 'nav-tasks',
                  'ai-assistant': 'nav-ai',
                };

                // Show Flocks as plain text but still clickable
                if (item.id === 'flocks') {
                  return (
                    <button
                      key={item.id}
                      data-tour={tourAttr[item.id]}
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
                    data-tour={tourAttr[item.id]}
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
              {navItems.length > 4 && (
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
                                      data-tour={item.id === 'tasks' ? 'nav-tasks' : item.id === 'ai-assistant' ? 'nav-ai' : undefined}
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
                                      <span className="flex-1">{item.label}</span>
                                      {item.badge ? (
                                        <span className="ml-auto w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">!</span>
                                      ) : null}
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
                  className="flex items-center gap-2 p-1.5 hover:bg-white/60 rounded-2xl transition-colors"
                >
                  {/* Health ring + tier badge around avatar */}
                  {(() => {
                    const tier = getTierStyle(profile?.subscription_tier);
                    return (
                      <FarmHealthRing size={42} showLabel>
                        <div className="relative w-8 h-8">
                          <div className="w-8 h-8 bg-gradient-to-br from-neon-400 to-neon-500 rounded-full flex items-center justify-center shadow-md">
                            <User className="w-4 h-4 text-gray-900" />
                          </div>
                          {/* Tier icon badge */}
                          <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ${tier.bg} border ${tier.border} flex items-center justify-center`}>
                            <tier.Icon className={`w-2.5 h-2.5 ${tier.text}`} />
                          </div>
                        </div>
                      </FarmHealthRing>
                    );
                  })()}
                </button>

                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-medium py-2 z-50 animate-scale-in">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-900">{profile?.full_name || 'User'}</p>
                      <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {currentRole && (
                          <span className="badge-yellow capitalize">{currentRole}</span>
                        )}
                        {(() => {
                          const tier = getTierStyle(profile?.subscription_tier);
                          return (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${tier.bg} ${tier.text} ${tier.border}`}>
                              <tier.Icon className="w-3 h-3" />
                              {tier.label}
                            </span>
                          );
                        })()}
                      </div>
                      {/* Upgrade nudge for non-enterprise users */}
                      {profile?.subscription_tier !== 'enterprise' && (
                        <button
                          onClick={() => { setAccountMenuOpen(false); window.location.hash = '#/subscribe'; }}
                          className="mt-2 w-full text-xs text-center py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium hover:from-emerald-600 hover:to-emerald-700 transition-all"
                        >
                          {profile?.subscription_tier === 'pro' ? '⚡ Upgrade to Farm Boss' : '🌱 Upgrade your plan'}
                        </button>
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
              
              // Tour data attributes for mobile nav
              const mobileTourAttr: Record<string, string> = {
                flocks: 'nav-flocks',
                expenses: 'nav-expenses',
              };

              // Handle Flocks as plain text on mobile too
              if (item.id === 'flocks') {
                return (
                  <button
                    key={item.id}
                    data-tour={mobileTourAttr[item.id]}
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
                  data-tour={mobileTourAttr[item.id]}
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
                          <span className="flex-1">{item.label}</span>
                          {item.badge ? (
                            <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">!</span>
                          ) : null}
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

      {createFarmOpen && (
        <CreateFarmModal
          onClose={() => setCreateFarmOpen(false)}
          onCreated={async (farmId) => {
            setCreateFarmOpen(false);
            await switchFarm(farmId);
          }}
        />
      )}

      <OfflineIndicator />
      <NotificationPermissionPrompt />
    </div>
  );
}
