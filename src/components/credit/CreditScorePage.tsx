import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Download, RefreshCcw, Loader2, FileText, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { buildCreditScore, CreditScoreResult } from '../../utils/creditScore';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { getCurrencySymbol } from '../../utils/currency';
// creditworthinessPDF pulls in jsPDF + jspdf-autotable. Dynamic-imported in
// handleDownload so the chunk only loads when the user clicks the button.

const TIER_COLORS: Record<CreditScoreResult['tier'], { bg: string; ring: string; text: string }> = {
  excellent: { bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700' },
  good: { bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700' },
  fair: { bg: 'bg-amber-50', ring: 'ring-amber-200', text: 'text-amber-700' },
  building: { bg: 'bg-orange-50', ring: 'ring-orange-200', text: 'text-orange-700' },
  insufficient: { bg: 'bg-gray-50', ring: 'ring-gray-200', text: 'text-gray-600' },
};

export function CreditScorePage() {
  const { user, profile, currentFarm } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<CreditScoreResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Species-aware labels for "Active flocks/ponds" and "Animals on farm"
  // — pre-fix the page used hardcoded generic copy on every species.
  // Greg's audit, May 8 2026.
  const farmSpecies = useFarmSpecies();

  const compute = useCallback(async () => {
    if (!currentFarm) return;
    setLoading(true);
    try {
      const result = await buildCreditScore({ farmId: currentFarm.id, supabase });
      setScore(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Failed to compute score: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentFarm, showToast]);

  useEffect(() => {
    compute();
  }, [compute]);

  const handleDownload = async () => {
    if (!score || !currentFarm || !user) return;
    setDownloading(true);
    try {
      const { downloadCreditworthinessPDF } = await import('../../utils/creditworthinessPDF');
      downloadCreditworthinessPDF({
        farmName: currentFarm.name,
        ownerName: profile?.full_name || user.email || 'Farm Owner',
        ownerEmail: user.email || '',
        location: currentFarm.location ?? null,
        currencyCode: currentFarm.currency_code || currentFarm.currency || 'USD',
        score,
      });
      showToast('PDF downloaded — submit to your bank.', 'success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Download failed: ${msg}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (!currentFarm) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-600">
        Select a farm to compute your credit score.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!score) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-gray-600">
        Could not compute score. Try again.
        <button onClick={compute} className="block mx-auto mt-3 text-sm text-emerald-600">
          Retry
        </button>
      </div>
    );
  }

  const tone = TIER_COLORS[score.tier];
  const fmt = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));
  const currency = currentFarm.currency_code || currentFarm.currency || 'USD';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            Creditworthiness
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            A score banks and lenders can use to assess your farm. Built from your operational and financial records.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={compute}
            className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <RefreshCcw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download PDF for bank
          </button>
        </div>
      </div>

      <div className={`${tone.bg} rounded-2xl ring-1 ${tone.ring} p-6 mb-6 flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Overall score</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-5xl font-bold text-gray-900 tabular-nums">{score.total}</span>
            <span className="text-gray-500">/ 100</span>
          </div>
          <div className={`mt-1 text-sm font-medium ${tone.text}`}>{score.tierLabel}</div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <FileText className="w-5 h-5 text-gray-500" />
          <div>
            <div className="font-medium text-gray-900">Bank-ready PDF</div>
            <div className="text-xs text-gray-500">Includes score, breakdown, and operational summary</div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-6">
        {score.components.map((c) => {
          const pct = c.maxScore > 0 ? c.score / c.maxScore : 0;
          const barColor =
            pct >= 0.8 ? 'bg-emerald-500' : pct >= 0.5 ? 'bg-amber-500' : 'bg-red-400';
          return (
            <div key={c.key} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{c.label}</span>
                <span className="text-sm text-gray-600 tabular-nums">
                  {c.score} / {c.maxScore}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${barColor}`} style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="text-xs text-gray-500 mt-2">{c.detail}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <h2 className="font-medium text-gray-900 mb-3">Your operations summary</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {(() => {
            // Use the human currency symbol on UI (CFA, NGN). The PDF
            // download keeps the ISO code for bank submission.
            const currencyLabel = getCurrencySymbol(currency);
            // Species-correct labels: poultry → "Active flocks", aquaculture
            // → "Active ponds", rabbits → "Active rabbitries". And the
            // "animals" tile uses the species term.
            const groupLabel = `Active ${farmSpecies.groupTermPlural.toLowerCase()}`;
            const animalsLabel = `${farmSpecies.animalTermPlural} on farm`;
            return (
              <>
                <Stat label="Days on platform" value={`${score.metrics.daysOnPlatform}`} />
                <Stat label={groupLabel} value={`${score.metrics.activeFlockCount}`} />
                <Stat label={animalsLabel} value={fmt(score.metrics.totalAnimals)} />
                <Stat label="Revenue (12mo)" value={`${currencyLabel} ${fmt(score.metrics.totalRevenueLast12mo)}`} />
                <Stat label="Expenses (12mo)" value={`${currencyLabel} ${fmt(score.metrics.totalExpensesLast12mo)}`} />
                <Stat
                  label="Net result (12mo)"
                  value={`${currencyLabel} ${fmt(score.metrics.netLast12mo)}`}
                  tone={score.metrics.netLast12mo >= 0 ? 'good' : 'bad'}
                />
              </>
            );
          })()}
          <Stat label="Sales records" value={`${score.metrics.salesEntryCount}`} />
          <Stat label="Expense records" value={`${score.metrics.expenseEntryCount}`} />
          <Stat
            label={`${farmSpecies.lossNoun} rate`}
            value={`${score.metrics.mortalityRatePct.toFixed(1)}%`}
            tone={score.metrics.mortalityRatePct < 5 ? 'good' : score.metrics.mortalityRatePct < 15 ? undefined : 'bad'}
          />
        </dl>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-6">
        <Tip
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          title="What's already strong"
          items={score.components.filter((c) => c.score / c.maxScore >= 0.8).map((c) => c.label)}
          emptyMsg="Build up more components to see strengths."
        />
        <Tip
          icon={<AlertCircle className="w-4 h-4 text-amber-600" />}
          title="Where to improve"
          items={score.components
            .filter((c) => c.score / c.maxScore < 0.6)
            .map((c) => `${c.label} — ${c.detail}`)}
          emptyMsg="No weak areas. Keep going."
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-medium mb-1">How banks use this</div>
          <p className="text-blue-800">
            Smallholder farmers in Africa rarely qualify for loans because they lack a formal credit history. This
            report turns your day-to-day record-keeping into evidence: regular logging proves operational discipline,
            stable production proves capability, and financial logging proves cash-flow visibility. Submit alongside
            your bank's standard application.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  const c = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums mt-0.5 ${c}`}>{value}</dd>
    </div>
  );
}

function Tip({
  icon,
  title,
  items,
  emptyMsg,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  emptyMsg: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 font-medium text-gray-900 mb-2">
        {icon}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMsg}</p>
      ) : (
        <ul className="space-y-1 text-sm text-gray-700">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CreditScorePage;
