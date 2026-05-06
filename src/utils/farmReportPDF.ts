/**
 * Farm Report PDF — Phase G.
 *
 * Renders the FarmReportData shape (from farmReportAssembler.ts) into a
 * print-ready PDF for bank / co-op / grant submission. Uses jsPDF +
 * jspdf-autotable, both already deps.
 *
 * Layout target: A4 portrait, 6–8 pages. Sections in this order so the
 * first page is the executive summary (the only page most lenders read):
 *   1. Header + farm name + period
 *   2. Top KPIs
 *   3. Expenses by category
 *   4. Revenue by source
 *   5. Per-flock summary
 *   6. Mortality log
 *   7. Vaccinations completed
 *   8. Footer with generated-at timestamp
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FarmReportData } from './farmReportAssembler';

const TONE_GREEN: [number, number, number] = [61, 95, 66];
const TONE_GRAY: [number, number, number] = [110, 110, 110];

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatDate(s: string): string {
  const parts = s.split(/[-T]/);
  if (parts.length < 3) return s;
  return new Date(+parts[0], +parts[1] - 1, +parts[2]).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export async function generateFarmReportPDF(data: FarmReportData): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ─── Header ──────────────────────────────────────────────────────────
  doc.setFillColor(...TONE_GREEN);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Farm Report', margin, 12);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(data.farmName, margin, 19);
  doc.setFontSize(9);
  doc.text(
    `${data.farmType.charAt(0).toUpperCase() + data.farmType.slice(1)} · ${data.country} · ${data.currency}`,
    margin,
    24,
  );
  doc.text(
    `Period: ${formatDate(data.startDate)} → ${formatDate(data.endDate)}`,
    pageWidth - margin,
    24,
    { align: 'right' },
  );

  doc.setTextColor(0);
  y = 38;

  // ─── Top KPIs ────────────────────────────────────────────────────────
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive summary', margin, y);
  y += 7;

  const kpis: Array<[string, string]> = [
    ['Active groups', `${data.totalFlocks}`],
    ['Active animals', formatNumber(data.totalActiveAnimals)],
    ['Total revenue', `${formatNumber(data.totalRevenue)} ${data.currency}`],
    ['Total expenses', `${formatNumber(data.totalExpenses)} ${data.currency}`],
    ['Net profit', `${data.netProfit >= 0 ? '+' : ''}${formatNumber(data.netProfit)} ${data.currency}`],
    ['Margin', `${data.marginPercent.toFixed(1)}%`],
    ['Total mortality', `${data.totalMortality}`],
    ['Total feed used', `${formatNumber(data.totalFeedKg)} kg`],
  ];

  if (data.totalEggsCollected > 0) kpis.push(['Eggs collected', formatNumber(data.totalEggsCollected)]);
  if (data.totalEggsSold > 0) kpis.push(['Eggs sold', formatNumber(data.totalEggsSold)]);
  if (data.totalBiomassHarvestedKg > 0) kpis.push(['Biomass harvested', `${formatNumber(data.totalBiomassHarvestedKg)} kg`]);

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: kpis,
    theme: 'grid',
    headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });
  y = (doc as any).lastAutoTable?.finalY + 10 || y + 80;

  // ─── Expenses by category ────────────────────────────────────────────
  if (data.expensesByCategory.length > 0) {
    if (y > 230) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Expenses by category', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Category', `Amount (${data.currency})`, '%']],
      body: data.expensesByCategory.map(e => [
        e.category,
        formatNumber(e.amount),
        `${e.percent.toFixed(1)}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 60;
  }

  // ─── Revenue by source ───────────────────────────────────────────────
  if (data.revenueBySource.length > 0) {
    if (y > 230) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Revenue by source', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Source', `Amount (${data.currency})`, '%']],
      body: data.revenueBySource.map(r => [r.source, formatNumber(r.amount), `${r.percent.toFixed(1)}%`]),
      theme: 'striped',
      headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 50;
  }

  // ─── Per-flock summary ───────────────────────────────────────────────
  if (data.flocks.length > 0) {
    if (y > 230) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Per-group breakdown', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Group', 'Type', 'Initial', 'Current', 'Survival %', `Net (${data.currency})`]],
      body: data.flocks.map(f => [
        f.name,
        f.type,
        formatNumber(f.initialCount),
        formatNumber(f.currentCount),
        `${f.survivalRate.toFixed(1)}%`,
        `${f.netProfit >= 0 ? '+' : ''}${formatNumber(f.netProfit)}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 70;
  }

  // ─── Mortality log ───────────────────────────────────────────────────
  if (data.mortalityEvents.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Mortality log', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Group', 'Count', 'Cause']],
      body: data.mortalityEvents.slice(0, 50).map(m => [
        formatDate(m.date),
        m.flockName,
        `${m.count}`,
        m.cause,
      ]),
      theme: 'striped',
      headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 80;
    if (data.mortalityEvents.length > 50) {
      doc.setFontSize(8);
      doc.setTextColor(...TONE_GRAY);
      doc.text(`... and ${data.mortalityEvents.length - 50} more events.`, margin, y);
      doc.setTextColor(0);
      y += 6;
    }
  }

  // ─── Vaccinations ────────────────────────────────────────────────────
  if (data.vaccinations.length > 0) {
    if (y > 220) { doc.addPage(); y = margin; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Vaccinations administered', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Group', 'Vaccine', 'Notes']],
      body: data.vaccinations.slice(0, 50).map(v => [
        formatDate(v.date),
        v.flockName,
        v.vaccineName,
        v.notes || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: TONE_GREEN, textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable?.finalY + 8 || y + 80;
  }

  // ─── Footer on every page ────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...TONE_GRAY);
    const footer = `Generated by EdenTrack on ${new Date(data.generatedAt).toLocaleString()} · Page ${i} of ${totalPages}`;
    doc.text(footer, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
  }

  return doc.output('blob');
}

export async function downloadFarmReportPDF(data: FarmReportData): Promise<void> {
  const blob = await generateFarmReportPDF(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateRange = `${data.startDate}_to_${data.endDate}`;
  a.href = url;
  a.download = `${data.farmName.replace(/\s+/g, '_')}_report_${dateRange}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
