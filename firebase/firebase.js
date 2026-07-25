import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    serverTimestamp,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCBSrU2VFPtK2OnCkpRo4v5TscZKIjRxXk",
  authDomain: "qr-palm.firebaseapp.com",
  projectId: "qr-palm",
  storageBucket: "qr-palm.firebasestorage.app",
  messagingSenderId: "271464482531",
  appId: "1:271464482531:web:e7682990aae81210a5e7d6"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

export {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    getDoc
};