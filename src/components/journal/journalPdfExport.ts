import type jsPDFType from 'jspdf';

/**
 * Journal → PDF export.
 *
 * Generates a printable summary of the farm journal for the requested
 * range (this week or this month). Pure jsPDF — no autotable, no
 * chart rendering. Body is paragraph-style so the PDF feels like a
 * carbon copy of the on-screen journal page (cream-paper UI not
 * carried over; black-on-white reads better on print).
 *
 * Why a separate file: keeps jsPDF behind a dynamic import so the
 * pdf chunk (~400KB) only loads when the user actually clicks
 * Export. Without this, every visit to /journal would pay the
 * jsPDF cost upfront.
 */

interface ExportEntry {
  id: string;
  channel: 'activity' | 'notes';
  entry_type: string;
  title: string | null;
  body: string;
  is_pinned: boolean;
  is_important: boolean;
  author_kind: 'user' | 'eden' | 'system';
  authorName: string;
  author_role: string | null;
  created_at: string;
  photo_urls: string[];
}

interface ExportArgs {
  farmName: string;
  entries: ExportEntry[];
  range: 'week' | 'month';
}

const TYPE_LABEL: Record<string, string> = {
  observation: 'Observation', financial: 'Financial', milestone: 'Milestone',
  personal: 'Personal', health: 'Health', auto_summary: 'Eden summary',
  sale_logged: 'Sale', expense_logged: 'Expense', feed_logged: 'Feed',
  mortality_logged: 'Mortality', vaccine_logged: 'Vaccine',
  flock_created: 'Flock created', flock_archived: 'Flock archived',
  task_completed: 'Task done', egg_collected: 'Eggs',
  payment_received: 'Payment', team_member_added: 'Team',
  inventory_added: 'Inventory', withdrawal_cleared: 'Withdrawal clear',
  weight_logged: 'Weight', other: 'Other',
};

function rangeBounds(range: 'week' | 'month'): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') {
    start.setDate(start.getDate() - 6);
    return {
      start,
      end,
      label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
    };
  }
  start.setDate(1);
  return {
    start,
    end,
    label: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  };
}

/**
 * Render the journal PDF and trigger a save. Returns when the save
 * dialog has been shown — caller can flip its loading flag.
 */
export async function exportJournalToPdf(args: ExportArgs): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { start, end, label } = rangeBounds(args.range);

  const inRange = args.entries.filter(e => {
    const t = new Date(e.created_at);
    return t >= start && t <= end;
  });

  if (inRange.length === 0) {
    throw new Error('No journal entries in this range');
  }

  // Group by day so the PDF reads like the on-screen journal — date
  // header followed by entries.
  const buckets: Record<string, ExportEntry[]> = {};
  for (const e of inRange) {
    const day = new Date(e.created_at).toLocaleDateString('en-CA');
    (buckets[day] = buckets[day] ?? []).push(e);
  }
  const days = Object.entries(buckets).sort(([a], [b]) => (a < b ? 1 : -1));

  const doc: jsPDFType = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Cover header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(40);
  doc.text(`${args.farmName} — Journal`, margin, y);
  y += 22;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(110);
  doc.text(`${label} · ${inRange.length} entr${inRange.length === 1 ? 'y' : 'ies'}`, margin, y);
  y += 16;
  doc.setDrawColor(180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  /**
   * Add a wrapped text block with auto page-break. Returns the new y.
   */
  const writeWrapped = (
    text: string,
    opts: { font?: 'normal' | 'bold' | 'italic'; size?: number; color?: number; indent?: number; gap?: number } = {},
  ): void => {
    const font = opts.font ?? 'normal';
    const size = opts.size ?? 10;
    const color = opts.color ?? 40;
    const indent = opts.indent ?? 0;
    const gap = opts.gap ?? 2;
    doc.setFont('helvetica', font);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const wrapWidth = contentWidth - indent;
    const lines = doc.splitTextToSize(text, wrapWidth) as string[];
    for (const ln of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin + indent, y);
      y += size + gap;
    }
  };

  for (const [day, dayEntries] of days) {
    if (y > pageHeight - margin - 60) {
      doc.addPage();
      y = margin;
    }
    // Date header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(60);
    const dayLabel = new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    doc.text(dayLabel, margin, y);
    y += 16;

    for (const e of dayEntries) {
      const time = new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const flags: string[] = [];
      if (e.is_pinned) flags.push('📎');
      if (e.is_important) flags.push('★');

      const byline = `${time}  ${e.authorName}${e.author_role && e.author_kind !== 'eden' ? ` (${e.author_role})` : ''}${e.author_kind === 'eden' ? ' ✨' : ''}  ·  ${TYPE_LABEL[e.entry_type] ?? e.entry_type}${flags.length ? '  ' + flags.join(' ') : ''}`;

      writeWrapped(byline, { font: 'italic', size: 9, color: 110, indent: 4 });
      if (e.title) {
        writeWrapped(e.title, { font: 'bold', size: 11, color: 30, indent: 4 });
      }
      writeWrapped(e.body, { size: 10, color: 30, indent: 4, gap: 3 });
      if (e.photo_urls.length > 0) {
        writeWrapped(`(${e.photo_urls.length} photo${e.photo_urls.length === 1 ? '' : 's'} on file)`, { font: 'italic', size: 9, color: 130, indent: 4 });
      }
      y += 8;
    }
    y += 6;
  }

  // Footer on the last page
  if (y > pageHeight - margin - 20) {
    doc.addPage();
    y = margin;
  }
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    `Generated by Edentrack · ${new Date().toLocaleDateString()} · edentrack.app`,
    margin,
    pageHeight - 24,
  );

  const filename = `journal-${args.range}-${start.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
