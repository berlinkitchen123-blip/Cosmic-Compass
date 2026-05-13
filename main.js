
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";
import { 
  User, Milestone, Sparkles, Globe, 
  MessageSquare, History, Zap, Compass, RefreshCw,
  Sun, Moon, Star, Send, Trash2, ArrowLeft,
  Camera, Eye, Layout, Info, MapPin, Clock, Share2, BookOpen, Settings, X, Key, Search, Cpu, ExternalLink, AlertTriangle, AlertCircle, Grid3X3, Binary, Sigma
} from 'lucide-react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getDatabase, ref, set, get } from 'firebase/database';

console.log("Cosmic Compass: Initializing (Legacy Main)...");

// -----------------------------------------------------------------------------
// FIREBASE SERVICE & KEY DETECTION
// -----------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyDrFjYv2c322zzCMsgpVttjUz9lWDrBoUg",
  authDomain: "cosmic-compass-5fd5e.firebaseapp.com",
  databaseURL: "https://cosmic-compass-5fd5e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cosmic-compass-5fd5e",
  storageBucket: "cosmic-compass-5fd5e.firebasestorage.app",
  messagingSenderId: "160679439170",
  appId: "1:160679439170:web:bafbb80eb30f64ee9476db"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
// FIX: Explicitly pass databaseURL
const db = getDatabase(app, firebaseConfig.databaseURL);

// NOTE: This file appears to be a legacy monolithic file. 
// The application is now structured using index.tsx -> src/App.tsx -> services/firebaseService.ts.
// If you are seeing this, ensure your index.html points to index.tsx.

// ... (Rest of logic is superseded by src/App.tsx, but kept minimal to avoid syntax errors if loaded)
