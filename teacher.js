// =============================================
// teacher.js — кабинет учителя
// =============================================

import { db } from "./firebase.js";
import { logout } from "./auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion, arrayRemove,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STAGE_KEYS = ['razberis', 'rule', 'practice', 'test'];
const STAGE_LABELS = {
  razberis: 'Разберись',
  rule: 'Пойми правило',
  practice: 'Потренируйся',
  test: 'Проверь себя',
};

let TEACHER_DATA = null;
let TASK_INDEX = new Map();

import { fetchAsset } from './js/fetch-utils.js';

async function ensureTeacherData() {
  if (TEACHER_DATA) return TEACHER_DATA;
  const res = await fetchAsset('data.json');
  TEACHER_DATA = await res.json();
  TASK_INDEX = buildTaskIndex(TEACHER_DATA.categories || []);
  return TEACHER_DATA;
}

function buildTaskIndex(categories) {
  const map = new Map();
  categories.forEach(cat => {
    (cat.subtopics || []).forEach(sub => {
      STAGE_KEYS.forEach(stageKey => {
        (sub.stages?.[stageKey] || []).forEach(task => {
          map.set(task.id, {
            task,
            categoryId: cat.id,
            categoryName: cat.name,
            stageKey,
            stageName: STAGE_LABELS[stageKey] || stageKey,
            topicTag: task.topicTag || task.task_type || task.code || task.id,
          });
        });
      });
    });
  });
  return map;
}

function safeProgressDoc(progress, catId) {
  const catProgress = progress?.[catId];
  const subProgress = catProgress?.[`${catId}_main`];
  return subProgress?.stageProgress || {};
}

function getCategoryStats(progress, cat) {
  let correct = 0;
  let attempts = 0;
  let total = 0;
  const stageProgress = safeProgressDoc(progress, cat.id);
  const sub = cat.subtopics?.[0];

  STAGE_KEYS.forEach(stageKey => {
    const stageTotal = (sub?.stages?.[stageKey] || []).length;
    const correctIds = stageProgress?.[stageKey]?.correctIds || [];
    const wrongIds = stageProgress?.[stageKey]?.wrongIds || [];
    const skippedIds = stageProgress?.[stageKey]?.skippedIds || [];
    total += stageTotal;
    correct += correctIds.length;
    attempts += correctIds.length + wrongIds.length + skippedIds.length;
  });

  return {
    total,
    correct,
    attempts,
    pct: attempts ? Math.round((correct / attempts) * 100) : null,
    completionPct: total ? Math.round((correct / total) * 100) : 0,
  };
}

function getCellStatus(pct) {
  if (pct === null) return 'empty';
  if (pct >= 70) return 'green';
  if (pct >= 50) return 'amber';
  return 'red';
}

function formatTopicTag(tag) {
  return (tag || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, ch => ch.toUpperCase()) || 'Грамматическая ошибка';
}

function formatRelativeDate(ts) {
  if (!ts) return 'нет активности';
  const ms = Date.now() - Number(ts);
  const days = Math.max(0, Math.floor(ms / 86400000));
  if (days === 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} дней назад`;
}

function getInitials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

function getMiniOgePercent(item) {
  const score = Number(item?.score) || 0;
  const total = Number(item?.total) || 9;
  return total ? Math.round((score / total) * 100) : 0;
}

function getStudentMiniOgeSummary(student) {
  const history = Array.isArray(student?.miniOgeHistory) ? student.miniOgeHistory : [];
  const series = history
    .map((item, index) => ({
      attemptNumber: index + 1,
      scorePercent: getMiniOgePercent(item),
      createdAt: Number(item?.createdAt) || 0,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.attemptNumber - b.attemptNumber)
    .map((item, index) => ({ ...item, attemptNumber: index + 1 }));

  const average = series.length
    ? Math.round(series.reduce((sum, item) => sum + item.scorePercent, 0) / series.length)
    : null;

  return {
    series,
    totalAttempts: series.length,
    best: series.length ? Math.max(...series.map(item => item.scorePercent)) : null,
    average,
    last: series.length ? series[series.length - 1].scorePercent : null,
  };
}

function buildTeacherStats(students, categories) {
  const heatMap = students.map(student => {
    const cells = {};
    categories.forEach(cat => {
      const stats = getCategoryStats(student.progress || {}, cat);
      cells[cat.id] = {
        pct: stats.pct,
        status: getCellStatus(stats.pct),
      };
    });
    return {
      uid: student.uid,
      name: student.name,
      studentCode: student.studentCode,
      cells,
    };
  });

  // Собираем ошибки по теме (categoryName), агрегируя по всем этапам
  const topicErrorMap = new Map();
  categories.forEach(cat => {
    STAGE_KEYS.forEach(stageKey => {
      students.forEach(student => {
        const stageProgress = safeProgressDoc(student.progress || {}, cat.id);
        const wrongIds = [
          ...(stageProgress?.[stageKey]?.wrongIds || []),
          ...(stageProgress?.[stageKey]?.skippedIds || []),
        ];
        wrongIds.forEach(taskId => {
          const meta = TASK_INDEX.get(taskId);
          if (!meta) return;
          const key = meta.categoryName;
          if (!topicErrorMap.has(key)) {
            topicErrorMap.set(key, {
              categoryName: meta.categoryName,
              // Множество учеников с ошибками
              studentIds: new Set(),
              // Имена для отображения
              studentNames: new Map(),
              // Этапы где есть ошибки
              stagesWithErrors: new Set(),
              totalWrong: 0,
            });
          }
          const entry = topicErrorMap.get(key);
          entry.studentIds.add(student.uid);
          entry.studentNames.set(student.uid, student.name);
          entry.stagesWithErrors.add(STAGE_LABELS[stageKey] || stageKey);
          entry.totalWrong += 1;
        });
      });
    });
  });

  const topErrors = [...topicErrorMap.values()]
    .map(item => ({
      categoryName: item.categoryName,
      errorRate: students.length ? Math.round((item.studentIds.size / students.length) * 100) : 0,
      studentCount: item.studentIds.size,
      totalStudents: students.length,
      studentNames: [...item.studentNames.values()],
      stagesWithErrors: [...item.stagesWithErrors],
      totalWrong: item.totalWrong,
    }))
    .filter(item => item.errorRate > 0)
    .sort((a, b) => b.errorRate - a.errorRate || b.totalWrong - a.totalWrong)
    .slice(0, 6);

  // Совместимость: старый формат для остального кода
  const topErrorsLegacy = [...topicErrorMap.values()]
    .map(item => ({
      topicTag: item.categoryName,
      categoryName: item.categoryName,
      stageName: [...item.stagesWithErrors].join(', '),
      errorRate: students.length ? Math.round((item.studentIds.size / students.length) * 100) : 0,
    }))
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 5);

  const weekAgo = Date.now() - 7 * 86400000;
  const activity = students.map(student => {
    const lastSeenAt = Number(student.lastSeenAt || 0) || null;
    const latestMini = Math.max(0, ...(student.miniOgeHistory || []).map(item => Number(item.createdAt) || 0));
    const effectiveSeenAt = Math.max(lastSeenAt || 0, latestMini || 0) || null;
    return {
      uid: student.uid,
      name: student.name,
      isActive: Boolean(effectiveSeenAt && effectiveSeenAt >= weekAgo),
      lastSeenAt: effectiveSeenAt,
    };
  }).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
  });

  const classCategoryAverages = categories.map(cat => {
    const values = students
      .map(student => getCategoryStats(student.progress || {}, cat).pct)
      .filter(value => value !== null);
    const avg = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    return { catId: cat.id, avg };
  });

  const allCategoryScores = [];
  students.forEach(student => {
    categories.forEach(cat => {
      const pct = getCategoryStats(student.progress || {}, cat).pct;
      if (pct !== null) allCategoryScores.push(pct);
    });
  });

  return {
    heatMap,
    topErrors,
    activity,
    metrics: {
      activeCount: activity.filter(item => item.isActive).length,
      totalStudents: students.length,
      classAverage: allCategoryScores.length
        ? Math.round(allCategoryScores.reduce((sum, value) => sum + value, 0) / allCategoryScores.length)
        : 0,
      weakCategories: classCategoryAverages.filter(item => item.avg !== null && item.avg < 50).length,
    },
  };
}

export async function renderTeacherDashboard(user, profile, onAuthed) {
  const data = await ensureTeacherData();
  const students = await loadStudents(profile.students || []);
  renderTeacherUI(user, profile, students, data.categories || [], onAuthed);
}

async function loadStudents(uids) {
  if (!uids.length) return [];

  const results = [];
  const batchSize = 10;

  for (let i = 0; i < uids.length; i += batchSize) {
    const batch = uids.slice(i, i + batchSize);
    const studentsRef = collection(db, "users");
    const q = query(studentsRef, where("__name__", "in", batch.map(uid => `${uid}_student`)));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach(docSnap => {
      results.push(docSnap.data());
    });
  }

  return results;
}

function renderTeacherUI(user, profile, students, categories, onAuthed) {
  const firstName = profile.name?.split(' ')[1] || profile.name?.split(' ')[0] || 'Коллега';
  const stats = buildTeacherStats(students, categories);

  document.getElementById("app").innerHTML = `
    <div class="screen-enter teacher-dashboard-wrap">
      <div class="teacher-topbar">
        <div>
          <h1>Кабинет учителя</h1>
          <p class="text-muted">${profile.name}</p>
          <p class="teacher-welcome-text">Добрый день, ${firstName}! Здесь собрана аналитика класса по прогрессу, ошибкам и активности за неделю.</p>
        </div>
        <button class="btn btn-ghost" onclick="window._teacherLogout()">Выйти →</button>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Добавить ученика</div>
        <div class="teacher-add-row">
          <input class="form-input" id="student-code-input" type="text"
            placeholder="Например: AB3X7K"
            maxlength="6" oninput="this.value=this.value.toUpperCase()" />
          <button class="btn btn-primary" onclick="window._addStudent('${user.uid}')">Добавить ученика</button>
        </div>
        <div id="add-student-msg" class="hidden" style="margin-top:10px;font-size:0.88rem"></div>
      </div>

      <div class="teacher-metrics-grid">
        <div class="profile-kpi-card"><div class="profile-kpi-value">${stats.metrics.activeCount}/${stats.metrics.totalStudents}</div><div class="profile-kpi-label">Работали на неделе</div></div>
        <div class="profile-kpi-card"><div class="profile-kpi-value">${stats.metrics.classAverage}%</div><div class="profile-kpi-label">Средний балл класса</div></div>
        <div class="profile-kpi-card"><div class="profile-kpi-value">${stats.metrics.weakCategories}</div><div class="profile-kpi-label">Слабых категорий</div></div>
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Статистика Мини-ОГЭ по классу</div>
        ${buildClassMiniOgeChartHtml(students)}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Тепловая карта класса</div>
        ${buildHeatMapHtml(stats.heatMap, categories)}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Разбор ошибок — план на урок</div>
        ${buildTopErrorsHtml(stats.topErrors, students)}
      </div>

      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Активность за последние 7 дней</div>
        ${buildActivityHtml(stats.activity, students)}
      </div>
    </div>`;

  window._teacherLogout = () => logout(onAuthed);

  window._addStudent = async (teacherUid) => {
    const code = document.getElementById("student-code-input").value.trim().toUpperCase();
    const msgEl = document.getElementById("add-student-msg");
    msgEl.className = "hidden";
    if (code.length !== 6) {
      msgEl.className = "form-error";
      msgEl.textContent = "Код должен состоять из 6 символов";
      return;
    }
    if (students.length >= 40) {
      msgEl.className = "form-error";
      msgEl.textContent = "Достигнут лимит учеников (40)";
      return;
    }

    try {
      const q = query(collection(db, "users"), where("studentCode", "==", code), where("role", "==", "student"));
      const snap = await getDocs(q);
      if (snap.empty) {
        msgEl.className = "form-error";
        msgEl.textContent = "Ученик с таким кодом не найден";
        return;
      }

      const sd = snap.docs[0].data();
      if (students.find(s => s.uid === sd.uid)) {
        msgEl.className = "form-error";
        msgEl.textContent = "Этот ученик уже добавлен";
        return;
      }
      if (sd.teacherId && sd.teacherId !== teacherUid) {
        msgEl.className = "form-error";
        msgEl.textContent = "Ученик прикреплён к другому учителю";
        return;
      }

      await updateDoc(doc(db, "users", `${teacherUid}_teacher`), { students: arrayUnion(sd.uid) });
      await updateDoc(doc(db, "users", `${sd.uid}_student`), { teacherId: teacherUid });
      students.push(sd);
      document.getElementById("student-code-input").value = "";
      msgEl.className = "form-success";
      msgEl.textContent = `✅ Ученик ${sd.name} успешно добавлен!`;
      renderTeacherUI(user, { ...profile, students: [...(profile.students || []), sd.uid] }, students, categories, onAuthed);
    } catch (e) {
      msgEl.className = "form-error";
      msgEl.textContent = "Ошибка. Попробуйте ещё раз.";
      console.error(e);
    }
  };

  window._showStudentDetail = async (studentUid) => {
    const snap = await getDoc(doc(db, "users", `${studentUid}_student`));
    if (!snap.exists()) return;
    renderStudentDetail(snap.data(), user, profile, students, categories, onAuthed);
  };

  window._removeStudent = async (studentUid) => {
    try {
      await updateDoc(doc(db, "users", `${user.uid}_teacher`), { students: arrayRemove(studentUid) });
      await updateDoc(doc(db, "users", `${studentUid}_student`), { teacherId: null });
      const updatedStudents = students.filter(s => s.uid !== studentUid);
      const updatedProfile = {
        ...profile,
        students: (profile.students || []).filter(uid => uid !== studentUid),
      };
      renderTeacherUI(user, updatedProfile, updatedStudents, categories, onAuthed);
    } catch (e) {
      console.error(e);
      alert("Ошибка: " + e.message);
    }
  };
}

function buildHeatMapHtml(heatMap, categories) {
  if (!heatMap.length) {
    return `<div class="empty-state"><p>Пока нет учеников для отображения тепловой карты.</p></div>`;
  }

  const headHtml = categories.map(cat => `<th>${cat.name.split(' ')[0]}</th>`).join('');
  const rowsHtml = heatMap.map(row => `
    <tr>
      <td class="teacher-student-cell">
        <button class="teacher-student-link" onclick="window._showStudentDetail('${row.uid}')">${row.name}</button>
      </td>
      ${categories.map(cat => {
        const cell = row.cells[cat.id] || { pct: null, status: 'empty' };
        return `<td><div class="heat-cell ${cell.status}">${cell.pct === null ? '—' : `${cell.pct}%`}</div></td>`;
      }).join('')}
    </tr>
  `).join('');

  return `
    <div class="teacher-table-scroll">
      <table class="teacher-heat-table">
        <thead><tr><th>Ученик</th>${headHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="teacher-legend-row">
      <span><i class="heat-dot green"></i> 70–100%</span>
      <span><i class="heat-dot amber"></i> 50–69%</span>
      <span><i class="heat-dot red"></i> ниже 50%</span>
      <span><i class="heat-dot empty"></i> нет попыток</span>
    </div>
  `;
}

function buildTopErrorsHtml(topErrors, students) {
  if (!topErrors.length) {
    return `<div class="empty-state" style="text-align:center;padding:32px 20px">
      <div style="font-size:2.2rem;margin-bottom:10px">🎉</div>
      <p style="font-weight:600;color:var(--text);margin-bottom:4px">Ошибок не обнаружено!</p>
      <p style="font-size:0.84rem">Ученики ещё не выполняли задания, или класс справляется отлично.</p>
    </div>`;
  }

  const totalStudents = students.length;

  // Приоритет: ≥70% класса = Срочно, 40–69% = Стоит повторить, <40% = На заметку
  function getPriority(rate) {
    if (rate >= 70) return { label: 'Срочно', cls: 'priority-critical', icon: '🔴' };
    if (rate >= 40) return { label: 'Повторить', cls: 'priority-warn', icon: '🟡' };
    return { label: 'На заметку', cls: 'priority-ok', icon: '🟢' };
  }

  // Сводка: сколько тем нужно на уроке
  const urgent = topErrors.filter(e => e.errorRate >= 70).length;
  const warn   = topErrors.filter(e => e.errorRate >= 40 && e.errorRate < 70).length;

  const summaryHtml = `
    <div class="lesson-plan-banner">
      <div class="lesson-plan-banner-icon">📋</div>
      <div class="lesson-plan-banner-body">
        <div class="lesson-plan-banner-title">План на урок</div>
        <div class="lesson-plan-banner-desc">
          ${urgent > 0 ? `<span class="lp-chip lp-chip-red">${urgent} тем${urgent === 1 ? 'а' : (urgent < 5 ? 'ы' : '')} — разобрать сегодня</span>` : ''}
          ${warn > 0   ? `<span class="lp-chip lp-chip-amber">${warn} тем${warn === 1 ? 'а' : (warn < 5 ? 'ы' : '')} — желательно повторить</span>` : ''}
          ${urgent === 0 && warn === 0 ? `<span class="lp-chip lp-chip-green">Критических ошибок нет 👍</span>` : ''}
        </div>
      </div>
    </div>`;

  const cardsHtml = topErrors.map((item, index) => {
    const p = getPriority(item.errorRate);
    const bar = Math.min(100, item.errorRate);
    const barColor = item.errorRate >= 70 ? 'var(--rose)' : item.errorRate >= 40 ? 'var(--warning)' : 'var(--accent)';

    // Имена учеников с ошибками (до 4, потом "+ещё N")
    const shown = item.studentNames.slice(0, 4);
    const rest  = item.studentNames.length - shown.length;
    const namesHtml = shown.map(n => `<span class="student-chip">${n.split(' ')[0]}</span>`).join('')
      + (rest > 0 ? `<span class="student-chip student-chip-more">+ещё ${rest}</span>` : '');

    // Этапы с ошибками
    const stagesHtml = item.stagesWithErrors.map(s =>
      `<span class="stage-chip">${s}</span>`
    ).join('');

    return `
    <div class="lesson-topic-card ${p.cls}">
      <div class="lesson-topic-header">
        <div class="lesson-topic-num">${index + 1}</div>
        <div class="lesson-topic-name">${item.categoryName}</div>
        <div class="lesson-priority-badge ${p.cls}">${p.icon} ${p.label}</div>
      </div>

      <div class="lesson-topic-bar-wrap">
        <div class="lesson-topic-bar-track">
          <div class="lesson-topic-bar-fill" style="width:${bar}%;background:${barColor}"></div>
        </div>
        <div class="lesson-topic-stat">
          <span class="lesson-topic-stat-big">${item.studentCount}</span>
          <span class="lesson-topic-stat-label"> из ${totalStudents} учеников допустили ошибки</span>
        </div>
      </div>

      <div class="lesson-topic-footer">
        <div class="lesson-topic-meta-block">
          <span class="lesson-meta-label">Проблемные этапы:</span>
          <div class="lesson-chips-row">${stagesHtml}</div>
        </div>
        <div class="lesson-topic-meta-block">
          <span class="lesson-meta-label">Кто ошибся:</span>
          <div class="lesson-chips-row">${namesHtml}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  return summaryHtml + `<div class="lesson-topics-list">${cardsHtml}</div>`;
}

function buildActivityHtml(activity, students) {
  if (!students.length) {
    return `<div class="empty-state"><p>Пока нет учеников в классе.</p></div>`;
  }

  return `<div class="teacher-activity-list">${activity.map(item => `
    <div class="teacher-activity-row">
      <div class="teacher-activity-avatar">${getInitials(item.name)}</div>
      <div class="teacher-activity-name">${item.name}</div>
      <div class="teacher-activity-badge ${item.isActive ? 'active' : 'inactive'}">${item.isActive ? 'активен/активна' : 'не заходил/а'}</div>
      <div class="teacher-activity-date">${formatRelativeDate(item.lastSeenAt)}</div>
    </div>
  `).join('')}</div>`;
}

function buildClassMiniOgeChartHtml(students) {
  if (!students.length) {
    return `<div class="empty-state"><p>Пока нет учеников для графика Мини-ОГЭ.</p></div>`;
  }

  const rows = students
    .map(student => ({
      uid: student.uid,
      name: student.name,
      ...getStudentMiniOgeSummary(student),
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name, 'ru'));

  const hasData = rows.some(row => row.average !== null);
  if (!hasData) {
    return `<div class="empty-state"><p>Ученики ещё не проходили Мини-ОГЭ.</p></div>`;
  }

  return `
    <div class="teacher-mini-class-chart">
      ${rows.map(row => {
        const pct = row.average ?? 0;
        const fillColor = pct >= 70 ? '#639922' : pct >= 50 ? '#BA7517' : pct > 0 ? '#E24B4A' : '#e8e2d9';
        return `
          <div class="teacher-mini-class-row">
            <button class="teacher-student-link teacher-mini-name" onclick="window._showStudentDetail('${row.uid}')">${row.name}</button>
            <div class="teacher-mini-class-bar">
              <div class="teacher-mini-class-fill" style="width:${pct}%;background:${fillColor}"></div>
            </div>
            <div class="teacher-mini-class-score">${row.average === null ? '—' : `${row.average}%`}</div>
            <div class="teacher-mini-class-meta">лучший: ${row.best === null ? '—' : `${row.best}%`} · попыток: ${row.totalAttempts}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildStudentMiniOgeChartHtml(student) {
  const summary = getStudentMiniOgeSummary(student);
  if (!summary.series.length) {
    return `<div class="empty-state"><p>Ученик ещё не проходил Мини-ОГЭ.</p></div>`;
  }

  const width = Math.max(520, 120 + summary.series.length * 90);
  const height = 280;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 44;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const maxScore = 9;
  const xStep = summary.series.length > 1 ? chartW / (summary.series.length - 1) : 0;
  const points = summary.series.map((item, index) => {
    const scoreValue = Math.round((item.scorePercent / 100) * maxScore);
    const x = padLeft + (summary.series.length > 1 ? index * xStep : chartW / 2);
    const y = padTop + chartH - (scoreValue / maxScore) * chartH;
    return { ...item, scoreValue, x, y };
  });
  const linePoints = points.map(point => `${point.x},${point.y}`).join(' ');
  const yTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const gridHtml = yTicks.map(value => {
    const y = padTop + chartH - (value / maxScore) * chartH;
    return `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="teacher-oge-grid-line" />
      <text x="${padLeft - 14}" y="${y + 4}" class="teacher-oge-axis-text" text-anchor="end">${value}</text>
    `;
  }).join('');
  const xLabelsHtml = points.map(point => `
    <text x="${point.x}" y="${height - 14}" class="teacher-oge-axis-text" text-anchor="middle">Попытка ${point.attemptNumber}</text>
  `).join('');
  const markersHtml = points.map((point, index) => `
    <circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 6 : 5}" class="teacher-oge-point ${index === points.length - 1 ? 'last' : ''}" />
    <text x="${point.x}" y="${point.y - 12}" class="teacher-oge-value-text" text-anchor="middle">${point.scoreValue}/9</text>
  `).join('');

  return `
    <div class="teacher-oge-line-wrap">
      <div class="teacher-oge-line-title">Результаты Mini-ОГЭ по попыткам</div>
      <div class="teacher-oge-svg-scroll">
        <svg class="teacher-oge-line-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Динамика Mini-ОГЭ ученика">
          <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="teacher-oge-axis-line" />
          <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="teacher-oge-axis-line" />
          ${gridHtml}
          ${xLabelsHtml}
          <polyline points="${linePoints}" class="teacher-oge-line-path" />
          ${markersHtml}
        </svg>
      </div>
    </div>
    <div class="mini-oge-summary-row">
      <div class="mini-oge-summary-item"><strong>${summary.best}%</strong><span>Лучший результат</span></div>
      <div class="mini-oge-summary-item"><strong>${summary.average}%</strong><span>Средний</span></div>
      <div class="mini-oge-summary-item"><strong>${summary.totalAttempts}</strong><span>Попыток</span></div>
    </div>
  `;
}

function renderStudentDetail(student, user, profile, students, categories, onAuthed) {
  const cards = categories.map(cat => {
    const stats = getCategoryStats(student.progress || {}, cat);
    const pct = stats.pct;
    const status = getCellStatus(pct);
    const valueLabel = pct === null ? '—' : `${pct}%`;
    return `
      <div class="profile-topic-card">
        <div class="profile-topic-top">
          <div class="profile-topic-title-wrap">
            <div class="profile-topic-icon">${cat.icon}</div>
            <div>
              <div class="profile-topic-name">${cat.name}</div>
              <div class="profile-topic-meta">${stats.correct}/${stats.attempts || 0} правильных заданий</div>
            </div>
          </div>
          <div class="profile-topic-pct">${valueLabel}</div>
        </div>
        <div class="profile-topic-bar">
          <div class="profile-topic-fill" style="width:${pct || 0}%;background:${status === 'green' ? '#639922' : status === 'amber' ? '#BA7517' : status === 'red' ? '#E24B4A' : '#e8e2d9'}"></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById("app").innerHTML = `
    <div class="screen-enter teacher-dashboard-wrap">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <button class="btn btn-ghost" onclick="window._backToTeacher()">← Назад</button>
        <div>
          <h2>${student.name}</h2>
          <div class="text-muted" style="font-size:0.8rem">Код: ${student.studentCode || '—'} · последняя активность: ${formatRelativeDate(student.lastSeenAt)}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div class="section-title">Динамика Мини-ОГЭ ученика</div>
        ${buildStudentMiniOgeChartHtml(student)}
      </div>
      <div class="profile-category-stack">${cards}</div>
    </div>`;

  window._backToTeacher = () => renderTeacherUI(user, profile, students, categories, onAuthed);
}
