import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth, connectAuthEmulator, signInWithCustomToken } from "firebase/auth";

// 1. Tentukan Konfigurasi Firebase
// Prioritas: Global Config (dari Flask/System) -> Env Vars (Lokal Dev)
const getFirebaseConfig = () => {
    // Cek apakah ada config global (biasanya di-inject oleh Backend atau System Environment)
    if (typeof window !== 'undefined' && window.firebaseConfig) {
        return window.firebaseConfig;
    }
    
    // Cek environment variables standar Vite
    if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
        return {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
        };
    }

    // Fallback terakhir untuk environment khusus
    if (typeof __firebase_config !== 'undefined') {
        return JSON.parse(__firebase_config);
    }

    throw new Error("Firebase Configuration not found. Please check window.firebaseConfig or .env files.");
};

// 2. Inisialisasi App (Singleton Pattern)
const firebaseConfig = getFirebaseConfig();
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 3. Inisialisasi Services
const db = getFirestore(app);
const auth = getAuth(app);

// 4. Setup Emulator (Opsional, hanya aktif jika di localhost dan ada flag khusus)
if (import.meta.env && import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099');
    console.log("[Firebase] Running in Emulator Mode");
}

/**
 * Fungsi Helper untuk Login menggunakan Custom Token dari Backend (Python/Flask).
 * Ini KRUSIAL untuk SaaS agar user session di React sinkron dengan Python.
 * @param {string} token - Custom auth token yang digenerate oleh Firebase Admin SDK di Python
 */
export const authenticateWithBackendToken = async (token) => {
    if (!token) {
        console.warn("[Firebase] No token provided for authentication.");
        return null;
    }
    try {
        const userCredential = await signInWithCustomToken(auth, token);
        console.log("[Firebase] Authenticated via Custom Token:", userCredential.user.uid);
        return userCredential.user;
    } catch (error) {
        console.error("[Firebase] Custom Token Auth Failed:", error);
        throw error;
    }
};

/**
 * Fungsi helper untuk mendapatkan ID user saat ini secara aman
 */
export const getCurrentUserId = () => {
    const user = auth.currentUser;
    return user ? user.uid : null;
};

// Export services utama
export { app, db, auth };