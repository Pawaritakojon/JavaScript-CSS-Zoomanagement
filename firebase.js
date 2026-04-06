// Firebase config จากโปรเจกต์ของคุณ
export const firebaseConfig = {
  apiKey: "AIzaSyC7ZQWnxM3pEO443pAApqvnI6Rj0a0bd5s",
  authDomain: "sasa-974f7.firebaseapp.com",
  projectId: "sasa-974f7",
  storageBucket: "sasa-974f7.firebasestorage.app",
  messagingSenderId: "37220287522",
  appId: "1:37220287522:web:473e1d635cc61ee11b767b",
  measurementId: "G-CKGCYCTNW8",
};

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,        // ✅ เพิ่มตรงนี้
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  onSnapshot,
  deleteField,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Initial Firebase app
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Mapping ชื่อ collection
const COL = {
  animalTypes: "animalTypes",
  nouns: "nouns",
  enclosures: "enclosures",
  feedItems: "feedItems",
  departments: "departments",
  animals: "animals",
  healthRecords: "healthRecords",
  feedingLogs: "feedingLogs",
  inventory: "inventory",
  purchaseRequests: "purchaseRequests",
  appUsers: "appUsers",
};

export {
  app,
  auth,
  db,
  COL,
  // auth helpers
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
  // firestore helpers
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  setDoc,        // ✅ เพิ่มตรงนี้
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  onSnapshot,
  deleteField,
};