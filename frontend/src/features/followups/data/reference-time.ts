import 'server-only';
import { dateKey } from './tasks';

export function getFollowupsReferenceTime() {
  const now = new Date().toISOString();
  return { now, today: dateKey(now) };
}
