import { useEffect, useState } from 'react';
import { Syringe, Calendar, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { useLanguage } from '../../contexts/LanguageContext';
import { Flock, Vaccination } from '../../types/database';

interface NextVaccinationCardProps {
  flock: Flock | null;
}

export function NextVaccinationCard({ flock }: NextVaccinationCardProps) {
  const farmSpecies = useFarmSpecies();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const [nextVaccination, setNextVaccination] = useState<Vaccination | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysUntil, setDaysUntil] = useState<number | null>(null);

  useEffect(() => {
    if (flock) {
      loadNextVaccination();
    } else {
      setNextVaccination(null);
      setLoading(false);
    }
  }, [flock]);

  const loadNextVaccination = async () => {
    if (!flock) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data } = await supabase
        .from('vaccinations')
        .select('*')
        .eq('farm_id', flock.farm_id)
        .eq('flock_id', flock.id)
        .eq('completed', false)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(1);

      if (data && data.length > 0) {
        const vaccination = data[0];
        setNextVaccination(vaccination);

        const scheduledDate = new Date(vaccination.scheduled_date);
        const todayDate = new Date(today);
        const diffTime = scheduledDate.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setDaysUntil(diffDays);
      } else {
        setNextVaccination(null);
        setDaysUntil(null);
      }
    } catch (error) {
      console.error('Error loading next vaccination:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!flock) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <Syringe className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{isFr ? 'Prochaine vaccination' : 'Next Vaccination'}</h3>
        </div>
        <p className="text-gray-500 text-center py-8">
          {isFr ? 'Sélectionnez un troupeau pour voir les vaccinations à venir' : 'Select a flock to view upcoming vaccinations'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-50 rounded-xl">
            <Syringe className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{isFr ? 'Prochaine vaccination' : 'Next Vaccination'}</h3>
        </div>
        <div className="text-center py-8 text-gray-500">{isFr ? 'Chargement...' : 'Loading...'}</div>
      </div>
    );
  }

  if (!nextVaccination) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-gray-50 rounded-xl">
            <Syringe className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{isFr ? 'Prochaine vaccination' : 'Next Vaccination'}</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500 mb-2">{isFr ? 'Aucune vaccination à venir' : 'No upcoming vaccinations'}</p>
          <p className="text-sm text-gray-400">
            {isFr
              ? `Planifiez des vaccinations pour garder vos ${farmSpecies.groupTerm.toLowerCase()} en bonne santé`
              : `Schedule vaccinations to keep your ${farmSpecies.groupTerm.toLowerCase()} healthy`}
          </p>
        </div>
      </div>
    );
  }

  const getUrgencyColor = () => {
    if (daysUntil === null) return 'gray';
    if (daysUntil === 0) return 'red';
    if (daysUntil <= 3) return 'orange';
    if (daysUntil <= 7) return 'yellow';
    return 'blue';
  };

  const urgencyColor = getUrgencyColor();
  const colorClasses = {
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    blue: 'bg-blue-50 text-blue-600',
    gray: 'bg-gray-50 text-gray-600'
  };

  return (
    <div className="bg-white rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-3 rounded-xl ${colorClasses[urgencyColor]}`}>
          <Syringe className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">{isFr ? 'Prochaine vaccination' : 'Next Vaccination'}</h3>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-sm text-gray-500 mb-1">{isFr ? 'Nom du vaccin' : 'Vaccine Name'}</div>
          <div className="text-2xl font-bold text-gray-900">
            {nextVaccination.name}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-5 h-5" />
            <span className="font-medium">
              {new Date(nextVaccination.scheduled_date).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold ${colorClasses[urgencyColor]}`}>
            <Clock className="w-4 h-4" />
            {daysUntil === 0 ? (
              <span>{isFr ? 'Aujourd\'hui' : 'Today'}</span>
            ) : daysUntil === 1 ? (
              <span>{isFr ? 'Demain' : 'Tomorrow'}</span>
            ) : (
              <span>{isFr ? `dans ${daysUntil} jours` : `in ${daysUntil} days`}</span>
            )}
          </div>
        </div>

        {nextVaccination.dosage && (
          <div>
            <div className="text-sm text-gray-500 mb-1">{isFr ? 'Dosage' : 'Dosage'}</div>
            <div className="text-sm text-gray-900">{nextVaccination.dosage}</div>
          </div>
        )}

        {nextVaccination.notes && (
          <div>
            <div className="text-sm text-gray-500 mb-1">{isFr ? 'Notes' : 'Notes'}</div>
            <div className="text-sm text-gray-700">{nextVaccination.notes}</div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            {isFr ? 'Troupeau' : 'Flock'}: <span className="font-medium text-gray-700">{flock.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
