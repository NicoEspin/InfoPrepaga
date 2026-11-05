import PDFDocument from 'pdfkit';
import { join } from 'node:path';
import { Snapshot, stageNames } from './report-calculation';

const money = (v: string | null) =>
  v === null
    ? 'No informada'
    : `$ ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`;
const cost = (v: string | null) => (v === null ? 'Sin datos' : money(v));
const date = (v: string) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(v));
export function reportPdf(id: string, s: Snapshot): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 42,
      bufferPages: true,
      info: {
        Title: s.name,
        Author: 'InfoPrepaga CRM',
        CreationDate: new Date(s.generatedAt),
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('Regular', join(__dirname, 'fonts', 'Geist-Regular.ttf'));
    doc.registerFont('Bold', join(__dirname, 'fonts', 'Geist-Bold.ttf'));
    const width = doc.page.width - 84;
    const room = (height: number) => {
      if (doc.y + height > doc.page.height - 60) doc.addPage();
    };
    const paragraph = (text: string, size = 10) => {
      doc.font('Regular').fontSize(size);
      const height = doc.heightOfString(text, { width });
      if (height < doc.page.height - 102) room(height + 8);
      doc.fillColor('#263b37').text(text, 42, doc.y, { width }).moveDown(0.5);
    };
    const heading = (text: string) => {
      room(150);
      doc
        .font('Bold')
        .fontSize(15)
        .fillColor('#15724e')
        .text(text, 42, doc.y, { width })
        .moveDown(0.5);
    };
    const table = (headers: string[], rows: string[][], widths: number[]) => {
      const draw = (values: string[], header: boolean) => {
        doc.font(header ? 'Bold' : 'Regular').fontSize(9);
        const height = Math.max(
          28,
          ...values.map(
            (v, i) => doc.heightOfString(v, { width: widths[i] - 12 }) + 14,
          ),
        );
        if (doc.y + height > doc.page.height - 60) {
          doc.addPage();
          if (!header) draw(headers, true);
        }
        doc.font(header ? 'Bold' : 'Regular').fontSize(9);
        const top = doc.y;
        let x = 42;
        values.forEach((v, i) => {
          doc
            .rect(x, top, widths[i], height)
            .fill(header ? '#e1eee7' : '#f7f9f8');
          doc
            .fillColor('#263b37')
            .text(v, x + 6, top + 7, { width: widths[i] - 12 });
          x += widths[i];
        });
        doc.y = top + height + 2;
      };
      room(100);
      draw(headers, true);
      rows.forEach((r) => draw(r, false));
      if (!rows.length) paragraph('Sin resultados para la selección.');
      doc.moveDown(0.5);
    };
    heading('InfoPrepaga | Reportes comerciales');
    heading(s.name);
    paragraph(`Reporte ${id} | Versión de cálculo ${s.calculationVersion}`);
    paragraph(
      `Generado por ${s.author.name} el ${date(s.generatedAt)}. Período: ${s.from} al ${s.to}.`,
    );
    paragraph(
      `Corte efectivo: ${date(s.cutoff)} (${s.timezone}). ${s.partial ? 'PARCIAL' : 'Período completo'}`,
    );
    paragraph(
      `Canales incluidos: ${s.sources.map((c) => c.name).join(', ') || 'Sin canales'}.`,
    );
    paragraph(
      `Responsables incluidos: ${s.responsibles.map((p) => p.name).join(', ') || 'Sin responsables'}.`,
    );
    heading('Resumen general');
    const m = s.summary;
    table(
      [
        'Ingresados',
        'Cierres período',
        'Cierres ingresados',
        'Conversión',
        'Inversión declarada',
      ],
      [
        [
          String(m.entered),
          String(m.periodClosures),
          String(m.cohortClosures),
          m.conversion === null ? 'Sin datos' : `${m.conversion}%`,
          `${money(m.investment)}${m.investmentPartial ? ' (parcial)' : ''}`,
        ],
      ],
      [120, 140, 140, 120, width - 520],
    );
    if (s.allResponsibles)
      paragraph(
        `Costo por lead: ${cost(m.cpl)}. Costo por cierre de los ingresados: ${cost(m.cpc)}.`,
      );
    const breakdown = (
      title: string,
      data: Snapshot['bySource'],
      costs: boolean,
      investment: boolean,
    ) => {
      heading(title);
      const headers = [
        'Nombre',
        'Ingresados',
        'Cierres período',
        'Cierres ingresados',
        'Conversión',
        ...(investment ? ['Inversión'] : []),
        ...(costs ? ['Costo/lead', 'Costo/cierre'] : []),
      ];
      const rest = (width - 170) / (headers.length - 1);
      table(
        headers,
        data.map((r) => [
          r.name,
          String(r.metrics.entered),
          String(r.metrics.periodClosures),
          String(r.metrics.cohortClosures),
          r.metrics.conversion === null
            ? 'Sin datos'
            : `${r.metrics.conversion}%`,
          ...(investment ? [money(r.metrics.investment)] : []),
          ...(costs ? [cost(r.metrics.cpl), cost(r.metrics.cpc)] : []),
        ]),
        [170, ...headers.slice(1).map(() => rest)],
      );
    };
    breakdown(
      'Comparación por canal · atribución según población',
      s.bySource,
      s.allResponsibles,
      true,
    );
    breakdown(
      'Responsables · ingreso para A / cierre para B',
      s.byResponsible,
      false,
      false,
    );
    heading('Distribución de los ingresados por etapa al corte');
    table(
      ['Población', ...Object.values(stageNames)],
      [
        [
          'Total',
          ...Object.keys(stageNames).map((k) => String(s.summary.stages[k])),
        ],
        ...s.bySource.map((r) => [
          `Canal: ${r.name}`,
          ...Object.keys(stageNames).map((k) => String(r.metrics.stages[k])),
        ]),
        ...s.byResponsible.map((r) => [
          `Responsable: ${r.name}`,
          ...Object.keys(stageNames).map((k) => String(r.metrics.stages[k])),
        ]),
      ],
      [170, ...Object.keys(stageNames).map(() => (width - 170) / 6)],
    );
    heading('Definiciones y advertencias');
    s.warnings.forEach((w) => paragraph(w));
    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 20;
      doc
        .font('Regular')
        .fontSize(8)
        .fillColor('#52635e')
        .text(
          `InfoPrepaga CRM | Privado | Página ${i + 1} de ${pages.count}`,
          42,
          doc.page.height - 35,
          { width, lineBreak: false },
        );
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
