// =============================================
// firebase.js — подключение Firebase
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHg9Pe-gFazGByVuH0TUyLgiabmyhKUXU",
  authDomain: "oge-trenazher.firebaseapp.com",
  projectId: "oge-trenazher",
  storageBucket: "oge-trenazher.firebasestorage.app",
  messagingSenderId: "833889535362",
  appId: "1:833889535362:web:4316c46995d3df06913b9b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
