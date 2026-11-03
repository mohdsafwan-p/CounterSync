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
  // Connected Live Firebase Project: countersync-pos
  // -------------------------------------------------------------
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyA5PfNg_Kn6z4jcA6xsT-jcqD-xftfVgSw",
    authDomain: "countersync-pos.firebaseapp.com",
    projectId: "countersync-pos",
    storageBucket: "countersync-pos.firebasestorage.app",
    messagingSenderId: "2490966151",
    appId: "1:2490966151:web:94bcaaa79d044f7025d822",
    measurementId: "G-FWFVXHEQM5"
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

      if (typeof firebase.analytics === 'function' && config.measurementId) {
        try {
          firebase.analytics();
        } catch (e) {}
      }

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
        throw new Error("Firebase Authentication is not initialized.");
      }

      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Always attempt signInWithPopup first (on both desktop & mobile).
      // signInWithPopup uses window postMessage and is immune to third-party cookie/cross-domain storage blocking.
      try {
        const result = await auth.signInWithPopup(provider);
        sessionStorage.removeItem('cs_auth_redirect_in_progress');
        localStorage.removeItem('cs_auth_redirect_in_progress');
        return result.user;
      } catch (err) {
        if (err.code === 'auth/unauthorized-domain') {
          const domain = window.location.hostname;
          throw new Error(`Domain "${domain}" is not authorized in Firebase. In Firebase Console -> Authentication -> Settings -> Authorized domains, add "${domain}".`);
        }
        if (err.code === 'auth/popup-blocked') {
          console.warn("[CounterSync Firebase] Popup was blocked by browser, falling back to redirect flow...");
          sessionStorage.setItem('cs_auth_redirect_in_progress', 'true');
          localStorage.setItem('cs_auth_redirect_in_progress', 'true');
          await auth.signInWithRedirect(provider);
          return null;
        }
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          console.info("[CounterSync Firebase] Sign-in popup was closed or superseded.");
          return null;
        }
        throw err;
      }
    },

    async getRedirectResult() {
      if (!isInitialized || !auth) return null;
      try {
        const result = await auth.getRedirectResult();
        return result && result.user ? result.user : null;
      } catch (err) {
        if (err.code === 'auth/unauthorized-domain') {
          const domain = window.location.hostname;
          throw new Error(`Domain "${domain}" is not authorized. In Firebase Console -> Authentication -> Settings -> Authorized domains, add "${domain}".`);
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

    // --- SaaS Platform Rentals Synchronization ---
    async syncRentalsToCloud(rentals) {
      if (!isInitialized || !db || isDummyConfig || !rentals) {
        return false;
      }
      try {
        const docRef = db.collection('platform').doc('rentals_registry');
        await docRef.set({
          rentals: JSON.parse(JSON.stringify(rentals)),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastUpdatedISO: new Date().toISOString()
        }, { merge: true });
        return true;
      } catch (err) {
        console.warn("[CounterSync Firebase] Rentals sync notice:", err.message);
        return false;
      }
    },

    listenToRentals(onUpdateCallback) {
      if (!isInitialized || !db || isDummyConfig) {
        return () => {};
      }
      try {
        const docRef = db.collection('platform').doc('rentals_registry');
        return docRef.onSnapshot((snap) => {
          if (snap.exists) {
            const data = snap.data();
            if (data && data.rentals && typeof onUpdateCallback === 'function') {
              onUpdateCallback(data.rentals);
            }
          }
        }, (err) => {
          console.warn("[CounterSync Firebase] Rentals listener notice:", err.message);
        });
      } catch (err) {
        console.error("[CounterSync Firebase] Error listening to rentals:", err);
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
