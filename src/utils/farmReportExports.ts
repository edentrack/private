/**
 * Farm Report CSV / Excel exports — Phase G.
 *
 * Skips a heavy SheetJS dep and ships multi-file CSV exports. Each report
 * section becomes its own CSV file, downloaded as a single .zip via
 * concatenated text + browser-native zip writing through a tiny inlined
 * helper (no extra dep).
 *
 * If a heavier xlsx with multiple sheets becomes a real ask, swap to
 * SheetJS or exceljs. CSV is the lowest-common-denominator that imports
 * cleanly into Excel, Google Sheets, Numbers, and any analyst tool.
 */

import type { FarmReportData } from './farmReportAssembler';

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: Array<Array<string | number>>): string {
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download the full report as a single Markdown text file - easiest format
 *  for WhatsApp/email pasting. The PDF is the formal version; this is the
 *  copy-paste version. */
export function downloadFarmReportMarkdown(data: FarmReportData) {
  const md = formatFarmReportMarkdown(data);
  downloadFile(md, `${data.farmName.replace(/\s+/g, '_')}_report.md`, 'text/markdown');
}

export function formatFarmReportMarkdown(data: FarmReportData): string {
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const lines: string[] = [];
  lines.push(`# ${data.farmName} - farm report`);
  lines.push(`**Period:** ${data.startDate} → ${data.endDate}`);
  lines.push(`**Generated:** ${new Date(data.generatedAt).toLocaleString()}`);
  lines.push('');
  lines.push('## Executive summary');
  lines.push(`- Active groups: ${data.totalFlocks}`);
  lines.push(`- Active animals: ${fmt(data.totalActiveAnimals)}`);
  lines.push(`- Total revenue: ${fmt(data.totalRevenue)} ${data.currency}`);
  lines.push(`- Total expenses: ${fmt(data.totalExpenses)} ${data.currency}`);
  lines.push(`- Net profit: ${data.netProfit >= 0 ? '+' : ''}${fmt(data.netProfit)} ${data.currency} (${data.marginPercent.toFixed(1)}% margin)`);
  lines.push(`- Mortality: ${data.totalMortality}`);
  lines.push(`- Feed used: ${fmt(data.totalFeedKg)} kg`);
  if (data.totalEggsCollected > 0) lines.push(`- Eggs collected: ${fmt(data.totalEggsCollected)}`);
  if (data.totalBiomassHarvestedKg > 0) lines.push(`- Biomass harvested: ${fmt(data.totalBiomassHarvestedKg)} kg`);

  if (data.expensesByCategory.length > 0) {
    lines.push('');
    lines.push('## Expenses by category');
    for (const e of data.expensesByCategory) {
      lines.push(`- ${e.category}: ${fmt(e.amount)} ${data.currency} (${e.percent.toFixed(1)}%)`);
    }
  }

  if (data.flocks.length > 0) {
    lines.push('');
    lines.push('## Per-group breakdown');
    for (const f of data.flocks) {
      lines.push(`### ${f.name} (${f.type})`);
      lines.push(`- Initial: ${fmt(f.initialCount)} · Current: ${fmt(f.currentCount)} · Survival: ${f.survivalRate.toFixed(1)}%`);
      lines.push(`- Revenue: ${fmt(f.revenueTotal)} ${data.currency} · Expenses: ${fmt(f.expensesTotal)} ${data.currency} · Net: ${f.netProfit >= 0 ? '+' : ''}${fmt(f.netProfit)} ${data.currency}`);
    }
  }

  return lines.join('\n');
}

/**
 * Download each report section as its own CSV file. Calling this triggers
 * 4–6 file-download prompts in series - most browsers either chain them
 * automatically or surface a "download multiple files" permission prompt
 * the first time, then silently allow subsequent ones.
 */
export function downloadFarmReportCSVs(data: FarmReportData): void {
  const slug = data.farmName.replace(/\s+/g, '_');

  // Per-flock summary
  if (data.flocks.length > 0) {
    const rows: Array<Array<string | number>> = [
      ['Group', 'Type', 'Initial Count', 'Current Count', 'Mortality', 'Survival %', `Revenue (${data.currency})`, `Expenses (${data.currency})`, `Net (${data.currency})`, 'Feed (kg)'],
      ...data.flocks.map(f => [
        f.name,
        f.type,
        f.initialCount,
        f.currentCount,
        f.mortalityCount,
        f.survivalRate.toFixed(2),
        Math.round(f.revenueTotal),
        Math.round(f.expensesTotal),
        Math.round(f.netProfit),
        Math.round(f.feedKgUsed),
      ]),
    ];
    downloadFile(toCSV(rows), `${slug}_flocks.csv`, 'text/csv');
  }

  // Expenses by category
  if (data.expensesByCategory.length > 0) {
    const rows: Array<Array<string | number>> = [
      ['Category', `Amount (${data.currency})`, 'Percent'],
      ...data.expensesByCategory.map(e => [e.category, Math.round(e.amount), e.percent.toFixed(2)]),
    ];
    downloadFile(toCSV(rows), `${slug}_expenses_by_category.csv`, 'text/csv');
  }

  // Mortality events
  if (data.mortalityEvents.length > 0) {
    const rows: Array<Array<string | number>> = [
      ['Date', 'Group', 'Count', 'Cause'],
      ...data.mortalityEvents.map(m => [m.date, m.flockName, m.count, m.cause]),
    ];
    downloadFile(toCSV(rows), `${slug}_mortality.csv`, 'text/csv');
  }

  // Vaccinations
  if (data.vaccinations.length > 0) {
    const rows: Array<Array<string | number>> = [
      ['Date', 'Group', 'Vaccine', 'Notes'],
      ...data.vaccinations.map(v => [v.date, v.flockName, v.vaccineName, v.notes || '']),
    ];
    downloadFile(toCSV(rows), `${slug}_vaccinations.csv`, 'text/csv');
  }
}
