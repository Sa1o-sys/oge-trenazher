export function $(id) { return document.getElementById(id); }

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function normalizeAnswer(s) {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripAnswerPrefix(s) {
  return (s || '').replace(/^\(?[a-dа-г]\)\s*/i, '').trim();
}

export function formatOptionText(optionText) {
  return stripAnswerPrefix(optionText);
}

export function parseAnswerLetterIndex(answer) {
  const first = (answer || '').trim().toLowerCase().charAt(0);
  const map = { a: 0, 'а': 0, b: 1, 'в': 1, c: 2, 'с': 2, d: 3, 'д': 3 };
  return Object.prototype.hasOwnProperty.call(map, first) ? map[first] : null;
}

export function resolveCorrectOptionIndex(task) {
  if (Number.isInteger(task?.correct_idx) && task.correct_idx >= 0 && task.correct_idx < (task.options?.length || 0)) {
    return task.correct_idx;
  }
  const idx = parseAnswerLetterIndex(task?.answer);
  if (idx !== null && idx < (task.options?.length || 0)) return idx;
  return 0;
}

export function getChoiceAnswerText(task, correctIdx) {
  const idx = correctIdx ?? resolveCorrectOptionIndex(task);
  return formatOptionText((task?.options || [])[idx] || task?.answer || '');
}
