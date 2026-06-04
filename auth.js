// =============================================
// auth.js — авторизация
// =============================================

import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Хранилище роли (uid → role) ──────────────
function getSavedRole(uid) {
  return localStorage.getItem("role_" + uid) || null;
}
function saveRole(uid, role) {
  localStorage.setItem("role_" + uid, role);
}
function deleteSavedRole(uid) {
  if (uid) localStorage.removeItem("role_" + uid);
}

function generateStudentCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = window.crypto?.getRandomValues(new Uint8Array(6));
  if (!bytes) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

async function loadProfileByRole(uid, role) {
  try {
    const snap = await getDoc(doc(db, "users", uid + "_" + role));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn("loadProfileByRole error:", e);
    return null;
  }
}

// ─── Главная точка входа ──────────────────────
export function initAuth(onAuthed) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      showRoleScreen(onAuthed);
      return;
    }
    // Пользователь уже залогинен в Firebase
    const savedRole = getSavedRole(user.uid);
    if (savedRole) {
      const profile = await loadProfileByRole(user.uid, savedRole);
      if (profile) {
        onAuthed(user, profile);
        return;
      }
      deleteSavedRole(user.uid);
    }
    // Роль не найдена — показываем выбор роли (НЕ делаем signOut)
    showRoleScreen(onAuthed);
  });
}

// ─── ЭКРАН: Выбор роли ────────────────────────
function showRoleScreen(onAuthed) {
  document.getElementById("app").innerHTML = `
    <div class="auth-screen screen-enter">
      <div class="auth-logo">
      <h1 style="color: red;">
    Тренажёр находится еще в разработке<br>
    по всем вопросам и предложениям пишите<br>
    сюда: arzyaeva_u@mail.ru
      </h1>
        <div class="auth-logo-icon">🎓</div>
        <h1>Тренажёр ОГЭ</h1>
        <p class="text-muted">Грамматика английского языка</p>
      </div>
      <div class="auth-card">
        <h2 style="text-align:center;margin-bottom:8px">Кто вы?</h2>
        <p class="text-muted" style="text-align:center;margin-bottom:24px;font-size:0.9rem">
          Выберите роль для продолжения
        </p>
        <div class="role-grid">
          <button class="role-btn" onclick="window._authFlow('student')">
            <span class="role-icon">📚</span>
            <span class="role-label">Ученик</span>
            <span class="role-desc">Изучаю грамматику,<br>прохожу задания</span>
          </button>
          <button class="role-btn" onclick="window._authFlow('teacher')">
            <span class="role-icon">👩‍🏫</span>
            <span class="role-label">Учитель</span>
            <span class="role-desc">Слежу за прогрессом<br>учеников</span>
          </button>
        </div>
      </div>
    </div>`;
  window._authFlow = (role) => showLoginScreen(role, onAuthed);
}

// ─── ЭКРАН: Вход / Регистрация ────────────────
function showLoginScreen(role, onAuthed) {
  const roleLabel = role === "student" ? "Ученик" : "Учитель";
  const roleIcon  = role === "student" ? "📚" : "👩‍🏫";

  document.getElementById("app").innerHTML = `
    <div class="auth-screen screen-enter">
      <div class="auth-logo">
        <div class="auth-logo-icon">${roleIcon}</div>
        <h1>${roleLabel}</h1>
        <p class="text-muted">Выберите действие</p>
      </div>
      <div class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login"
            onclick="window._switchTab('login')">Вход</button>
          <button class="auth-tab" id="tab-register"
            onclick="window._switchTab('register')">Регистрация</button>
        </div>

        <!-- ВХОД -->
        <div id="form-login">
          <div class="form-group">
            <label class="form-label">Электронная почта</label>
            <input class="form-input" id="login-email" type="email"
              placeholder="example@mail.ru" autocomplete="email"/>
          </div>
          <div class="form-group">
            <label class="form-label">Пароль</label>
            <input class="form-input" id="login-password" type="password"
              placeholder="Введите пароль" autocomplete="current-password"
              onkeydown="if(event.key==='Enter'){event.preventDefault();window._doLogin();}"/>
          </div>
          <div id="login-error" class="form-error hidden"></div>
          <button class="btn btn-primary" style="width:100%;margin-top:8px"
            onclick="window._doLogin()">Войти</button>
          <div style="text-align:center;margin-top:14px">
            <button class="btn btn-ghost" style="font-size:0.85rem"
              onclick="window._showReset()">Забыл пароль</button>
          </div>
        </div>

        <!-- РЕГИСТРАЦИЯ -->
        <div id="form-register" class="hidden">
          <div class="form-group">
            <label class="form-label">ФИО</label>
            <input class="form-input" id="reg-name" type="text"
              placeholder="Иванов Иван Иванович" autocomplete="name"/>
          </div>
          <div class="form-group">
            <label class="form-label">Электронная почта</label>
            <input class="form-input" id="reg-email" type="email"
              placeholder="example@mail.ru" autocomplete="email"/>
          </div>
          <div class="form-group">
            <label class="form-label">Пароль</label>
            <input class="form-input" id="reg-password" type="password"
              placeholder="Минимум 6 символов" autocomplete="new-password"
              onkeydown="if(event.key==='Enter'){event.preventDefault();window._doRegister();}"/>
          </div>
          <div id="reg-error" class="form-error hidden"></div>
          <button class="btn btn-primary" style="width:100%;margin-top:8px"
            onclick="window._doRegister()">Зарегистрироваться</button>
        </div>

        <div style="text-align:center;margin-top:20px">
          <button class="btn btn-ghost" style="font-size:0.85rem"
            onclick="window._backToRole()">← Изменить роль</button>
        </div>
      </div>
    </div>`;

  // ── Назначаем обработчики ПОСЛЕ рендера ──────
  window._switchTab = (tab) => {
    document.getElementById("form-login").classList.toggle("hidden", tab !== "login");
    document.getElementById("form-register").classList.toggle("hidden", tab !== "register");
    document.getElementById("tab-login").classList.toggle("active", tab === "login");
    document.getElementById("tab-register").classList.toggle("active", tab === "register");
  };
  window._backToRole = () => showRoleScreen(onAuthed);
  window._showReset  = () => showResetScreen(onAuthed);

  // ── ВХОД ─────────────────────────────────────
  window._doLogin = async () => {
    const email    = (document.getElementById("login-email")?.value || "").trim();
    const password = document.getElementById("login-password")?.value || "";
    const errEl    = document.getElementById("login-error");
    if (!errEl) return;
    errEl.classList.add("hidden");

    if (!email || !password) {
      showError(errEl, "Заполните все поля"); return;
    }

    // Показываем индикатор загрузки
    const btn = document.querySelector('#form-login .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = "Входим..."; }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid  = cred.user.uid;

      const profile = await loadProfileByRole(uid, role);
      if (!profile) {
        await signOut(auth);
        if (btn) { btn.disabled = false; btn.textContent = "Войти"; }
        showError(errEl, `Аккаунт «${role === "student" ? "Ученика" : "Учителя"}» не найден. Пройдите регистрацию.`);
        return;
      }

      // !! ГЛАВНОЕ ИСПРАВЛЕНИЕ: явно вызываем onAuthed !!
      // onAuthStateChanged НЕ перезапускается при изменении localStorage
      saveRole(uid, role);
      onAuthed(cred.user, profile);

    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Войти"; }
      showError(errEl, friendlyError(e.code));
    }
  };

  // ── РЕГИСТРАЦИЯ ───────────────────────────────
  window._doRegister = async () => {
    const name     = (document.getElementById("reg-name")?.value || "").trim();
    const email    = (document.getElementById("reg-email")?.value || "").trim();
    const password = document.getElementById("reg-password")?.value || "";
    const errEl    = document.getElementById("reg-error");
    if (!errEl) return;
    errEl.classList.add("hidden");

    if (!name || !email || !password) { showError(errEl, "Заполните все поля"); return; }
    if (password.length < 6) { showError(errEl, "Пароль минимум 6 символов"); return; }

    const btn = document.querySelector('#form-register .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = "Регистрируем..."; }

    try {
      let uid;
      let isNewUser = false;

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        uid = cred.user.uid;
        isNewUser = true;
      } catch (e) {
        if (e.code === "auth/email-already-in-use") {
          // Почта занята — пробуем войти с этим паролем
          const cred = await signInWithEmailAndPassword(auth, email, password);
          uid = cred.user.uid;
        } else {
          throw e;
        }
      }

      // Проверяем что профиль с этой ролью ещё не существует
      const existing = await loadProfileByRole(uid, role);
      if (existing) {
        if (!isNewUser) await signOut(auth);
        if (btn) { btn.disabled = false; btn.textContent = "Зарегистрироваться"; }
        showError(errEl, `Аккаунт «${role === "student" ? "Ученика" : "Учителя"}» для этой почты уже существует`);
        return;
      }

      const profileData = { uid, name, email, role, createdAt: Date.now() };
      if (role === "student") {
        profileData.studentCode = generateStudentCode();
        profileData.teacherId   = null;
        profileData.progress    = {};
      } else {
        profileData.students = [];
      }

      await setDoc(doc(db, "users", uid + "_" + role), profileData);

      // !! Явно вызываем onAuthed — не ждём onAuthStateChanged !!
      saveRole(uid, role);
      const user = auth.currentUser;
      onAuthed(user, profileData);

    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "Зарегистрироваться"; }
      console.error("Register error:", e.code, e.message);
      showError(errEl, friendlyError(e.code));
    }
  };

  // Обратная совместимость (на случай старых onclick)
  window._login    = window._doLogin;
  window._register = window._doRegister;
}

// ─── ЭКРАН: Сброс пароля ──────────────────────
function showResetScreen(onAuthed) {
  document.getElementById("app").innerHTML = `
    <div class="auth-screen screen-enter">
      <div class="auth-logo">
        <div class="auth-logo-icon">🔑</div>
        <h1>Сброс пароля</h1>
        <p class="text-muted">Введите почту — пришлём ссылку</p>
      </div>
      <div class="auth-card">
        <div class="form-group">
          <label class="form-label">Электронная почта</label>
          <input class="form-input" id="reset-email" type="email" placeholder="example@mail.ru"/>
        </div>
        <div id="reset-msg" class="hidden" style="margin-bottom:12px"></div>
        <button class="btn btn-primary" style="width:100%"
          onclick="window._sendReset()">Отправить письмо</button>
        <div style="text-align:center;margin-top:14px">
          <button class="btn btn-ghost" onclick="window._backToRole()">← Назад</button>
        </div>
      </div>
    </div>`;

  window._backToRole = () => showRoleScreen(onAuthed);
  window._sendReset  = async () => {
    const email = (document.getElementById("reset-email")?.value || "").trim();
    const msg   = document.getElementById("reset-msg");
    if (!email || !msg) return;
    try {
      await sendPasswordResetEmail(auth, email);
      msg.className   = "form-success";
      msg.textContent = "✅ Письмо отправлено! Проверьте почту и папку «Спам».";
    } catch (e) {
      msg.className   = "form-error";
      msg.textContent = friendlyError(e.code);
    }
  };
}

// ─── Выход ────────────────────────────────────
export async function logout(onAuthed) {
  try {
    if (typeof window._syncBeforeLogout === "function") {
      await window._syncBeforeLogout();
    }
  } catch {}

  const uid = auth.currentUser?.uid;
  deleteSavedRole(uid);
  await signOut(auth);
  // onAuthStateChanged → user=null → showRoleScreen
}

// ─── Хелперы ──────────────────────────────────
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function friendlyError(code) {
  const map = {
    "auth/user-not-found":         "Пользователь не найден",
    "auth/wrong-password":         "Неверный пароль",
    "auth/invalid-credential":     "Неверная почта или пароль",
    "auth/email-already-in-use":   "Эта почта уже занята",
    "auth/invalid-email":          "Некорректный формат почты",
    "auth/weak-password":          "Пароль слишком простой (минимум 6 символов)",
    "auth/too-many-requests":      "Слишком много попыток. Подождите немного.",
    "auth/network-request-failed": "Нет соединения с интернетом",
    "auth/unauthorized-domain":    "Домен не авторизован в Firebase",
    "auth/operation-not-allowed":  "Вход по email/паролю не включён в Firebase",
  };
  return map[code] || `Ошибка: ${code}`;
}