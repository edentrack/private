import { useEffect, useState } from 'react';
import { Plus, Syringe, Check, Calendar, Stethoscope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock, Vaccination } from '../../types/database';
import { FlockSwitcher } from '../common/FlockSwitcher';
import { VetLog } from '../vet/VetLog';

interface VaccinationScheduleProps {
  flock: Flock | null;
}

export function VaccinationSchedule({ flock }: VaccinationScheduleProps) {
  const [activeTab, setActiveTab] = useState<'vaccinations' | 'vet-log'>('vaccinations');

  if (activeTab === 'vet-log') {
    return (
      <div className="space-y-4">
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 w-fit shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('vaccinations')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Syringe className="w-4 h-4" />Vaccinations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('vet-log')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#3D5F42] text-white transition-colors"
          >
            <Stethoscope className="w-4 h-4" />Vet Log
          </button>
        </div>
        <VetLog />
      </div>
    );
  }

  return <VaccinationContent flock={flock} onSwitchTab={() => setActiveTab('vet-log')} activeTab={activeTab} onTabChange={setActiveTab} />;
}

function VaccinationContent({ flock, activeTab, onTabChange }: { flock: Flock | null; onSwitchTab: () => void; activeTab: string; onTabChange: (t: 'vaccinations' | 'vet-log') => void }) {
  const { t } = useTranslation();
  const { currentRole } = useAuth();
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(flock?.id || null);
  const [currentFlock, setCurrentFlock] = useState<Flock | null>(flock);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [dosage, setDosage] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [administeredDate, setAdministeredDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

  useEffect(() => {
    if (selectedFlockId) {
      loadFlockData();
    } else {
      setCurrentFlock(null);
      setVaccinations([]);
    }
  }, [selectedFlockId]);

  useEffect(() => {
    if (currentFlock) {
      loadVaccinations();
    }
  }, [currentFlock]);

  const loadFlockData = async () => {
    if (!selectedFlockId) return;

    const { data } = await supabase
      .from('flocks')
      .select('*')
      .eq('id', selectedFlockId)
      .single();

    if (data) {
      setCurrentFlock(data);
    }
  };

  const loadVaccinations = async () => {
    if (!currentFlock) return;

    const { data } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('flock_id', currentFlock.id)
      .order('scheduled_date', { ascending: true });

    setVaccinations(data || []);
  };

  const handleAdd = async () => {
    if (!currentFlock || !name) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('vaccinations').insert({
        flock_id: currentFlock.id,
        farm_id: currentFlock.farm_id,
        vaccine_name: name,
        scheduled_date: scheduledDate,
        dosage,
        notes,
        completed: false,
      });

      if (error) throw error;

      setName('');
      setDosage('');
      setNotes('');
      setShowAddForm(false);
      loadVaccinations();
    } catch (error) {
      console.error('Error adding vaccination:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (vaccination: Vaccination, useDate?: string) => {
    const dateToUse = useDate || administeredDate;

    const { error } = await supabase
      .from('vaccinations')
      .update({
        completed: !vaccination.completed,
        administered_date: !vaccination.completed ? dateToUse : null,
      })
      .eq('id', vaccination.id);

    if (!error) {
      setCompletingId(null);
      const _d = new Date(); setAdministeredDate(`${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`);
      loadVaccinations();
    }
  };

  const handleFlockChange = (flockId: string | null) => {
    setSelectedFlockId(flockId);
    setShowAddForm(false);
  };

  const upcomingVaccinations = vaccinations.filter(v => !v.completed);
  const completedVaccinations = vaccinations.filter(v => v.completed);

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1 w-fit shadow-sm">
        <button
          type="button"
          onClick={() => onTabChange('vaccinations')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'vaccinations' ? 'bg-[#3D5F42] text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Syringe className="w-4 h-4" />Vaccinations
        </button>
        <button
          type="button"
          onClick={() => onTabChange('vet-log')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'vet-log' ? 'bg-[#3D5F42] text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Stethoscope className="w-4 h-4" />Vet Log
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('vaccinations.title')}</h2>
          <p className="text-gray-600">{t('vaccinations.subtitle')}</p>
        </div>
        {currentFlock && currentRole && currentRole !== 'viewer' && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary inline-flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('vaccinations.add_vaccination')}
          </button>
        )}
      </div>

      <FlockSwitcher
        selectedFlockId={selectedFlockId}
        onFlockChange={handleFlockChange}
        showAllOption={false}
        label={t('vaccinations.select_flock')}
      />

      {!currentFlock ? (
        <div className="bg-white rounded-3xl p-12 text-center">
          <Syringe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{t('vaccinations.vaccination_management')}</h3>
          <p className="text-gray-600">{t('vaccinations.select_flock_above')}</p>
        </div>
      ) : (
        <>
          {showAddForm && (
            <div className="bg-white rounded-3xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{t('vaccinations.new_vaccination')}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('vaccinations.vaccination_name')}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-light"
                    placeholder={t('vaccinations.vaccination_name_placeholder')}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('vaccinations.scheduled_date')}
                    </label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="input-light"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('vaccinations.dosage')}
                    </label>
                    <input
                      type="text"
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                      className="input-light"
                      placeholder={t('vaccinations.dosage_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('vaccinations.notes')}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input-light"
                    rows={3}
                    placeholder={t('vaccinations.notes_placeholder')}
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="btn-secondary flex-1"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={loading || !name}
                    className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? t('vaccinations.adding') : t('common.add')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {upcomingVaccinations.length > 0 && (
            <div className="bg-white rounded-3xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-neon-500" />
                {t('vaccinations.upcoming')}
              </h3>
              <div className="space-y-3">
                {upcomingVaccinations.map((vaccination) => (
                  <div
                    key={vaccination.id}
                    className="p-4 border border-gray-200 rounded-xl hover:border-neon-400 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <Syringe className="w-5 h-5 text-neon-600" />
                          <h4 className="font-bold text-gray-900">{vaccination.vaccine_name}</h4>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1 ml-8">
                          <div>
                            <span className="font-medium">{t('vaccinations.date')}:</span>{' '}
                            {new Date(String(vaccination.scheduled_date).slice(0,10) + 'T12:00:00').toLocaleDateString()}
                          </div>
                          {vaccination.dosage && (
                            <div>
                              <span className="font-medium">{t('vaccinations.dosage')}:</span> {vaccination.dosage}
                            </div>
                          )}
                          {vaccination.notes && (
                            <div>
                              <span className="font-medium">{t('vaccinations.notes')}:</span> {vaccination.notes}
                            </div>
                          )}
                        </div>
                      </div>
                      {currentRole && currentRole !== 'viewer' && completingId !== vaccination.id && (
                        <button
                          onClick={() => setCompletingId(vaccination.id)}
                          className="ml-4 btn-primary text-sm"
                        >
                          {t('vaccinations.mark_complete')}
                        </button>
                      )}
                    </div>
                    {completingId === vaccination.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {t('vaccinations.administered_date')}
                          </label>
                          <input
                            type="date"
                            value={administeredDate}
                            onChange={(e) => setAdministeredDate(e.target.value)}
                            className="input-light"
                          />
                        </div>
                        {currentRole && currentRole !== 'viewer' && (
                          <div className="flex gap-3">
                            <button
                              onClick={() => setCompletingId(null)}
                              className="btn-secondary flex-1 text-sm"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              onClick={() => toggleComplete(vaccination)}
                              className="btn-primary flex-1 text-sm"
                            >
                              {t('vaccinations.confirm')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {completedVaccinations.length > 0 && (
            <div className="bg-white rounded-3xl p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <Check className="w-5 h-5 mr-2 text-green-600" />
                {t('vaccinations.completed')}
              </h3>
              <div className="space-y-3">
                {completedVaccinations.map((vaccination) => (
                  <div
                    key={vaccination.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{vaccination.vaccine_name}</h4>
                          <div className="text-sm text-gray-600">
                            {t('vaccinations.administered_on')} {new Date(String(vaccination.administered_date!).slice(0,10) + 'T12:00:00').toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {vaccinations.length === 0 && !showAddForm && (
            <div className="bg-white rounded-3xl p-12 text-center">
              <Syringe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('vaccinations.no_vaccinations_yet')}</h3>
              <p className="text-gray-600 mb-6 max-w-sm mx-auto text-sm">
                {currentRole === 'viewer'
                  ? t('vaccinations.no_vaccinations_worker_message')
                  : t('vaccinations.no_vaccinations_owner_message')}
              </p>
              {currentRole && currentRole !== 'viewer' && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="btn-primary inline-flex items-center"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {t('vaccinations.add_vaccination')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
