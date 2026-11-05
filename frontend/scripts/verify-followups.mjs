import assert from 'node:assert/strict';
import {
  createDemoTasks,
  dateKey,
  layoutAppointments,
  shiftDay,
  taskGroup,
  taskInstant,
  weekStart
} from '../src/features/followups/data/tasks.ts';

const today = '2026-10-29';
const tasks = createDemoTasks(today);
const appointment = (id, time, duration = 60) => ({
  ...tasks[0], id, dueAt: taskInstant(today, time), duration
});

assert.equal(dateKey('2026-10-29T02:59:00Z'), '2026-10-28');
assert.equal(dateKey('2026-10-29T03:00:00Z'), today);
assert.equal(taskInstant(today, '09:00'), '2026-10-29T12:00:00.000Z');
assert.equal(weekStart('2026-11-01'), '2026-10-26');
assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
console.log('PASS: Buenos Aires midnight, time conversion, Sunday and year boundaries');

assert.equal(tasks.length, 18);
assert.equal(new Set(tasks.map((task) => task.id)).size, 18);
assert.deepEqual(
  ['overdue', 'today', 'upcoming', 'completed'].map((group) =>
    tasks.filter((task) => taskGroup(task, today) === group).length
  ),
  [3, 5, 6, 4]
);
assert.equal(taskGroup({ ...tasks[0], completedAt: taskInstant(today, '12:00') }, today), 'completed');
console.log('PASS: 18 unique synthetic tasks, grouping and completion precedence');

const overlaps = [appointment('a', '09:00'), appointment('b', '09:30'), appointment('c', '10:00')];
const before = JSON.stringify(overlaps);
const layout = layoutAppointments(overlaps);
assert.deepEqual(layout.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 2]]);
assert.equal(JSON.stringify(overlaps), before);
assert.deepEqual(
  layoutAppointments([appointment('a', '09:00'), appointment('b', '10:00')]).map(({ lanes }) => lanes),
  [1, 1]
);
assert.deepEqual(
  layoutAppointments([appointment('early', '07:30'), appointment('late', '19:00')]).map(({ task }) => task.id),
  ['early']
);
console.log('PASS: chained overlaps, adjacent events, clipping and immutable input');
