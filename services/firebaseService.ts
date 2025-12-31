
// services/firebaseService.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
// @ts-ignore
import { getDatabase, ref, set, get } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyD36DpN2xIGnGhIAXOGTNNjX5ic0XKAc0M",
  authDomain: "cosmic-compass-c381e.firebaseapp.com",
  projectId: "cosmic-compass-c381e",
  storageBucket: "cosmic-compass-c381e.firebasestorage.app",
  messagingSenderId: "128465536584",
  appId: "1:128465536584:web:ff7d978f8abf43dff67a7d"
};

/**
 * Robust singleton initialization for Firebase.
 * Using getApps() to check for existing instances prevents "Firebase: App named '[DEFAULT]' already exists" errors.
 */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/**
 * Initialize Database
 */
export const db = getDatabase(app);

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
 * Fetches the app state from Firebase Realtime Database.
 */
export const loadFromFirebase = async (userId: string): Promise<any | null> => {
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