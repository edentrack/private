import { useState, useCallback, useEffect } from 'react';
import { ChevronRight, CheckCircle, ArrowRight, AlertCircle, Copy, Check, Share2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from '../../utils/currency';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'farm' | 'flock' | 'team' | 'done';
type SpeciesType = 'layer' | 'broiler' | 'mixed' | 'turkey';

const SPECIES_OPTIONS: { id: SpeciesType; emoji: string; label: string; sub: string }[] = [
  { id: 'layer', emoji: '🥚', label: 'Layers', sub: 'Egg production' },
  { id: 'broiler', emoji: '🍗', label: 'Broilers', sub: 'Meat production' },
  { id: 'mixed', emoji: '🐔', label: 'Mixed', sub: 'Eggs & meat' },
  { id: 'turkey', emoji: '🦃', label: 'Turkey', sub: 'Meat production' },
];

const defaultFlockName = (species: SpeciesType) => {
  const map: Record<SpeciesType, string> = {
    layer: 'Layer Flock 1',
    broiler: 'Broiler Batch 1',
    mixed: 'Mixed Flock 1',
    turkey: 'Turkey Flock 1',
  };
  return map[species];
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user, refreshSession, currentFarm } = useAuth();
  const [step, setStep] = useState<Step>('welcome');

  // If this user already has a farm, onboarding is done — fix the DB flag and exit immediately
  useEffect(() => {
    if (currentFarm && user) {
      supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id).then(() => {
        onComplete();
      });
    }
  }, [currentFarm, user, onComplete]);

  // Farm data
  const [farmName, setFarmName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [species, setSpecies] = useState<SpeciesType>('layer');

  // Flock data
  const [flockName, setFlockName] = useState('');
  const [flockCount, setFlockCount] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);

  // After creation
  const [createdFarmId, setCreatedFarmId] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Auto-fill flock name when species changes (only if not manually edited)
  const [flockNameTouched, setFlockNameTouched] = useState(false);
  useEffect(() => {
    if (!flockNameTouched) setFlockName(defaultFlockName(species));
  }, [species, flockNameTouched]);

  const createFarmAndFlock = useCallback(async () => {
    if (!user) return;
    const count = parseInt(flockCount, 10);
    if (!farmName.trim() || isNaN(count) || count <= 0) return;

    setSaving(true);
    setError('');

    try {
      const currencyCode = getCurrencyForCountry(country);

      // 1. Create farm
      const { data: farm, error: farmError } = await supabase
        .from('farms')
        .insert({ name: farmName.trim(), owner_id: user.id, country, currency_code: currencyCode })
        .select('id, join_secret')
        .single();
      if (farmError) throw farmError;

      // 2. Add owner as farm member
      await supabase.from('farm_members').insert({
        farm_id: farm.id,
        user_id: user.id,
        role: 'owner',
        is_active: true,
      });

      // 3. Update profile
      await supabase.from('profiles').update({
        onboarding_completed: true,
        farm_name: farmName.trim(),
        country,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      // 4. Create first flock
      const finalFlockName = flockName.trim() || defaultFlockName(species);
      await supabase.from('flocks').insert({
        user_id: user.id,
        farm_id: farm.id,
        name: finalFlockName,
        type: species,
        species: 'poultry',
        start_date: startDate,
        arrival_date: startDate,
        initial_count: count,
        current_count: count,
        purchase_price_per_bird: 0,
        purchase_transport_cost: 0,
        status: 'active',
      });

      // 5. Build join link from join_secret
      const secret = farm.join_secret;
      if (secret) {
        setJoinLink(`${window.location.origin}${window.location.pathname}#/join/${farm.id}/${secret}`);
      }
      setCreatedFarmId(farm.id);

      // 6. Refresh session so currentFarm is populated
      await refreshSession?.();
      setStep('team');
    } catch (err: any) {
      console.error('Onboarding error:', err);
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        setError('A farm with that name already exists. Choose a different name.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [user, farmName, country, species, flockName, flockCount, startDate, refreshSession]);

  const copyLink = async () => {
    if (!joinLink) return;
    await navigator.clipboard.writeText(joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    if (!joinLink) return;
    const text = `Join my farm on Edentrack — tap the link to create your account:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my farm on Edentrack', text, url: joinLink }); return; } catch {}
    }
    copyLink();
  };

  // ─── Welcome ────────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8 text-center">
          <span className="text-3xl font-black tracking-tight">
            <span className="text-gray-900">EDEN</span>
            <span style={{ color: '#d97706' }}>TRACK</span>
          </span>

          <div
            className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-4xl"
            style={{ background: 'rgba(255,221,0,0.12)', border: '2px solid rgba(255,221,0,0.3)' }}
          >
            🐔
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-gray-900">Welcome to Edentrack</h1>
            <p className="text-gray-500 text-sm leading-relaxed">
              Set up your farm in 3 quick steps.
            </p>
          </div>

          <div className="text-left space-y-3 bg-gray-50 rounded-2xl p-5">
            {[
              { e: '📊', t: 'Track flocks, sales, expenses & mortality' },
              { e: '🤖', t: 'Eden AI diagnoses problems & answers questions' },
              { e: '📱', t: 'Works offline on your phone' },
              { e: '🆓', t: 'Free forever on Starter plan' },
            ].map(({ e, t }) => (
              <div key={t} className="flex items-center gap-3 text-sm text-gray-700">
                <span>{e}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep('farm')}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 hover:brightness-105 transition-all"
            style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 1: Farm name + species ────────────────────────────────────────────
  if (step === 'farm') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Step 1 of 3</p>
            <h1 className="text-2xl font-extrabold text-gray-900">Your farm</h1>
            <p className="text-gray-400 text-sm">Name it and tell us what you raise.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Farm Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g., Sunrise Poultry Farm"
                autoFocus
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
              >
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1.5">
                Currency: <strong>{getCurrencyForCountry(country)}</strong>
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                What do you raise? <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SPECIES_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSpecies(opt.id)}
                    className={`flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-center ${
                      species === opt.id
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-sm font-bold text-gray-900">{opt.label}</span>
                    <span className="text-[11px] text-gray-500">{opt.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep('flock')}
            disabled={!farmName.trim()}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Step 2: First flock ─────────────────────────────────────────────────────
  if (step === 'flock') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Step 2 of 3</p>
            <h1 className="text-2xl font-extrabold text-gray-900">First flock</h1>
            <p className="text-gray-400 text-sm">Add your birds — you can update details later.</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Flock Name</label>
              <input
                type="text"
                value={flockName}
                onChange={(e) => { setFlockNameTouched(true); setFlockName(e.target.value); }}
                placeholder={defaultFlockName(species)}
                disabled={saving}
                autoFocus
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Number of Birds <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={flockCount}
                onChange={(e) => setFlockCount(e.target.value)}
                placeholder="e.g., 500"
                min="1"
                disabled={saving}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={saving}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setError(''); setStep('farm'); }}
              disabled={saving}
              className="h-12 px-5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={createFarmAndFlock}
              disabled={saving || !flockCount || parseInt(flockCount, 10) <= 0}
              className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-900/30 border-t-gray-900 rounded-full animate-spin" />
                  Creating farm…
                </>
              ) : (
                <>
                  Create Farm & Flock
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 3: Team invite ─────────────────────────────────────────────────────
  if (step === 'team') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Step 3 of 3</p>
            <h1 className="text-2xl font-extrabold text-gray-900">Invite your team</h1>
            <p className="text-gray-400 text-sm">Share this link with workers to join your farm instantly.</p>
          </div>

          {joinLink ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <span className="text-sm">👥</span>
                <p className="text-xs text-gray-600">
                  Send this to one worker at a time. The link changes after each use — forward it again for the next person.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="flex-1 text-xs text-gray-500 truncate font-mono">{joinLink}</p>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={copyLink}
                    className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {copied
                      ? <Check className="w-3.5 h-3.5 text-green-500" />
                      : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                  </button>
                  <button
                    onClick={shareLink}
                    className="p-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Workers join with no email verification. You can generate a new link anytime in Settings.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-500 text-center">
              Team invite link available in Settings after setup.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onComplete}
              className="flex-1 h-12 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all"
            >
              Skip for now
            </button>
            <button
              onClick={onComplete}
              className="flex-1 h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 hover:brightness-105 transition-all"
              style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Done (fallback) ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-extrabold text-gray-900">You're all set!</h1>
          <p className="text-gray-500 text-sm">Your farm is ready. Head to the dashboard to get started.</p>
        </div>
        <button
          onClick={onComplete}
          className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-gray-900 hover:brightness-105 transition-all"
          style={{ background: '#ffdd00', boxShadow: '0 4px 16px rgba(255,221,0,0.3)' }}
        >
          Go to Dashboard
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
