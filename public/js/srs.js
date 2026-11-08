const pad = n => String(n).padStart(2, '0');

export const GRADES = [
  { g: 1, label: 'Again' },
  { g: 3, label: 'Hard' },
  { g: 4, label: 'Good' },
  { g: 5, label: 'Easy' }
];

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
}

function nextEase(ease, grade) {
  const q = 5 - grade;
  const e = Math.max(1.3, ease + 0.1 - q * (0.08 + q * 0.02));
  return Math.round(e * 100) / 100;
}

export function review(card, grade, today) {
  const ease = nextEase(card.ease, grade);
  let reps = card.reps;
  let ivl = 1;
  if (grade < 3) {
    reps = 0;
  } else {
    if (reps === 1) ivl = 6;
    else if (reps > 1) ivl = Math.round(card.ivl * ease);
    reps += 1;
  }
  return { ivl, ease, reps, due: addDays(today, ivl) };
}

export function dueCards(cards, today) {
  return cards
    .filter(c => c.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id));
}
