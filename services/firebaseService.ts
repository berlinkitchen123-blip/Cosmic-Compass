
// services/firebaseService.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg",
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

// Robust singleton initialization for Firebase.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getDatabase(app, firebaseConfig.databaseURL);

console.log("Firebase initialized successfully");

/**
 * Gets or creates a persistent unique ID for this device/browser.
 */
export const getOrGenerateUserId = (): string => {
  let userId = localStorage.getItem('cosmic_user_id');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
    localStorage.setItem('cosmic_user_id', userId);
  }
  return userId;
};

/**
 * Saves the entire app state to Firebase Realtime Database.
 */
export const syncToFirebase = async (userId: string, data: any) => {
  if (!db) {
    // Silent fail or debug log
    // console.warn("Sync skipped: Firebase DB not initialized.");
    return false;
  }
  try {
    const userRef = ref(db, `users/${userId}`);
    await set(userRef, {
      ...data,
      lastUpdated: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Firebase Sync Error:", error);
    return false;
  }
};

/**
 * Saves specifically the chat history to Firebase.
 * Useful for frequent updates during chat without syncing the whole state.
 */
export const saveChatToFirebase = async (userId: string, chatHistory: any[]) => {
  if (!db) return false;
  try {
    const chatRef = ref(db, `users/${userId}/chatHistory`);
    await set(chatRef, chatHistory);
    // Also update timestamp
    const lastUpdatedRef = ref(db, `users/${userId}/lastUpdated`);
    await set(lastUpdatedRef, new Date().toISOString());
    return true;
  } catch (error) {
    console.error("Firebase Chat Save Error:", error);
    return false;
  }
};

/**
 * Fetches the app state from Firebase Realtime Database.
 */
export const loadFromFirebase = async (userId: string): Promise<any | null> => {
  if (!db) return null;
  try {
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error("Firebase Load Error:", error);
    return null;
  }
};
