
// services/firebaseService.ts

import * as FirebaseApp from 'firebase/app';
import * as FirebaseDatabase from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg",
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

// Initialize Firebase using namespace access to ensure compatibility with various TypeScript module resolution settings.
const app = !FirebaseApp.getApps().length ? FirebaseApp.initializeApp(firebaseConfig) : FirebaseApp.getApp();
const db = FirebaseDatabase.getDatabase(app);

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
 * Saves the entire app state to Firebase.
 */
export const syncToFirebase = async (userId: string, data: any) => {
  try {
    // Accessing database functions through the namespace to maintain consistency with the app initialization fix.
    const userRef = FirebaseDatabase.ref(db, `users/${userId}`);
    await FirebaseDatabase.set(userRef, {
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
 * Fetches the app state from Firebase.
 */
export const loadFromFirebase = async (userId: string): Promise<any | null> => {
  try {
    // Accessing database functions through the namespace to maintain consistency with the app initialization fix.
    const userRef = FirebaseDatabase.ref(db, `users/${userId}`);
    const snapshot = await FirebaseDatabase.get(userRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (error) {
    console.error("Firebase Load Error:", error);
    return null;
  }
};
