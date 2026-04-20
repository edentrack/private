import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';;

interface InsightsDataStateProps {
  state: 'loading' | 'not-enough-data' | 'ready';
  missing?: string[];
}

export function InsightsDataState({ state, missing = [] }: InsightsDataStateProps) {
  const { t } = useTranslation();
  if (state === 'loading') {
    return (
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-12 text-center border border-white/50 shadow-soft">
        <div className="max-w-md mx-auto">
          <div className="inline-flex p-4 bg-gray-100 rounded-2xl mb-4">
            <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t('insights.loading_insights') || 'Loading insights...'}
          </h3>
          <p className="text-gray-600 text-sm">
            {t('insights.gathering_data') || 'Gathering your farm data'}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'not-enough-data') {
    return (
      <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-12 text-center border border-white/50 shadow-soft">
        <div className="max-w-md mx-auto">
          <div className="inline-flex p-4 bg-orange-50 rounded-2xl mb-4">
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {t('insights.not_enough_data')}
          </h3>
          <p className="text-gray-600 text-sm mb-6">
            {t('insights.add_data_message')}
          </p>

          <div className="bg-white rounded-xl p-4 border border-gray-200">
            <div className="text-left space-y-3">
              {missing.map((item, index) => (
                <div key={index} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center">
                      <div className="w-2 h-2 bg-gray-300 rounded-full" />
                    </div>
                  </div>
                  <span className="text-gray-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
