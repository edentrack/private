import { FarmPlan } from '../types/database';

export function isPro(plan: FarmPlan): boolean {
  return plan === 'pro' || plan === 'enterprise';
}

export function isEnterprise(plan: FarmPlan): boolean {
  return plan === 'enterprise';
}

export function hasFeatureAccess(plan: FarmPlan, feature: 'kpis' | 'alerts' | 'daily_summary' | 'advanced_analytics'): boolean {
  switch (feature) {
    case 'kpis':
    case 'alerts':
    case 'daily_summary':
      return isPro(plan);
    case 'advanced_analytics':
      return isEnterprise(plan);
    default:
      return true;
  }
}

export function getPlanName(plan: FarmPlan): string {
  switch (plan) {
    case 'basic':
      return 'Basic';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
  }
}

export function getPlanFeatures(plan: FarmPlan): string[] {
  const features = [
    'Core farm management',
    'Task management',
    'Basic inventory tracking',
    'Flock management',
  ];

  if (isPro(plan)) {
    features.push(
      'KPIs & Analytics',
      'Smart Alerts',
      'Daily Farm Summary',
      'Advanced Reporting'
    );
  }

  if (isEnterprise(plan)) {
    features.push(
      'Priority Support',
      'Custom Integrations',
      'Multi-farm Management'
    );
  }

  return features;
}
