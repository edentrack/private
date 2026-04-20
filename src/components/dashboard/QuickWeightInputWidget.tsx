import { Scale, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QuickWeightInputWidgetProps {
  flockId: string | null;
  onNavigate: (view: string) => void;
}

export function QuickWeightInputWidget({ flockId, onNavigate }: QuickWeightInputWidgetProps) {
  const { t } = useTranslation();
  
  return (
    <div className="section-card bg-gradient-to-br from-yellow-50 to-white border border-yellow-100 hover:shadow-lg transition-all cursor-pointer group" onClick={() => onNavigate('weight')}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-[#F4D03F] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
          <Scale className="w-5 h-5 text-gray-900" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">{t('dashboard.quick_weight_check')}</h3>
          <p className="text-xs text-gray-600">{t('dashboard.go_to_weight_tracking')}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-[#F4D03F] group-hover:translate-x-1 transition-transform" />
      </div>

      <p className="text-sm text-gray-600">
        {flockId ? t('dashboard.record_and_analyze_weights') : t('dashboard.select_flock_to_track_weights')}
      </p>
    </div>
  );
}
