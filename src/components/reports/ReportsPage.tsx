import { useState } from 'react';
import { FileText, Download, FileSpreadsheet, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../lib/supabaseClient';
import { assembleFarmReport, type FarmReportData } from '../../utils/farmReportAssembler';
import { downloadFarmReportPDF } from '../../utils/farmReportPDF';
import { downloadFarmReportCSVs, downloadFarmReportMarkdown } from '../../utils/farmReportExports';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { formatFarmReportMarkdown } from '../../utils/farmReportExports';
import { getCurrencySymbol } from '../../utils/currency';

/**
 * Reports & Exports page — Phase G.
 *
 * Three buttons, in increasing formality order:
 *   1. WhatsApp share — quick markdown summary, copy-paste ready
 *   2. CSV exports — multiple files for analyst review or Excel import
 *   3. PDF — formal report for bank / co-op / grant submission
 *
 * Date range defaults: this calendar month. User can pick last quarter
 * or YTD with one click.
 */

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function startOfQuarter(): string {
  const d = new Date();
  const m = d.getMonth();
  const qStartMonth = m - (m % 3);
  return `${d.getFullYear()}-${String(qStartMonth + 1).padStart(2, '0')}-01`;
}

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function ReportsPage() {
  const { currentFarm } = useAuth();
  const farmSpecies = useFarmSpecies();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();

  const [startDate, setStartDate] = useState<string>(startOfMonth());
  const [endDate, setEndDate] = useState<string>(todayLocal());
  const [data, setData] = useState<FarmReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | 'whatsapp' | 'md' | null>(null);

  const handleAssemble = async () => {
    if (!currentFarm?.id) return;
    if (startDate > endDate) {
      toast.error('Start date must be on or before end date');
      return;
    }
    setLoading(true);
    try {
      const result = await assembleFarmReport({
        farmId: currentFarm.id,
        startDate,
        endDate,
        supabase,
      });
      setData(result);
    } catch (err: any) {
      console.error('Report assembly failed', err);
      toast.error(err?.message || 'Failed to assemble report data');
    } finally {
      setLoading(false);
    }
  };

  const handlePdf = async () => {
    if (!data) return;
    setExporting('pdf');
    try {
      await downloadFarmReportPDF(data);
      toast.success('PDF downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'PDF generation failed');
    } finally {
      setExporting(null);
    }
  };

  const handleCsv = () => {
    if (!data) return;
    setExporting('csv');
    try {
      downloadFarmReportCSVs(data);
      toast.success('CSV files downloaded');
    } catch (err: any) {
      toast.error(err?.message || 'CSV export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleMd = () => {
    if (!data) return;
    setExporting('md');
    try {
      downloadFarmReportMarkdown(data);
      toast.success('Markdown report downloaded');
    } finally {
      setExporting(null);
    }
  };

  const handleWhatsApp = () => {
    if (!data) return;
    setExporting('whatsapp');
    try {
      const md = formatFarmReportMarkdown(data);
      shareViaWhatsApp(md.slice(0, 4000));
    } catch (err: any) {
      toast.error(err?.message || 'WhatsApp share failed');
    } finally {
      setExporting(null);
    }
  };

  const useQuickRange = (start: string, end: string, label: string) => {
    setStartDate(start);
    setEndDate(end);
    toast.info(`Range set to ${label}. Click "Generate report" to refresh.`);
    setData(null);
  };

  const fmt = (n: number) => Math.round(n).toLocaleString();

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Rapports & exports de la ferme' : 'Farm reports & exports'}</h1>
          <p className="text-sm text-gray-500">
            {isFr
              ? 'Générez un PDF imprimable pour la soumission à une banque ou une coopérative, des fichiers CSV pour les analystes, ou un résumé WhatsApp en un seul message.'
              : 'Generate a printable PDF for bank or co-op submission, CSV files for analyst review, or a one-message WhatsApp summary.'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{isFr ? 'Plage de dates' : 'Date range'}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => useQuickRange(startOfMonth(), todayLocal(), 'this month')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {isFr ? 'Ce mois' : 'This month'}
          </button>
          <button
            type="button"
            onClick={() => useQuickRange(startOfQuarter(), todayLocal(), 'this quarter')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {isFr ? 'Ce trimestre' : 'This quarter'}
          </button>
          <button
            type="button"
            onClick={() => useQuickRange(startOfYear(), todayLocal(), 'year-to-date')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            {isFr ? "Cumul de l'année" : 'Year-to-date'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de début' : 'Start date'}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setData(null); }}
              max={endDate}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de fin' : 'End date'}</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setData(null); }}
              min={startDate}
              max={todayLocal()}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleAssemble}
          disabled={loading || !currentFarm?.id}
          className="px-4 py-2 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          {loading ? (isFr ? 'Assemblage…' : 'Assembling…') : (isFr ? 'Générer le rapport' : 'Generate report')}
        </button>
      </div>

      {data && (
        <>
          {/* In-app preview uses the human currency symbol ("CFA") to match
              the rest of the UI. The exported PDF/CSV still carries the
              ISO code for downstream consumers (banks, accounting). */}
          {(() => {
            const previewLabel = getCurrencySymbol(data.currency);
            return (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{isFr ? 'Aperçu' : 'Preview'}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><div className="text-xs text-gray-500">{isFr ? 'Groupes actifs' : 'Active groups'}</div><div className="font-bold text-gray-900">{data.totalFlocks}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Animaux actifs' : 'Active animals'}</div><div className="font-bold text-gray-900">{fmt(data.totalActiveAnimals)}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Revenus' : 'Revenue'}</div><div className="font-bold text-gray-900">{fmt(data.totalRevenue)} {previewLabel}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Dépenses' : 'Expenses'}</div><div className="font-bold text-gray-900">{fmt(data.totalExpenses)} {previewLabel}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Bénéfice net' : 'Net profit'}</div><div className={`font-bold ${data.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{data.netProfit >= 0 ? '+' : ''}{fmt(data.netProfit)} {previewLabel}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Marge' : 'Margin'}</div><div className="font-bold text-gray-900">{data.marginPercent.toFixed(1)}%</div></div>
              <div><div className="text-xs text-gray-500">{farmSpecies.lossNounPlural}</div><div className="font-bold text-gray-900">{data.totalMortality}</div></div>
              <div><div className="text-xs text-gray-500">{isFr ? 'Aliment utilisé' : 'Feed used'}</div><div className="font-bold text-gray-900">{fmt(data.totalFeedKg)} kg</div></div>
            </div>
          </div>
            );
          })()}

          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">{isFr ? 'Exporter' : 'Export'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handlePdf}
                disabled={exporting !== null}
                className="px-4 py-3 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-2 justify-center"
              >
                <Download className="w-4 h-4" />
                {exporting === 'pdf' ? (isFr ? 'Génération du PDF…' : 'Generating PDF…') : (isFr ? 'Télécharger le PDF (officiel)' : 'Download PDF (formal)')}
              </button>
              <button
                type="button"
                onClick={handleCsv}
                disabled={exporting !== null}
                className="px-4 py-3 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2 justify-center"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting === 'csv' ? (isFr ? 'Export en cours…' : 'Exporting…') : (isFr ? 'Télécharger les CSV (analyste)' : 'Download CSVs (analyst)')}
              </button>
              <button
                type="button"
                onClick={handleMd}
                disabled={exporting !== null}
                className="px-4 py-3 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-60 inline-flex items-center gap-2 justify-center"
              >
                <FileText className="w-4 h-4" />
                {exporting === 'md' ? (isFr ? 'Enregistrement…' : 'Saving…') : 'Markdown (.md)'}
              </button>
              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={exporting !== null}
                className="px-4 py-3 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2 justify-center"
              >
                <MessageCircle className="w-4 h-4" />
                {isFr ? 'Partager via WhatsApp' : 'Share via WhatsApp'}
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              {isFr
                ? "Le PDF est la version officielle — prête pour soumission bancaire. Les fichiers CSV s'importent proprement dans Excel et Google Sheets pour analyse. Markdown est un résumé texte adapté à un e-mail ou au chat."
                : 'The PDF is the formal version — bank-submission ready. CSV files import cleanly into Excel and Google Sheets for further analysis. Markdown is a text-only summary suitable for email or pasting into chat.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
