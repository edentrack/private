export type FlockType = 'Layer' | 'Broiler';
export type FlockStatus = 'active' | 'archived';
export type ExpenseCategory = 'feed' | 'medication' | 'equipment' | 'labor' | 'chicks purchase' | 'transport' | 'other';
export type Currency = 'XAF' | 'USD' | 'NGN' | 'GHS' | 'KES' | 'ZAR' | 'CFA' | 'RWF' | 'UGX' | 'TZS' | 'ETB' | 'XOF' | 'CAD' | 'GBP' | 'EUR' | 'INR' | 'BRL' | 'CNY' | 'AUD';
export type ExpenseKind = 'chicks_purchase' | 'chicks_transport' | 'transport' | 'manual' | null;
export type TaskStatus = 'pending' | 'completed';
export type InventoryLinkType = 'none' | 'feed' | 'other';
export type UserRole = 'owner' | 'manager' | 'worker';
export type InventoryType = 'feed' | 'other' | 'eggs';
export type InventoryEffect = 'none' | 'increase' | 'decrease';
export type MovementDirection = 'in' | 'out';
export type MovementSourceType = 'expense' | 'task' | 'egg_collection' | 'egg_sale' | 'manual';
export type FarmPlan = 'basic' | 'pro' | 'enterprise';
export type FrequencyMode = 'once_per_day' | 'multiple_times_per_day' | 'ad_hoc';
export type TaskScope = 'general' | 'broiler' | 'layer';
export type TaskTypeCategory = 'daily' | 'one_time' | 'recording';

export interface Farm {
  id: string;
  name: string;
  owner_id: string;
  country: string;
  currency_code: string;
  eggs_per_tray: number;
  profit_pool_opening_balance?: number | null;
  cost_per_egg_override: number | null;
  plan: FarmPlan;
  created_at: string;
  updated_at: string;
}

export interface FarmPermissions {
  farm_id: string;
  // ── Manager permissions ──────────────────────────────────────────────
  managers_can_view_financials: boolean;
  managers_can_create_expenses: boolean;
  managers_can_create_sales: boolean;
  managers_can_manage_inventory: boolean;
  managers_can_manage_payroll: boolean;
  managers_can_manage_team: boolean;
  managers_can_edit_flock_costs: boolean;
  managers_can_delete_records: boolean;
  managers_can_edit_shift_templates: boolean;
  managers_can_mark_vaccinations: boolean;
  managers_can_edit_feed_water: boolean;
  managers_can_edit_eggs: boolean;
  managers_can_use_smart_import: boolean;
  managers_can_view_analytics: boolean;
  managers_can_use_eden_ai: boolean;
  // ── Worker permissions ───────────────────────────────────────────────
  workers_can_log_mortality: boolean;
  workers_can_log_eggs: boolean;
  workers_can_log_weight: boolean;
  workers_can_use_eden_ai: boolean;
  workers_can_view_financials: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  is_super_admin?: boolean;
  account_status?: 'pending' | 'active' | 'suspended' | 'rejected';
  subscription_tier?: 'free' | 'pro' | 'enterprise';
  subscription_expires_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  onboarding_completed?: boolean;
  primary_goal?: string | null;
  preferred_language?: string;
  farm_name?: string | null;
  country?: string | null;
  city?: string | null;
  region_state?: string | null;
  currency_preference?: string | null;
  farm_id?: string | null;
  eggs_per_tray?: number | null;
}

/** Used by super-admin to show new signups (table: signup_alerts). */
export interface SignupAlert {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}

export interface Flock {
  id: string;
  user_id: string;
  farm_id: string;
  name: string;
  type: FlockType;
  start_date: string;
  arrival_date: string;
  initial_count: number;
  current_count: number;
  status: FlockStatus;
  purchase_price_per_bird: number;
  purchase_transport_cost: number;
  archived_at: string | null;
  archived_reason: string | null;
  sale_price: number | null;
  sale_buyer: string | null;
  final_bird_count: number | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MortalityLog {
  id: string;
  flock_id: string;
  farm_id: string;
  event_date: string;
  count: number;
  cause: string | null;
  photo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WeightLog {
  id: string;
  flock_id: string;
  farm_id: string;
  date: string;
  average_weight: number;
  sample_size: number;
  individual_weights?: number[];
  min_weight?: number;
  max_weight?: number;
  std_dev?: number;
  coefficient_variation?: number;
  total_estimated_weight?: number;
  daily_gain?: number;
  market_ready?: boolean;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface Task {
  id: string;
  farm_id: string;
  flock_id: string | null;
  template_id: string | null;
  title_override: string | null;
  scheduled_for: string;
  window_start: string;
  window_end: string;
  status: TaskStatus;
  requires_input: boolean;
  data_payload: Record<string, unknown> | null;
  completed_at: string | null;
  completed_by: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  assigned_to: string | null;
  notes: string | null;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
  completion_notes: string | null;
  completion_photo_url: string | null;
  task_templates?: {
    title: string;
    category: string;
  };
}

export interface LayerWeightLog {
  id: string;
  farm_id: string;
  flock_id: string;
  recorded_date: string;
  week_number: number;
  birds_weighed: number;
  total_weight_grams: number;
  average_body_weight: number;
  target_weight_grams: number | null;
  achievement_percent: number | null;
  weight_status: 'underweight' | 'on_target' | 'overweight' | 'unknown';
  breed_name: string | null;
  notes: string | null;
  recorded_by: string | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LayerWeightTarget {
  id: string;
  breed_name: string;
  week_number: number;
  target_weight_grams: number;
  tolerance_percent: number;
  notes: string | null;
  created_at: string;
}

export interface Vaccination {
  id: string;
  flock_id: string;
  farm_id: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  dosage: string | null;
  notes: string | null;
  completed: boolean;
  administered_by: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Expense {
  id: string;
  user_id: string;
  farm_id: string;
  flock_id: string | null;
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  description: string;
  date: string | null;
  incurred_on: string;
  receipt_url: string | null;
  notes: string | null;
  kind: ExpenseKind;
  inventory_link_type: InventoryLinkType | null;
  inventory_item_id: string | null;
  inventory_quantity: number | null;
  inventory_unit: string | null;
  paid_from_profit?: boolean | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Revenue {
  id: string;
  user_id: string;
  farm_id: string;
  flock_id: string;
  amount: number;
  currency: Currency;
  description: string;
  date: string;
  quantity: number;
  unit_price: number;
  transport_cost: number;
  created_at: string;
}

export interface EggCollection {
  id: string;
  farm_id: string;
  flock_id: string | null;
  collected_on: string;
  collection_date?: string;
  trays: number;
  broken: number;
  // Interval tracking (nullable for legacy daily entries)
  interval_start_at?: string | null;
  source_task_id?: string | null;
  source_interval_key?: string | null;
  // Size-aware inventory fields (good eggs)
  small_eggs?: number;
  medium_eggs?: number;
  large_eggs?: number;
  jumbo_eggs?: number;
  // Damaged/broken eggs (not added to good inventory)
  damaged_eggs?: number;
  // Convenience total for good eggs collected
  total_eggs?: number;
  notes: string | null;
  photo_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EggSale {
  id: string;
  farm_id: string;
  flock_id: string | null;
  customer_id: string | null;
  sold_on: string;
  trays: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
}

export interface FeedStock {
  id: string;
  farm_id: string;
  feed_type: string;
  bags_in_stock: number;
  initial_stock_bags: number;
  current_stock_bags: number;
  unit: string;
  notes: string | null;
  last_updated: string;
  created_at: string;
}

export interface OtherInventory {
  id: string;
  farm_id: string;
  item_name: string;
  category: string;
  quantity: number;
  unit: string;
  notes: string | null;
  last_updated: string;
  created_at: string;
}

export type TaskType = 'data' | 'checklist';

export interface TaskTemplate {
  id: string;
  farm_id: string;
  title: string;
  description: string;
  task_type: TaskType;
  category: string;
  requires_input: boolean;
  input_fields: {
    fields?: Array<{
      name: string;
      type: string;
      label: string;
      required: boolean;
      min?: number;
      max?: number;
      step?: number;
      placeholder?: string;
      options?: string[];
      options_source?: string;
      default?: any;
      accept?: string;
    }>;
    conditional_modal?: {
      trigger: string;
      modal_fields: Array<{
        name: string;
        type: string;
        label: string;
        required: boolean;
        options?: string[];
        placeholder?: string;
      }>;
    };
    inventory_update?: {
      table: string;
      field?: string;
      operation: string;
      value_field?: string;
      match_field?: string;
      flock_update?: {
        field: string;
        operation: string;
        value_field: string;
      };
    };
  } | null;
  updates_inventory: boolean;
  inventory_type: InventoryType | null;
  inventory_item_id: string | null;
  inventory_effect: InventoryEffect;
  inventory_unit: string | null;
  is_active: boolean;
  display_order: number;
  icon: string | null;
  frequency_mode: FrequencyMode;
  default_frequency: string;
  times_per_day: number | null;
  scheduled_times: string[] | null;
  // Recurrence (optional; used when default_frequency is weekly / one-day)
  days_of_week?: number[] | null; // 0=Sun ... 6=Sat
  one_time_date?: string | null; // YYYY-MM-DD
  is_time_bound: boolean;
  window_before_minutes: number;
  window_after_minutes: number;
  completion_window_minutes: number;
  preferred_time_of_day: string | null;
  is_enabled: boolean;
  allowed_roles_to_complete: UserRole[];
  scope: TaskScope;
  type_category: TaskTypeCategory;
  is_system_template: boolean;
  flock_type_filter: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  farm_id: string;
  inventory_type: InventoryType;
  inventory_item_id: string;
  direction: MovementDirection;
  quantity: number;
  unit: string;
  source_type: MovementSourceType;
  source_id: string | null;
  created_by: string;
  created_at: string;
}

export interface Customer {
  id: string;
  farm_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  total_purchases: number;
  outstanding_balance: number;
  created_at: string;
  updated_at: string;
}

export interface SalesInvoice {
  id: string;
  farm_id: string;
  customer_id: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  payment_method: string | null;
  payment_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  item_type: 'eggs' | 'birds' | 'other';
  quantity: number;
  unit_price: number;
  total: number;
  reference_id: string | null;
  created_at: string;
}

export interface MedicationInventory {
  id: string;
  farm_id: string;
  name: string;
  type: 'vaccine' | 'antibiotic' | 'supplement' | 'dewormer' | 'other';
  manufacturer: string | null;
  active_ingredient: string | null;
  withdrawal_period_days: number;
  current_stock: number;
  unit: string;
  cost_per_unit: number | null;
  expiry_date: string | null;
  storage_requirements: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicationUsage {
  id: string;
  farm_id: string;
  flock_id: string;
  medication_id: string | null;
  usage_date: string;
  quantity_used: number;
  birds_treated: number | null;
  reason: string | null;
  administered_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface HealthEvent {
  id: string;
  farm_id: string;
  flock_id: string;
  event_date: string;
  event_type: 'disease_outbreak' | 'vet_visit' | 'quarantine' | 'observation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  symptoms: string | null;
  treatment_plan: string | null;
  birds_affected: number | null;
  resolved: boolean;
  resolved_date: string | null;
  vet_name: string | null;
  cost: number | null;
  photos: string[] | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentProtocol {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  condition: string;
  medications: any;
  duration_days: number | null;
  dosage_instructions: string | null;
  withdrawal_period: number;
  created_by: string | null;
  created_at: string;
}

export interface EnvironmentalLog {
  id: string;
  farm_id: string;
  flock_id: string | null;
  log_date: string;
  temperature: number | null;
  humidity: number | null;
  ammonia_level: number | null;
  ventilation_rate: string | null;
  water_consumption: number | null;
  lighting_hours: number | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Equipment {
  id: string;
  farm_id: string;
  name: string;
  type: 'feeder' | 'drinker' | 'heater' | 'ventilation' | 'generator' | 'incubator' | 'other';
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  warranty_expiry: string | null;
  status: 'operational' | 'needs_maintenance' | 'broken' | 'retired';
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentMaintenance {
  id: string;
  farm_id: string;
  equipment_id: string;
  maintenance_date: string;
  maintenance_type: 'routine' | 'repair' | 'inspection' | 'emergency';
  description: string;
  cost: number | null;
  performed_by: string | null;
  next_maintenance_date: string | null;
  parts_replaced: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  farm_id: string;
  user_id: string;
  type: 'alert' | 'reminder' | 'info' | 'warning' | 'critical';
  category: 'feed_low' | 'task_overdue' | 'mortality_high' | 'medication_expiry' | 'equipment' | 'financial' | 'general';
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  read_at: string | null;
  action_url: string | null;
  metadata: any;
  created_at: string;
}

export type ProductType = 'eggs' | 'broilers' | 'chickens';
export type MemberRole = 'owner' | 'manager' | 'worker' | 'viewer';

export interface FarmMember {
  id: string;
  farm_id: string;
  user_id: string;
  role: MemberRole;
  is_active: boolean;
  invited_by: string | null;
  invited_at: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FarmMemberWithProfile extends FarmMember {
  profiles: {
    id: string;
    full_name: string;
    email?: string;
  };
}

export interface SalesReceipt {
  id: string;
  farm_id: string;
  receipt_number: string;
  flock_id: string | null;
  customer_name: string | null;
  sale_date: string;
  subtotal: number;
  total: number;
  payment_method: string;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  product_type: ProductType;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  inventory_deducted: boolean;
  created_at: string;
}

export interface ReceiptRefund {
  id: string;
  receipt_id: string;
  farm_id: string;
  refund_amount: number;
  refund_reason: string;
  items_refunded: any;
  inventory_restored: boolean;
  revenue_reversed: boolean;
  refunded_by: string;
  refunded_at: string;
}

export interface FarmCycle {
  id: string;
  farm_id: string;
  cycle_name: string;
  start_date: string;
  week_length_days: number;
  target_weeks: number | null;
  manual_week_override: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CycleStatus {
  start_date: string;
  computed_week: number;
  current_week: number;
  week_start_date: string;
  week_end_date: string;
  days_remaining: number;
  countdown_label: string;
  target_weeks: number | null;
  weeks_remaining_to_target: number | null;
  cycle_name: string;
  week_length_days: number;
}

export interface FlockCycle {
  id: string;
  farm_id: string;
  flock_id: string;
  cycle_name: string;
  start_date: string;
  week_length_days: number;
  target_weeks: number | null;
  manual_week_override: number | null;
  target_reached_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlockCycleStatus {
  flock_id: string;
  start_date: string;
  computed_week: number;
  current_week: number;
  week_start_date: string;
  week_end_date: string;
  days_remaining: number;
  countdown_label: string;
  target_weeks: number | null;
  weeks_remaining_to_target: number | null;
  target_reached_notes: string | null;
  cycle_name: string;
  week_length_days: number;
}

export interface FlockCycleRollupItem {
  flock_id: string;
  flock_name: string;
  flock_type: string;
  current_week: number | null;
  days_remaining: number | null;
  countdown_label: string;
  week_start_date: string | null;
  week_end_date: string | null;
  target_weeks: number | null;
  weeks_remaining_to_target: number | null;
  target_reached_notes: string | null;
  has_cycle: boolean;
  flock_status: string;
  start_date: string | null;
}

export type ForecastCategory = 'feed' | 'vaccines' | 'medication' | 'labor' | 'utilities' | 'transport' | 'misc';
export type ForecastSource = 'manual' | 'suggested' | 'from_inventory' | 'from_vaccine_schedule';

export interface FlockForecastWeek {
  id: string;
  farm_id: string;
  flock_id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  is_locked: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlockForecastItem {
  id: string;
  farm_id: string;
  flock_id: string;
  forecast_week_id: string;
  category: ForecastCategory;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  notes: string | null;
  source: ForecastSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlockForecastRollup {
  flock_id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  total_cost: number;
  feed_cost: number;
  vaccines_cost: number;
  medication_cost: number;
  labor_cost: number;
  utilities_cost: number;
  transport_cost: number;
  misc_cost: number;
}

export interface FarmForecastRollup {
  farm_id: string;
  flock_id: string;
  flock_name: string;
  flock_type: string;
  total_cost: number;
}
