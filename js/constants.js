export const STAGE_ORDER  = ['razberis', 'rule', 'practice', 'test'];
export const STAGE_NEXT   = { razberis: 'rule', rule: 'practice', practice: 'test' };
export const STAGE_LABELS = {
  razberis: '🔍 Разберись',
  rule:     '💡 Пойми правило',
  practice: '✏️ Потренируйся',
  test:     '🏆 Проверь себя',
};
export const STAGE_DESC = {
  razberis: 'Изучи примеры',
  rule:     'Проверь понимание — выбери правильный вариант',
  practice: 'Вставь нужную форму в предложения',
  test:     'Задания с конкретными ситуациями — проверь себя',
};
