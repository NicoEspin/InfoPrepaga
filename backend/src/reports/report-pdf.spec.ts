import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { reportPdf } from './report-pdf';
import { metrics, Snapshot, AggregateRow } from './report-calculation';
describe('Local snapshot PDF', () => {
  // Inspect the emitted file, including embedded-font text, rather than PDFKit calls.
  const pages = (buffer: Buffer): string[] =>
    JSON.parse(
      execFileSync(
        process.env.PDF_TEST_PYTHON ?? 'python',
        [
          '-c',
          'import io,json,sys\nfrom pypdf import PdfReader\nprint(json.dumps([p.extract_text() for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))',
        ],
        { input: buffer, encoding: 'utf8' },
      ),
    ) as string[];
  const readable = (text: string) => text.replace(/\s+/g, ' ').trim();
  const base: Snapshot = {
    calculationVersion: 1,
    name: 'Análisis de Córdoba, José y María · período sin datos',
    author: { id: 'synthetic', name: 'Administración sintética' },
    generatedAt: '2026-06-01T03:00:00.000Z',
    from: '2026-05-01',
    to: '2026-05-31',
    timezone: 'America/Argentina/Buenos_Aires',
    cutoff: '2026-06-01T03:00:00.000Z',
    partial: false,
    allResponsibles: true,
    sources: [],
    responsibles: [],
    summary: metrics([], [], true),
    bySource: [],
    byResponsible: [],
    warnings: [
      'Datos sintéticos para revisión visual. Sin datos no significa cero inversión.',
    ],
  };
  it('handles empty snapshots, Spanish names, long rows and multi-page tables', async () => {
    const empty = await reportPdf('synthetic-empty', base);
    expect(empty.subarray(0, 5).toString()).toBe('%PDF-');
    const emptyText = readable(pages(empty).join(' '));
    expect(emptyText).toContain(base.name);
    expect(emptyText).toContain(base.author.name);
    expect(emptyText).toContain('Sin resultados para la selección.');
    expect(emptyText).toContain('No informada');
    const names = Array.from({ length: 65 }, (_, i) => ({
      id: `synthetic-${i}`,
      name: `Responsable sintético ${i + 1}: María José de Córdoba y San Martín con nombre extenso para probar múltiples líneas`,
      isActive: true,
    }));
    const sourceRows: AggregateRow[] = names.map((n) => ({
      population: 'A',
      sourceId: n.id,
      responsibleId: n.id,
      stage: 'CLOSED',
      won: true,
      count: 3n,
    }));
    const long: Snapshot = {
      ...base,
      name: 'Reporte extenso de prueba: comparación por canales y responsables comerciales con acentos y nombres largos',
      sources: names.map((n) => ({ ...n, investment: '200000.10' })),
      responsibles: names,
      summary: metrics(
        sourceRows,
        names.map(() => '200000.10'),
        true,
      ),
      bySource: names.map((n) => ({
        ...n,
        metrics: metrics(
          sourceRows.filter((r) => r.sourceId === n.id),
          ['200000.10'],
          true,
        ),
      })),
      byResponsible: names.map((n) => ({
        ...n,
        metrics: metrics(
          sourceRows.filter((r) => r.responsibleId === n.id),
          [],
          false,
        ),
      })),
    };
    const extensive = await reportPdf('synthetic-long', long);
    expect(extensive.length).toBeGreaterThan(empty.length);
    const emittedPages = pages(extensive);
    expect(emittedPages.length).toBeGreaterThan(1);
    emittedPages.forEach((page, i) => {
      expect(readable(page)).toContain(
        `Página ${i + 1} de ${emittedPages.length}`,
      );
    });
    const text = readable(emittedPages.join(' '));
    expect(text).toContain(long.name);
    expect(text).toContain(names.at(-1)!.name);
    expect(text).toContain('200.000,10');
    expect(text).toContain(long.warnings[0]);
    if (process.env.REPORT_PDF_QA_DIR) {
      writeFileSync(`${process.env.REPORT_PDF_QA_DIR}/empty.pdf`, empty);
      writeFileSync(`${process.env.REPORT_PDF_QA_DIR}/long.pdf`, extensive);
    }
  });
  it('renders the saved metrics, filters and cutoff without recalculating them', async () => {
    const summary = metrics(
      [
        {
          population: 'A',
          sourceId: 'synthetic',
          responsibleId: null,
          stage: 'NEW',
          won: false,
          count: 2n,
        },
        {
          population: 'A',
          sourceId: 'synthetic',
          responsibleId: null,
          stage: 'CLOSED',
          won: true,
          count: 1n,
        },
        {
          population: 'B',
          sourceId: 'synthetic',
          responsibleId: null,
          stage: 'CLOSED',
          won: true,
          count: 7n,
        },
      ],
      ['123456.78'],
      true,
    );
    const snapshot: Snapshot = {
      ...base,
      summary,
      cutoff: '2026-05-31T21:45:00.000Z',
      sources: [
        {
          id: 'synthetic',
          name: 'Canal Córdoba',
          isActive: true,
          investment: '123456.78',
        },
      ],
      bySource: [{ id: 'synthetic', name: 'Canal Córdoba', metrics: summary }],
    };
    const text = readable(
      pages(await reportPdf('synthetic-values', snapshot)).join(' '),
    );
    expect(text).toContain('Canales incluidos: Canal Córdoba');
    expect(text).toContain('2026-05-01 al 2026-05-31');
    expect(text).toContain('America/Argentina/Buenos_Aires');
    const cutoff = new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: snapshot.timezone,
    }).format(new Date(snapshot.cutoff));
    expect(text).toContain(readable(`Corte efectivo: ${cutoff}`));
    expect(text).toMatch(/3\s+7\s+1\s+33\.33%/);
    expect(text).toContain('123.456,78');
    expect(text).toContain('41.152,26');
    expect(text).toContain('Versión de cálculo 1');
  });
});
