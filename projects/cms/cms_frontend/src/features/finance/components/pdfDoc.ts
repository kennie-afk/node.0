/**
 * A small A4 document builder over jsPDF for the finance papers people hand over or file
 * (payslips, statements). jsPDF is imported only when a PDF is asked for, so it costs the console
 * nothing the rest of the time. Text and amounts are laid out by hand rather than screenshotting
 * the page, which keeps the file small, selectable and identical on every browser.
 */
export interface PdfSection {
  heading?: string;
  /** Label / value pairs, label on the left, value right-aligned. */
  rows?: Array<[string, string]>;
  /** A bolder closing line under the rows, e.g. "Net pay". */
  total?: [string, string];
  note?: string;
}

export interface PdfDoc {
  filename: string;
  /** Who issues it, printed at the top. */
  org: string;
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  footer?: string;
}

const MARGIN = 16;
const LINE = 6;

export async function downloadPdf(doc: PdfDoc): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const right = width - MARGIN;
  let y = MARGIN + 4;

  const ensure = (needed: number) => {
    if (y + needed > height - MARGIN) {
      pdf.addPage();
      y = MARGIN + 4;
    }
  };

  pdf.setFont('helvetica', 'bold').setFontSize(15).text(doc.org, MARGIN, y);
  y += 7;
  pdf.setFont('helvetica', 'normal').setFontSize(11).setTextColor(90).text(doc.title, MARGIN, y);
  if (doc.subtitle) pdf.text(doc.subtitle, right, y, { align: 'right' });
  pdf.setTextColor(0).setDrawColor(190).line(MARGIN, y + 3, right, y + 3);
  y += 11;

  for (const section of doc.sections) {
    ensure(LINE * 2);
    if (section.heading) {
      pdf.setFont('helvetica', 'bold').setFontSize(10).setTextColor(90).text(section.heading.toUpperCase(), MARGIN, y);
      pdf.setTextColor(0);
      y += LINE;
    }
    pdf.setFontSize(10);
    for (const [label, value] of section.rows ?? []) {
      ensure(LINE);
      pdf.setFont('helvetica', 'normal').text(label, MARGIN, y);
      pdf.text(value, right, y, { align: 'right' });
      y += LINE;
    }
    if (section.total) {
      ensure(LINE + 2);
      pdf.setDrawColor(190).line(MARGIN, y - 4, right, y - 4);
      pdf.setFont('helvetica', 'bold').text(section.total[0], MARGIN, y);
      pdf.text(section.total[1], right, y, { align: 'right' });
      y += LINE;
    }
    if (section.note) {
      ensure(LINE);
      pdf.setFont('helvetica', 'italic').setFontSize(9).setTextColor(110).text(section.note, MARGIN, y, { maxWidth: right - MARGIN });
      pdf.setTextColor(0);
      y += LINE;
    }
    y += 4;
  }

  if (doc.footer) {
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130).text(doc.footer, width / 2, height - 10, { align: 'center' });
  }
  pdf.save(doc.filename);
}
