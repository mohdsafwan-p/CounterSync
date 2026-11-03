/**
 * CounterSync — Firebase Cloud Sync & Authentication Module
 * 
 * Provides:
 * 1. Firebase v10 Compat SDK Initialization
 * 2. Cloud Firestore Real-time Synchronization (onSnapshot)
 * 3. Offline-First Local Persistence (IndexedDB + localStorage fallback)
 * 4. Google Authentication for Event Hosts / Super Admins
 */

(function () {
  'use strict';

  // -------------------------------------------------------------
  // FIREBASE CONFIGURATION
  // Replace the placeholder values below with your Firebase project credentials
  // from Firebase Console -> Project Settings -> General -> Your apps -> Web App
  // -------------------------------------------------------------
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDummyKey_ReplaceWithYourFirebaseApiKey",
    authDomain: "countersync-live.firebaseapp.com",
    projectId: "countersync-live",
    storageBucket: "countersync-live.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
  };

  // Support local override or dynamic configuration from localStorage
  function getActiveConfig() {
    try {
      const custom = localStorage.getItem('countersync_custom_firebase_config');
      if (custom) {
        const parsed = JSON.parse(custom);
        if (parsed && parsed.apiKey && !parsed.apiKey.includes("DummyKey")) {
          return parsed;
        }
      }
    } catch (e) {}
    return DEFAULT_FIREBASE_CONFIG;
  }

  const config = getActiveConfig();

  let app = null;
  let auth = null;
  let db = null;
  let isInitialized = false;
  let isDummyConfig = !config.apiKey || config.apiKey.includes("DummyKey");
  let activeListenerUnsub = null;
  let activeListeningEventKey = null;

  // Initialize Firebase when SDK scripts are available
  function initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn("[CounterSync Firebase] Firebase SDK scripts not loaded. Operating in offline-first mode.");
      return;
    }

    if (isDummyConfig) {
      console.info("[CounterSync Firebase] Running with default placeholder config. To connect your live cloud database, update js/firebase-config.js with your Firebase credentials.");
    }

    try {
      if (!firebase.apps.length) {
        app = firebase.initializeApp(config);
      } else {
        app = firebase.app();
      }

      auth = firebase.auth();
      db = firebase.firestore();

      // Enable offline persistence in Firestore so all reads and writes
      // are cached in local IndexedDB automatically and work without internet!
      db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn("[CounterSync Firebase] Multi-tab persistence: Firestore persistence enabled in another active tab.");
        } else if (err.code === 'unimplemented') {
          console.warn("[CounterSync Firebase] Browser does not support Firestore IndexedDB persistence.");
        }
      });

      isInitialized = true;
      console.log("[CounterSync Firebase] Firebase initialized successfully with Firestore & Auth.");
    } catch (err) {
      console.error("[CounterSync Firebase] Initialization error:", err);
    }
  }

  // Attempt immediate initialization
  initFirebase();

  // Expose Global CounterSync Firebase Service Interface
  window.CS_Firebase = {
    get isReady() {
      return isInitialized && !isDummyConfig;
    },
    get isInitialized() {
      return isInitialized;
    },
    get isDummy() {
      return isDummyConfig;
    },
    get auth() {
      return auth;
    },
    get db() {
      return db;
    },

    getConfig() {
      return { ...config };
    },

    saveCustomConfig(newConfig) {
      try {
        localStorage.setItem('countersync_custom_firebase_config', JSON.stringify(newConfig));
        location.reload();
      } catch (e) {
        console.error("Failed to save custom config:", e);
      }
    },

    // --- Google Authentication ---
    async signInWithGoogle() {
      if (!isInitialized || !auth) {
        throw new Error("Firebase Authentication is not initialized. Please configure your Firebase API Key in js/firebase-config.js.");
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        const result = await auth.signInWithPopup(provider);
        return result.user;
      } catch (err) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
          console.warn("Popup blocked or closed, falling back to redirect flow...");
          return auth.signInWithRedirect(provider);
        }
        throw err;
      }
    },

    async signOut() {
      if (auth) {
        await auth.signOut();
      }
    },

    onAuthStateChanged(callback) {
      if (auth) {
        return auth.onAuthStateChanged(callback);
      }
      return () => {};
    },

    getCurrentUser() {
      return auth ? auth.currentUser : null;
    },

    // --- Real-Time Firestore Synchronization ---
    /**
     * Push event data to Firestore cloud document: events/{eventKey}
     * Offline-first: Firestore automatically writes to local IndexedDB first,
     * then synchronizes upstream as soon as an internet connection is active.
     */
    async syncEventToCloud(eventKey, eventData) {
      if (!isInitialized || !db || isDummyConfig || !eventKey) {
        return false;
      }

      const cleanKey = String(eventKey).toUpperCase().trim();
      try {
        const docRef = db.collection('events').doc(cleanKey);
        
        // Deep clone to prevent mutating live local state
        const payload = JSON.parse(JSON.stringify(eventData));
        payload.cloudLastUpdated = new Date().toISOString();
        payload.cloudSyncedAt = firebase.firestore.FieldValue.serverTimestamp();

        await docRef.set(payload, { merge: true });
        return true;
      } catch (err) {
        console.warn(`[CounterSync Firebase] Cloud write queued locally for event ${cleanKey}:`, err.message);
        return false;
      }
    },

    /**
     * Listen in real-time to changes on event document: events/{eventKey}
     * Triggers onSnapshot whenever any mobile counter or laptop records a sale,
     * accepts a dispatch, transfers copies, or fulfills a pre-order.
     */
    listenToEvent(eventKey, onUpdateCallback) {
      if (!isInitialized || !db || isDummyConfig || !eventKey) {
        return () => {};
      }

      const cleanKey = String(eventKey).toUpperCase().trim();

      // Avoid duplicate listeners for the same event key
      if (activeListenerUnsub && activeListeningEventKey === cleanKey) {
        return activeListenerUnsub;
      }

      if (activeListenerUnsub) {
        activeListenerUnsub();
        activeListenerUnsub = null;
      }

      activeListeningEventKey = cleanKey;

      try {
        const docRef = db.collection('events').doc(cleanKey);
        
        activeListenerUnsub = docRef.onSnapshot(
          { includeMetadataChanges: false },
          (docSnapshot) => {
            if (docSnapshot.exists) {
              const cloudData = docSnapshot.data();
              if (cloudData && typeof onUpdateCallback === 'function') {
                onUpdateCallback(cloudData, docSnapshot.metadata.hasPendingWrites);
              }
            } else {
              // Document doesn't exist in cloud yet; push current local state to cloud
              if (window.CS_Store) {
                const localEv = window.CS_Store.getEvent(cleanKey);
                if (localEv) {
                  window.CS_Firebase.syncEventToCloud(cleanKey, localEv);
                }
              }
            }
          },
          (error) => {
            console.warn(`[CounterSync Firebase] Real-time listener notice for ${cleanKey}:`, error.message);
          }
        );

        return activeListenerUnsub;
      } catch (err) {
        console.error(`[CounterSync Firebase] Error attaching listener to ${cleanKey}:`, err);
        return () => {};
      }
    },

    stopListening() {
      if (activeListenerUnsub) {
        activeListenerUnsub();
        activeListenerUnsub = null;
        activeListeningEventKey = null;
      }
    }
  };

  // Auto-init listener if SDK loads after this script
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      if (!isInitialized && typeof firebase !== 'undefined') {
        initFirebase();
      }
    });
  }
})();
