import { useState } from 'react';
import { Droplets, Eye, Activity } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { WaterQualityPage } from './WaterQualityPage';
import { PondInspectionsPage } from './PondInspectionsPage';

/**
 * Pond Check — unified entry point for the daily pond walk.
 *
 * Replaces the separate "Water Quality" and "Pond Inspections" nav
 * tabs that were confusing fish farmers. Both record observations
 * from the same walk: water quality covers the numerical readings
 * (DO, pH, ammonia, temperature), pond inspections cover the
 * qualitative observations (water clarity, fish behavior, dead fish
 * count). Keeping them as one page with two sub-tabs means the
 * farmer doesn't have to remember which form is for what data
 * point.
 *
 * The two underlying pages are mounted as-is — no logic merged.
 * That keeps the existing schemas, RLS, and Eden's deep-links
 * intact. If the unified flow proves useful, we can collapse the
 * two forms into one in a future pass; for now the simpler change
 * is just stacking them behind tabs.
 */

type Section = 'readings' | 'observations';

export function PondCheckPage() {
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [section, setSection] = useState<Section>('readings');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Activity className="w-6 h-6 text-cyan-700" />
          {isFr ? "Vérification d'étang" : 'Pond Check'}
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {isFr
            ? "Une page pour toute votre inspection quotidienne d'étang : mesures de l'eau + observations visuelles."
            : 'One page for your whole daily pond walk — water readings + visual observations.'}
        </p>
      </div>

      {/* Sub-tabs — switch between the readings (numerical) and the
          observations (qualitative). Default is readings since that's
          what most farmers do first when they arrive at the pond. */}
      <div className="inline-flex bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setSection('readings')}
          className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors inline-flex items-center gap-2 ${
            section === 'readings'
              ? 'bg-white text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Droplets className="w-4 h-4" />
          {isFr ? "Mesures de l'eau" : 'Water readings'}
        </button>
        <button
          type="button"
          onClick={() => setSection('observations')}
          className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors inline-flex items-center gap-2 ${
            section === 'observations'
              ? 'bg-white text-cyan-700 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Eye className="w-4 h-4" />
          {isFr ? 'Observations visuelles' : 'Visual observations'}
        </button>
      </div>

      <div>
        {section === 'readings' ? (
          // WaterQualityPage takes onNavigate for its in-page links
          // (e.g. "see thresholds in Settings"). We hash-route to keep
          // navigation consistent with the rest of the app.
          <WaterQualityPage onNavigate={(view: string) => {
            window.location.hash = `#/${view}`;
            window.dispatchEvent(new HashChangeEvent('hashchange'));
          }} />
        ) : (
          <PondInspectionsPage />
        )}
      </div>
    </div>
  );
}

export default PondCheckPage;
