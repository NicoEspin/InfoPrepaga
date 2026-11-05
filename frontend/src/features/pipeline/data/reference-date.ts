import 'server-only';

// Compute once on the server and serialize the result to avoid hydration differences.
export function getPipelineReferenceDate(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(new Date());
}
