import { useEffect, useMemo, useState } from 'react';
import { Shield, Save, Users, HardHat, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { FarmPermissions } from '../../types/database';

type RoleTab = 'manager' | 'worker' | 'viewer';

const DEFAULTS: Partial<FarmPermissions> = {
  // Manager
  managers_can_view_financials: true,
  managers_can_create_expenses: true,
  managers_can_create_sales: true,
  managers_can_manage_inventory: true,
  managers_can_manage_payroll: false,
  managers_can_manage_team: false,
  managers_can_edit_flock_costs: false,
  managers_can_delete_records: false,
  managers_can_edit_shift_templates: true,
  managers_can_mark_vaccinations: true,
  managers_can_edit_feed_water: true,
  managers_can_edit_eggs: false,
  managers_can_use_smart_import: true,
  managers_can_view_analytics: true,
  managers_can_use_eden_ai: true,
  // Worker
  workers_can_log_mortality: true,
  workers_can_log_eggs: true,
  workers_can_log_weight: false,
  workers_can_use_eden_ai: true,
  workers_can_view_financials: false,
};

interface PermissionGroup {
  title: string;
  description: string;
  permissions: {
    key: keyof FarmPermissions;
    label: string;
    description: string;
    warning?: string;
  }[];
}

interface PermissionVocab {
  groupTerm: string;            // "Flock", "Pond", "Rabbitry"
  groupTermPlural: string;      // "Flocks", "Ponds", "Rabbitries"
  groupTermLower: string;       // "flock", "pond", "rabbitry"
  groupTermPluralLower: string; // "flocks", "ponds", "rabbitries"
  animalTerm: string;           // "Bird", "Fish", "Rabbit"
  animalTermLower: string;      // "bird", "fish", "rabbit"
  animalTermPluralLower: string;
  lossNoun: string;             // "Mortality", "Loss", "Death"
  lossNounPlural: string;       // "Mortalities", "Losses", "Deaths"
  isPoultry: boolean;
}

function buildManagerGroups(v: PermissionVocab, isFr: boolean): PermissionGroup[] {
  // Egg-related permissions only show on poultry — for rabbits/aqua we
  // collapse the bird/egg salescript to a single species-aware sentence.
  const salesDescription = v.isPoultry
    ? (isFr ? 'Créer des ventes de volailles, des ventes d\'œufs et imprimer les reçus' : 'Create bird sales, egg sales and print receipts')
    : (isFr ? `Créer des ventes de ${v.animalTermLower}s et imprimer les reçus` : `Create ${v.animalTermLower} sales and print receipts`);
  return [
    {
      title: isFr ? 'Accès financier' : 'Financial Access',
      description: isFr ? 'Données financières et opérations que les gestionnaires peuvent voir et effectuer' : 'What financial data and operations managers can see and perform',
      permissions: [
        { key: 'managers_can_view_financials', label: isFr ? 'Voir les dépenses & ventes' : 'View Expenses & Sales', description: isFr ? 'Consulter les dépenses, ventes, revenus et P&L' : 'See expense records, sales, revenue and P&L data' },
        { key: 'managers_can_view_analytics', label: isFr ? 'Voir les analyses & insights' : 'View Analytics & Insights', description: isFr ? 'Accès au tableau de bord Analytics, KPI, et page Insights' : 'Access the Analytics dashboard, KPIs, and Insights page' },
        { key: 'managers_can_create_expenses', label: isFr ? 'Ajouter & modifier les dépenses' : 'Add & Edit Expenses', description: isFr ? 'Créer et modifier les dépenses au nom de la ferme' : 'Create and modify expense records on behalf of the farm' },
        { key: 'managers_can_create_sales', label: isFr ? 'Enregistrer ventes & reçus' : 'Record Sales & Receipts', description: salesDescription },
        { key: 'managers_can_edit_flock_costs', label: isFr ? `Modifier les coûts d'achat de ${v.groupTerm}` : `Edit ${v.groupTerm} Purchase Costs`, description: isFr ? `Modifier le coût initial et le coût de transport d'un ${v.groupTermLower}` : `Modify the initial cost and transport cost of a ${v.groupTermLower}` },
      ],
    },
    {
      title: isFr ? 'Opérations' : 'Operations',
      description: isFr ? 'Opérations quotidiennes de la ferme que le gestionnaire peut contrôler' : 'Day-to-day farm operations the manager can control',
      permissions: [
        { key: 'managers_can_manage_inventory', label: isFr ? 'Gérer l\'inventaire' : 'Manage Inventory', description: isFr ? 'Ajouter des aliments, ajuster les stocks et consigner l\'usage' : 'Add feed types, adjust stock levels, and log usage' },
        { key: 'managers_can_edit_shift_templates', label: isFr ? 'Modifier les modèles de quarts' : 'Edit Shift Templates', description: isFr ? 'Créer et modifier les plannings récurrents' : 'Create and modify recurring shift schedules' },
        { key: 'managers_can_mark_vaccinations', label: isFr ? 'Enregistrer les vaccinations' : 'Record Vaccinations', description: isFr ? 'Marquer les vaccinations administrées et ajouter des entrées au journal vétérinaire' : 'Mark vaccinations as administered and add vet log entries' },
        { key: 'managers_can_edit_feed_water', label: isFr ? 'Modifier alimentation & eau' : 'Edit Feed & Water Records', description: isFr ? 'Ajuster les relevés hebdomadaires de consommation d\'aliments et d\'eau' : 'Adjust weekly feed and water consumption logs' },
        // Egg edit toggle still exists in DB but only meaningful on poultry farms.
        ...(v.isPoultry
          ? ([{ key: 'managers_can_edit_eggs' as const, label: isFr ? 'Modifier les enregistrements d\'œufs' : 'Edit Egg Records', description: isFr ? 'Corriger les collectes et ventes d\'œufs' : 'Correct egg collection and egg sale records' }])
          : []),
        { key: 'managers_can_use_smart_import', label: isFr ? 'Utiliser Smart Import' : 'Use Smart Import', description: isFr ? 'Téléverser des reçus et documents pour importer automatiquement' : 'Upload receipts and documents to auto-import records' },
        { key: 'managers_can_use_eden_ai', label: isFr ? 'Utiliser Eden AI' : 'Use Eden AI', description: isFr ? 'Discuter avec Eden pour des conseils de santé, diagnostics et saisie rapide' : 'Chat with Eden for health advice, diagnostics, and quick logging' },
      ],
    },
    {
      title: isFr ? 'Équipe & paie' : 'Team & Payroll',
      description: isFr ? 'Permissions sensibles de gestion du personnel' : 'Sensitive people-management permissions',
      permissions: [
        { key: 'managers_can_manage_team', label: isFr ? 'Gérer les membres de l\'équipe' : 'Manage Team Members', description: isFr ? 'Inviter des ouvriers, changer les rôles, désactiver des membres' : 'Invite workers, change roles, deactivate members' },
        { key: 'managers_can_manage_payroll', label: isFr ? 'Gérer la paie' : 'Process Payroll', description: isFr ? 'Exécuter la paie, ajuster les salaires et enregistrer les paiements' : 'Run payroll, adjust salaries, and record payments' },
      ],
    },
    {
      title: isFr ? 'Zone dangereuse — données' : 'Data Danger Zone',
      description: isFr ? 'Opérations irréversibles — accordez avec précaution' : 'Irreversible operations — grant with care',
      permissions: [
        {
          key: 'managers_can_delete_records',
          label: isFr ? 'Supprimer des enregistrements' : 'Delete Records',
          description: isFr ? `Supprimer définitivement les dépenses, ventes, ${v.groupTermPluralLower} et autres enregistrements` : `Permanently delete expenses, sales, ${v.groupTermPluralLower}, and other records`,
          warning: isFr ? 'Les suppressions sont irréversibles' : 'Deletions cannot be undone',
        },
      ],
    },
  ];
}

function buildWorkerGroups(v: PermissionVocab, isFr: boolean): PermissionGroup[] {
  return [
    {
      title: isFr ? 'Saisie des données' : 'Data Logging',
      description: isFr ? 'Ce que les ouvriers peuvent enregistrer directement depuis leur téléphone' : 'What workers can record directly from their phone',
      permissions: [
        { key: 'workers_can_log_mortality', label: isFr ? `Enregistrer ${v.lossNounPlural.toLowerCase()}` : `Log ${v.lossNounPlural}`, description: isFr ? `Les ouvriers peuvent signaler les ${v.animalTermPluralLower} morts et entrer la cause` : `Workers can report dead ${v.animalTermPluralLower} and enter cause of death` },
        // Egg-collection logging only on poultry.
        ...(v.isPoultry
          ? ([{ key: 'workers_can_log_eggs' as const, label: isFr ? 'Enregistrer les collectes d\'œufs' : 'Log Egg Collections', description: isFr ? 'Les ouvriers peuvent enregistrer les comptages quotidiens d\'œufs par taille et dommage' : 'Workers can record daily egg counts by size and damage' }])
          : []),
        { key: 'workers_can_log_weight', label: isFr ? `Enregistrer poids des ${v.animalTermLower}s` : `Log ${v.animalTerm} Weights`, description: isFr ? `Les ouvriers peuvent enregistrer des échantillons de poids pour ${v.isPoultry ? 'le suivi du FCR' : 'le suivi de croissance'}` : `Workers can record weight samples for ${v.isPoultry ? 'FCR tracking' : 'growth tracking'}` },
      ],
    },
    {
      title: isFr ? 'Outils & visibilité' : 'Tools & Visibility',
      description: isFr ? 'Fonctionnalités et données accessibles aux ouvriers' : 'Features and data workers can access',
      permissions: [
        { key: 'workers_can_use_eden_ai', label: isFr ? 'Utiliser Eden AI' : 'Use Eden AI', description: isFr ? 'Les ouvriers peuvent discuter avec Eden pour des conseils de santé et la saisie rapide' : 'Workers can chat with Eden for health advice and quick logging' },
        { key: 'workers_can_view_financials', label: isFr ? 'Voir les données financières' : 'View Financial Data', description: isFr ? 'Les ouvriers peuvent voir les dépenses, ventes et bénéfices' : 'Workers can see expenses, sales, and profit figures' },
      ],
    },
  ];
}

// Viewer role is always read-only everywhere — no toggles needed, just show a summary
function buildViewerInfo(v: PermissionVocab, isFr: boolean): { label: string; access: string }[] {
  const RO = isFr ? 'Lecture seule' : 'Read only';
  const FA = isFr ? 'Accès complet' : 'Full access';
  const NA = isFr ? 'Aucun accès' : 'No access';
  return [
    { label: isFr ? `Tableau de bord & ${v.groupTermPlural}` : `Dashboard & ${v.groupTermPlural}`, access: RO },
    { label: isFr ? 'Tâches & quarts' : 'Tasks & Shifts', access: RO },
    { label: isFr ? 'Dépenses & ventes' : 'Expenses & Sales', access: RO },
    { label: isFr ? 'Inventaire & alimentation' : 'Inventory & Feed', access: RO },
    { label: isFr ? `${v.lossNounPlural} & poids` : `${v.lossNounPlural} & Weight`, access: RO },
    { label: isFr ? 'Vaccinations & journal vétérinaire' : 'Vaccinations & Vet Log', access: RO },
    { label: isFr ? 'Analyses & insights' : 'Analytics & Insights', access: RO },
    { label: 'Eden AI', access: FA },
    { label: isFr ? 'Équipe & paie' : 'Team & Payroll', access: NA },
    { label: isFr ? 'Paramètres & facturation' : 'Settings & Billing', access: NA },
    { label: 'Smart Import', access: NA },
  ];
}

export function FarmPermissionsSettings() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions, refreshPermissions } = usePermissions();
  const farmSpecies = useFarmSpecies();
  const permVocab: PermissionVocab = useMemo(() => ({
    groupTerm: farmSpecies.groupTerm,
    groupTermPlural: farmSpecies.groupTermPlural,
    groupTermLower: farmSpecies.groupTerm.toLowerCase(),
    groupTermPluralLower: farmSpecies.groupTermPlural.toLowerCase(),
    animalTerm: farmSpecies.animalTerm,
    animalTermLower: farmSpecies.animalTerm.toLowerCase(),
    animalTermPluralLower: farmSpecies.animalTermPlural.toLowerCase(),
    lossNoun: farmSpecies.lossNoun,
    lossNounPlural: farmSpecies.lossNounPlural,
    isPoultry: farmSpecies.id === 'poultry',
  }), [farmSpecies.id]);
  const managerGroups = useMemo(() => buildManagerGroups(permVocab, isFr), [permVocab, isFr]);
  const workerGroups = useMemo(() => buildWorkerGroups(permVocab, isFr), [permVocab, isFr]);
  const viewerInfo = useMemo(() => buildViewerInfo(permVocab, isFr), [permVocab, isFr]);
  const [local, setLocal] = useState<Partial<FarmPermissions>>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<RoleTab>('manager');

  useEffect(() => {
    if (farmPermissions) {
      setLocal(farmPermissions);
      setLoading(false);
    } else if (currentFarm?.id) {
      setLocal(DEFAULTS);
      setLoading(false);
    }
  }, [farmPermissions, currentFarm?.id]);

  const toggle = (key: keyof FarmPermissions) => {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const applyManagerPreset = (preset: 'full' | 'operations' | 'finance') => {
    const base = {
      managers_can_view_financials: false,
      managers_can_create_expenses: false,
      managers_can_create_sales: false,
      managers_can_manage_inventory: false,
      managers_can_manage_payroll: false,
      managers_can_manage_team: false,
      managers_can_edit_flock_costs: false,
      managers_can_delete_records: false,
      managers_can_edit_shift_templates: false,
      managers_can_mark_vaccinations: false,
      managers_can_edit_feed_water: false,
      managers_can_edit_eggs: false,
      managers_can_use_smart_import: false,
      managers_can_view_analytics: false,
      managers_can_use_eden_ai: false,
    };
    if (preset === 'full') {
      setLocal(prev => ({ ...prev, ...base,
        managers_can_view_financials: true, managers_can_create_expenses: true, managers_can_create_sales: true,
        managers_can_manage_inventory: true, managers_can_manage_payroll: true, managers_can_manage_team: true,
        managers_can_edit_flock_costs: true, managers_can_delete_records: false,
        managers_can_edit_shift_templates: true, managers_can_mark_vaccinations: true,
        managers_can_edit_feed_water: true, managers_can_edit_eggs: true,
        managers_can_use_smart_import: true, managers_can_view_analytics: true, managers_can_use_eden_ai: true,
      }));
    } else if (preset === 'operations') {
      setLocal(prev => ({ ...prev, ...base,
        managers_can_manage_inventory: true, managers_can_edit_shift_templates: true,
        managers_can_mark_vaccinations: true, managers_can_edit_feed_water: true,
        managers_can_edit_eggs: true, managers_can_use_smart_import: true,
        managers_can_view_analytics: true, managers_can_use_eden_ai: true,
      }));
    } else if (preset === 'finance') {
      setLocal(prev => ({ ...prev, ...base,
        managers_can_view_financials: true, managers_can_create_expenses: true,
        managers_can_create_sales: true, managers_can_view_analytics: true,
        managers_can_use_eden_ai: true,
      }));
    }
  };

  const applyWorkerPreset = (preset: 'basic' | 'full') => {
    // workers_can_log_eggs only matters on poultry; toggle stays false on
    // rabbits/aqua so the underlying column reflects what's actually
    // grantable in the UI.
    const allowEggs = permVocab.isPoultry;
    if (preset === 'basic') {
      setLocal(prev => ({ ...prev,
        workers_can_log_mortality: true, workers_can_log_eggs: allowEggs,
        workers_can_log_weight: false, workers_can_use_eden_ai: false, workers_can_view_financials: false,
      }));
    } else {
      setLocal(prev => ({ ...prev,
        workers_can_log_mortality: true, workers_can_log_eggs: allowEggs,
        workers_can_log_weight: true, workers_can_use_eden_ai: true, workers_can_view_financials: false,
      }));
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;
    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.from('farm_permissions').upsert({
        farm_id: currentFarm.id,
        ...local,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await refreshPermissions();
      setMessage(t('settings.permissions_saved') || 'Permissions saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage(t('settings.permissions_save_failed') || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (currentRole !== 'owner') return null;
  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="text-center py-8 text-gray-500">{t('settings.loading_permissions') || 'Loading permissions...'}</div>
      </div>
    );
  }

  const TABS: { id: RoleTab; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'manager', label: isFr ? 'Gestionnaire' : 'Manager', icon: <Users className="w-4 h-4" />, color: 'blue' },
    { id: 'worker',  label: isFr ? 'Ouvrier' : 'Worker',  icon: <HardHat className="w-4 h-4" />, color: 'amber' },
    { id: 'viewer',  label: isFr ? 'Lecteur' : 'Viewer',  icon: <Eye className="w-4 h-4" />,    color: 'gray' },
  ];

  const activeGroups = activeTab === 'manager' ? managerGroups : activeTab === 'worker' ? workerGroups : [];

  return (
    <div className="bg-white rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-amber-100 rounded-xl">
          <Shield className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{isFr ? 'Permissions des rôles' : 'Role Permissions'}</h3>
          <p className="text-sm text-gray-500">{isFr ? 'Contrôlez ce que chaque rôle peut voir et faire sur votre ferme' : 'Control what each role can see and do on your farm'}</p>
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Role description banner */}
      {activeTab === 'manager' && (
        <>
          <div className="mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-800">
            <strong>{isFr ? 'Gestionnaire' : 'Manager'}</strong> — {isFr ? "chef d'équipe de confiance. Choisissez un préréglage ou configurez individuellement ci-dessous." : 'trusted team lead. Pick a preset or configure individually below.'}
          </div>
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{isFr ? 'Préréglages rapides' : 'Quick presets'}</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => applyManagerPreset('full')}
                className="px-3 py-2 rounded-xl border-2 border-blue-200 bg-blue-50 text-blue-800 text-xs font-semibold hover:bg-blue-100 transition-colors text-left">
                <div className="font-bold">{isFr ? 'Gestionnaire complet' : 'Full Manager'}</div>
                <div className="text-blue-500 font-normal mt-0.5">{isFr ? 'Tout sauf supprimer' : 'Everything except delete'}</div>
              </button>
              <button onClick={() => applyManagerPreset('operations')}
                className="px-3 py-2 rounded-xl border-2 border-green-200 bg-green-50 text-green-800 text-xs font-semibold hover:bg-green-100 transition-colors text-left">
                <div className="font-bold">{isFr ? 'Opérations' : 'Operations'}</div>
                <div className="text-green-600 font-normal mt-0.5">{isFr ? 'Travail à la ferme, sans finances' : 'Farm work, no financials'}</div>
              </button>
              <button onClick={() => applyManagerPreset('finance')}
                className="px-3 py-2 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors text-left">
                <div className="font-bold">{isFr ? 'Finance' : 'Finance'}</div>
                <div className="text-amber-600 font-normal mt-0.5">{isFr ? 'Ventes & dépenses uniquement' : 'Sales & expenses only'}</div>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">{isFr ? "L'application d'un préréglage remplit tous les commutateurs ci-dessous — vous pouvez ajuster individuellement après." : 'Applying a preset fills in all toggles below — you can still adjust individually after.'}</p>
          </div>
        </>
      )}
      {activeTab === 'worker' && (
        <>
          <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-100 text-sm text-amber-800">
            <strong>{isFr ? 'Ouvrier' : 'Worker'}</strong> — {isFr ? 'personnel de terrain. Ne peut pas toucher aux finances ou paramètres sauf si activé ci-dessous.' : "hands-on farm staff. Can't touch financials or settings unless enabled below."}
          </div>
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{isFr ? 'Préréglages rapides' : 'Quick presets'}</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => applyWorkerPreset('basic')}
                className="px-3 py-2 rounded-xl border-2 border-gray-200 bg-gray-50 text-gray-800 text-xs font-semibold hover:bg-gray-100 transition-colors text-left">
                <div className="font-bold">{isFr ? 'Basique' : 'Basic'}</div>
                <div className="text-gray-500 font-normal mt-0.5">
                  {permVocab.isPoultry
                    ? (isFr ? 'Œufs & mortalité uniquement' : 'Eggs & mortality only')
                    : (isFr ? `${permVocab.lossNounPlural.toLowerCase()} uniquement` : `${permVocab.lossNounPlural} only`)}
                </div>
              </button>
              <button onClick={() => applyWorkerPreset('full')}
                className="px-3 py-2 rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors text-left">
                <div className="font-bold">{isFr ? 'Ouvrier complet' : 'Full Worker'}</div>
                <div className="text-amber-600 font-normal mt-0.5">
                  {permVocab.isPoultry
                    ? (isFr ? 'Œufs, mortalité, poids & Eden AI' : 'Eggs, mortality, weight & Eden AI')
                    : (isFr ? `${permVocab.lossNounPlural.toLowerCase()}, poids & Eden AI` : `${permVocab.lossNounPlural}, weight & Eden AI`)}
                </div>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">{isFr ? "L'application d'un préréglage remplit les commutateurs ci-dessous — ajustez individuellement après si nécessaire." : 'Applying a preset fills in toggles below — adjust individually after if needed.'}</p>
          </div>
        </>
      )}
      {activeTab === 'viewer' && (
        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700">
          <strong>{isFr ? 'Lecteur' : 'Viewer'}</strong> — {isFr ? "accès en lecture seule à la plupart des données. Utile pour investisseurs, conseillers ou auditeurs externes. Ne peut rien créer, modifier ou supprimer. Aucune configuration nécessaire." : 'read-only access to most data. Useful for investors, advisors, or external auditors. Cannot create, edit, or delete anything. No configuration needed.'}
        </div>
      )}

      {/* Save feedback */}
      {message && (
        <div className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium ${
          message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* Viewer — static summary */}
      {activeTab === 'viewer' && (
        <div className="space-y-2">
          {viewerInfo.map(item => (
            <div key={item.label} className="flex items-center justify-between py-3 px-4 border border-gray-100 rounded-xl">
              <span className="text-sm font-medium text-gray-800">{item.label}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                item.access === 'Full access'
                  ? 'bg-green-100 text-green-700'
                  : item.access === 'Read only'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {item.access}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Manager / Worker — toggle groups */}
      {activeTab !== 'viewer' && (
        <div className="space-y-6">
          {activeGroups.map((group, gi) => (
            <div key={gi}>
              <div className="mb-3">
                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{group.title}</h4>
                <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.permissions.map(perm => {
                  const value = Boolean(local[perm.key]);
                  return (
                    <div
                      key={perm.key}
                      className={`flex items-start justify-between p-4 border rounded-xl transition-colors ${
                        value ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex-1 pr-4">
                        <p className="text-sm font-semibold text-gray-900">{perm.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                        {perm.warning && (
                          <p className="text-xs text-red-600 font-medium mt-1">⚠ {perm.warning}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggle(perm.key)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                          value ? 'bg-[#3D5F42]' : 'bg-gray-200'
                        }`}
                        aria-checked={value}
                        role="switch"
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            value ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
              {gi < activeGroups.length - 1 && <div className="border-t border-gray-100 mt-4" />}
            </div>
          ))}

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2d4632] transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  {isFr ? 'Enregistrement...' : 'Saving...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {isFr
                    ? `Enregistrer les permissions ${activeTab === 'manager' ? 'gestionnaire' : 'ouvrier'}`
                    : `Save ${activeTab === 'manager' ? 'Manager' : 'Worker'} Permissions`}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
