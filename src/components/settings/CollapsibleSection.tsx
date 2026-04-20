import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CollapsibleSectionProps {
  icon: ReactNode;
  title: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({ icon, title, defaultExpanded = false, children }: CollapsibleSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm animate-fade-in-up">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 text-gray-600">
            {icon}
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4 mt-4 animate-fade-in">
          {children}
        </div>
      )}

      {!isExpanded && (
        <div className="text-xs text-gray-500 italic mt-2">
          {t('settings.click_to_expand') || 'Click to expand...'}
        </div>
      )}
    </div>
  );
}
