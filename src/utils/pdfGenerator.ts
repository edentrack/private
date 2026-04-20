/**
 * PDF Report Generator
 * Creates detailed PDF reports with professional formatting
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './currency';
import { formatEggsWithTotal } from './eggFormatting';

interface PDFReportData {
  farmName: string;
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate: string;
  endDate: string;
  flocks?: any[];
  expenses?: any[];
  sales?: any[];
  eggSales?: any[];
  eggCollections?: any[];
  mortalityLogs?: any[];
  tasks?: any[];
  inventory?: any[];
  eggInventory?: any;
  stats?: {
    totalRevenue?: number;
    totalExpenses?: number;
    netProfit?: number;
    totalBirds?: number;
    activeFlocks?: number;
    eggsCollected?: number;
    eggsSold?: number;
    mortalityCount?: number;
  };
}

/**
 * Generate comprehensive PDF report
 */
export function generatePDFReport(data: PDFReportData, currencyCode: string = 'XAF'): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPosition = margin;

  // Colors
  const primaryColor = [75, 61, 36]; // agri-brown
  const accentColor = [255, 221, 0]; // neon
  const lightGray = [245, 245, 245];

  // Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('EDENTRACK', margin, 20);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Farm Management Report', margin, 28);

  yPosition = 45;

  // Report Title Section
  doc.setTextColor(...primaryColor);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.reportType.toUpperCase()} FARM REPORT`, margin, yPosition);
  
  yPosition += 10;

  // Farm Info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Farm: ${data.farmName}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Period: ${formatDate(data.startDate)} - ${formatDate(data.endDate)}`, margin, yPosition);
  yPosition += 6;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
  
  yPosition += 12;

  // Summary Stats (if available)
  if (data.stats) {
    doc.setFillColor(...lightGray);
    doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 40, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('SUMMARY', margin + 5, yPosition);
    
    yPosition += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const stats = data.stats;
    const col1 = margin + 5;
    const col2 = pageWidth / 2 + 10;
    
    if (stats.totalRevenue !== undefined) {
      doc.text(`Total Revenue: ${formatCurrency(stats.totalRevenue, currencyCode)}`, col1, yPosition);
    }
    if (stats.totalExpenses !== undefined) {
      doc.text(`Total Expenses: ${formatCurrency(stats.totalExpenses, currencyCode)}`, col2, yPosition);
    }
    yPosition += 6;
    
    if (stats.netProfit !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(stats.netProfit >= 0 ? 0 : 255, stats.netProfit >= 0 ? 150 : 0, 0);
      doc.text(`Net Profit: ${formatCurrency(stats.netProfit, currencyCode)}`, col1, yPosition);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
    }
    if (stats.totalBirds !== undefined) {
      doc.text(`Total Birds: ${stats.totalBirds.toLocaleString()}`, col2, yPosition);
    }
    yPosition += 6;
    
    if (stats.activeFlocks !== undefined) {
      doc.text(`Active Flocks: ${stats.activeFlocks}`, col1, yPosition);
    }
    if (stats.eggsCollected !== undefined) {
      doc.text(`Eggs Collected: ${stats.eggsCollected.toLocaleString()}`, col2, yPosition);
    }
    
    yPosition += 15;
  }

  // Flocks Section
  if (data.flocks && data.flocks.length > 0) {
    yPosition = addSectionHeader(doc, 'FLOCK SUMMARY', margin, yPosition, primaryColor, pageWidth);
    
    const flockData = data.flocks.map(flock => {
      const ageInDays = Math.floor(
        (new Date().getTime() - new Date(flock.arrival_date).getTime()) / (24 * 60 * 60 * 1000)
      );
      const ageInWeeks = Math.floor(ageInDays / 7) + 1;
      
      return [
        flock.name,
        flock.type || 'N/A',
        flock.current_count?.toLocaleString() || '0',
        flock.initial_count?.toLocaleString() || '0',
        `${ageInWeeks} weeks`,
        flock.status || 'active',
      ];
    });

    autoTable(doc, {
      startY: yPosition,
      head: [['Flock Name', 'Type', 'Current', 'Initial', 'Age', 'Status']],
      body: flockData,
      margin: { left: margin, right: margin },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightGray },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // Financial Summary
  if (data.expenses && data.expenses.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, pageHeight, margin);
    yPosition = addSectionHeader(doc, 'EXPENSES', margin, yPosition, primaryColor, pageWidth);
    
    const expensesByCategory = data.expenses.reduce((acc: Record<string, number>, exp: any) => {
      const cat = exp.category || 'Other';
      acc[cat] = (acc[cat] || 0) + (exp.amount || 0);
      return acc;
    }, {});

    const expenseData = Object.entries(expensesByCategory).map(([category, amount]) => [
      category,
      formatCurrency(amount as number, currencyCode),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Category', 'Total Amount']],
      body: expenseData,
      margin: { left: margin, right: margin },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightGray },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // Sales Summary
  if ((data.sales && data.sales.length > 0) || (data.eggSales && data.eggSales.length > 0)) {
    yPosition = checkPageBreak(doc, yPosition, pageHeight, margin);
    yPosition = addSectionHeader(doc, 'SALES', margin, yPosition, primaryColor, pageWidth);
    
    const salesData: any[] = [];
    
    if (data.sales && data.sales.length > 0) {
      data.sales.forEach((sale: any) => {
        salesData.push([
          formatDate(sale.sale_date || sale.date),
          'Birds',
          sale.quantity?.toLocaleString() || '0',
          formatCurrency(sale.total_amount || 0, currencyCode),
        ]);
      });
    }
    
    if (data.eggSales && data.eggSales.length > 0) {
      data.eggSales.forEach((sale: any) => {
        const totalEggs = (sale.small_eggs_sold || 0) + (sale.medium_eggs_sold || 0) +
                         (sale.large_eggs_sold || 0) + (sale.jumbo_eggs_sold || 0);
        salesData.push([
          formatDate(sale.sale_date || sale.date),
          'Eggs',
          totalEggs.toLocaleString(),
          formatCurrency(sale.total_amount || 0, currencyCode),
        ]);
      });
    }

    if (salesData.length > 0) {
      autoTable(doc, {
        startY: yPosition,
        head: [['Date', 'Type', 'Quantity', 'Amount']],
        body: salesData,
        margin: { left: margin, right: margin },
        headStyles: { 
          fillColor: primaryColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
        },
        styles: { fontSize: 9 },
        alternateRowStyles: { fillColor: lightGray },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // Mortality Summary
  if (data.mortalityLogs && data.mortalityLogs.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, pageHeight, margin);
    yPosition = addSectionHeader(doc, 'MORTALITY LOG', margin, yPosition, primaryColor, pageWidth);
    
    const mortalityData = data.mortalityLogs.map((log: any) => [
      formatDate(log.date || log.event_date),
      log.flocks?.name || 'N/A',
      log.count?.toLocaleString() || '0',
      log.cause || 'Unknown',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Date', 'Flock', 'Count', 'Cause']],
      body: mortalityData,
      margin: { left: margin, right: margin },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightGray },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // Tasks Summary
  if (data.tasks && data.tasks.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, pageHeight, margin);
    yPosition = addSectionHeader(doc, 'TASKS', margin, yPosition, primaryColor, pageWidth);
    
    const completed = data.tasks.filter((t: any) => t.status === 'completed').length;
    const pending = data.tasks.filter((t: any) => t.status === 'pending').length;
    
    const taskData = [
      ['Completed', completed.toString(), `${Math.round((completed / data.tasks.length) * 100)}%`],
      ['Pending', pending.toString(), `${Math.round((pending / data.tasks.length) * 100)}%`],
      ['Total', data.tasks.length.toString(), '100%'],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [['Status', 'Count', 'Percentage']],
      body: taskData,
      margin: { left: margin, right: margin },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightGray },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // Inventory Summary
  if (data.inventory && data.inventory.length > 0) {
    yPosition = checkPageBreak(doc, yPosition, pageHeight, margin);
    yPosition = addSectionHeader(doc, 'INVENTORY STATUS', margin, yPosition, primaryColor, pageWidth);
    
    const inventoryData = data.inventory.map((item: any) => [
      item.feed_type || item.item_name || 'N/A',
      (item.current_quantity || item.bags_in_stock || 0).toLocaleString(),
      item.unit || 'bags',
      item.minimum_quantity ? 
        ((item.current_quantity || item.bags_in_stock || 0) <= item.minimum_quantity ? 'Low' : 'OK') 
        : 'N/A',
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Item', 'Quantity', 'Unit', 'Status']],
      body: inventoryData,
      margin: { left: margin, right: margin },
      headStyles: { 
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: { fontSize: 9 },
      alternateRowStyles: { fillColor: lightGray },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${totalPages} | Powered by EDENTRACK`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Add section header
 */
function addSectionHeader(
  doc: jsPDF,
  title: string,
  margin: number,
  yPosition: number,
  color: number[],
  pageWidth: number
): number {
  doc.setFillColor(...color);
  doc.rect(margin, yPosition - 3, pageWidth - 2 * margin, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin + 3, yPosition + 4);
  
  return yPosition + 12;
}

/**
 * Check if we need a new page
 */
function checkPageBreak(doc: jsPDF, yPosition: number, pageHeight: number, margin: number): number {
  if (yPosition > pageHeight - 40) {
    doc.addPage();
    return margin + 20;
  }
  return yPosition;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateString;
  }
}

/**
 * Download PDF report
 */
export function downloadPDFReport(data: PDFReportData, filename: string, currencyCode: string = 'XAF'): void {
  const doc = generatePDFReport(data, currencyCode);
  doc.save(filename || `edentrack-report-${Date.now()}.pdf`);
}
