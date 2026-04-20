export interface RoadmapFeature {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: 'coming-soon' | 'in-progress' | 'launched';
  phase: 'Week 2' | 'Month 1' | 'Month 2' | 'Month 3+';
  category: string;
  benefits: string[];
  votes?: number;
}

export const roadmapFeatures: RoadmapFeature[] = [
  {
    id: 'advanced-reports',
    title: 'Advanced Financial Reports',
    description: 'Detailed profit/loss reports, ROI analysis, and expense breakdowns.',
    icon: '📊',
    status: 'coming-soon',
    phase: 'Week 2',
    category: 'Analytics',
    benefits: [
      'Monthly profit/loss statements',
      'ROI per flock comparison',
      'Expense category analysis',
      'Revenue forecasting',
      'Export to PDF/Excel',
    ],
  },

  {
    id: 'mobile-money',
    title: 'Mobile Money Integration',
    description: 'Pay subscriptions with MTN Mobile Money and Orange Money directly in-app.',
    icon: '💳',
    status: 'coming-soon',
    phase: 'Month 1',
    category: 'Payments',
    benefits: [
      'MTN Mobile Money support',
      'Orange Money support',
      'Instant payment confirmation',
      'Auto-renewal for subscriptions',
      'Payment history tracking',
    ],
  },

  {
    id: 'offline-mode',
    title: 'Offline Mode',
    description: 'Work without internet - data syncs automatically when you reconnect.',
    icon: '📴',
    status: 'coming-soon',
    phase: 'Month 1',
    category: 'Core',
    benefits: [
      'Record data without internet',
      'Auto-sync when online',
      'Works in remote areas',
      'Never lose data',
      'Faster performance',
    ],
  },

  {
    id: 'whatsapp-integration',
    title: 'WhatsApp Notifications',
    description: 'Get alerts and reminders via WhatsApp for tasks, low stock, and more.',
    icon: '💬',
    status: 'coming-soon',
    phase: 'Month 1',
    category: 'Notifications',
    benefits: [
      'Task reminders on WhatsApp',
      'Low stock alerts',
      'Sale notifications',
      'Team updates',
      'Daily summary reports',
    ],
  },

  {
    id: 'ai-disease-detection',
    title: 'AI Disease Detection',
    description: 'Upload bird photos and get instant disease diagnosis with treatment recommendations.',
    icon: '🤖',
    status: 'coming-soon',
    phase: 'Month 2',
    category: 'AI Features',
    benefits: [
      'Photo-based disease detection',
      'Treatment recommendations',
      'Prevention tips',
      'Outbreak alerts',
      'Vet connection',
    ],
  },

  {
    id: 'voice-input',
    title: 'Voice Input & Commands',
    description: 'Record data hands-free using voice commands - perfect for busy workers!',
    icon: '🎤',
    status: 'coming-soon',
    phase: 'Month 2',
    category: 'AI Features',
    benefits: [
      'Hands-free data entry',
      'Voice task creation',
      'Speak to record sales',
      'French & English support',
      '10x faster recording',
    ],
  },

  {
    id: 'receipt-scanning',
    title: 'Receipt Scanning (OCR)',
    description: 'Take photo of receipts and auto-extract expense details.',
    icon: '📸',
    status: 'coming-soon',
    phase: 'Month 2',
    category: 'AI Features',
    benefits: [
      'Photo to expense conversion',
      'Auto-extract amount & vendor',
      'No manual typing',
      'Attach receipt images',
      'Faster bookkeeping',
    ],
  },

  {
    id: 'weather-integration',
    title: 'Weather Alerts & Recommendations',
    description: 'Get weather forecasts and actionable recommendations for your farm.',
    icon: '🌤️',
    status: 'coming-soon',
    phase: 'Month 2',
    category: 'Insights',
    benefits: [
      '7-day weather forecast',
      'Heat wave alerts',
      'Rain/storm warnings',
      'Ventilation recommendations',
      'Location-based forecasts',
    ],
  },

  {
    id: 'feed-calculator',
    title: 'Smart Feed Calculator',
    description: 'AI-powered feed optimization based on bird age, breed, and performance.',
    icon: '🧮',
    status: 'coming-soon',
    phase: 'Month 3+',
    category: 'AI Features',
    benefits: [
      'Optimal feed quantity',
      'Cost optimization',
      'Breed-specific formulas',
      'Growth predictions',
      'Reduce waste',
    ],
  },

  {
    id: 'marketplace-ordering',
    title: 'Direct Marketplace Ordering',
    description: 'Order feed and supplies directly from marketplace with delivery tracking.',
    icon: '🛒',
    status: 'coming-soon',
    phase: 'Month 3+',
    category: 'Marketplace',
    benefits: [
      'Order in-app',
      'Compare prices',
      'Delivery tracking',
      'Payment protection',
      'Order history',
    ],
  },

  {
    id: 'financing-integration',
    title: 'Farm Financing & Loans',
    description: 'Apply for farm loans and financing directly through the platform.',
    icon: '🏦',
    status: 'coming-soon',
    phase: 'Month 3+',
    category: 'Finance',
    benefits: [
      'Partner bank loans',
      'Equipment financing',
      'Feed credit',
      'Fast approval',
      'Transparent terms',
    ],
  },

  {
    id: 'vet-consultation',
    title: 'Virtual Vet Consultation',
    description: 'Chat with licensed veterinarians directly in the app.',
    icon: '👨‍⚕️',
    status: 'coming-soon',
    phase: 'Month 3+',
    category: 'Support',
    benefits: [
      'Chat with vets',
      'Photo diagnosis',
      'Prescription delivery',
      'Emergency support',
      'Affordable consultations',
    ],
  },

  {
    id: 'multi-language',
    title: 'More Languages',
    description: 'Add support for local Cameroonian languages and more.',
    icon: '🌍',
    status: 'coming-soon',
    phase: 'Month 3+',
    category: 'Localization',
    benefits: [
      'Pidgin English',
      'More local languages',
      'Better accessibility',
      'Reach more farmers',
      'Community translations',
    ],
  },
];

export const roadmapCategories = [
  'All Features',
  'AI Features',
  'Core',
  'Analytics',
  'Payments',
  'Marketplace',
  'Finance',
  'Notifications',
  'Support',
  'Platform',
  'Insights',
  'Localization',
];
