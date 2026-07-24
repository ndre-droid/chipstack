/**
 * Paste the `firebaseConfig` object from your Firebase project's
 * Project settings -> Your apps -> Web app here. These values are public
 * client identifiers (not secrets) — access is controlled by Firestore
 * security rules, not by hiding this object.
 *
 * Live Session sync (Settings -> Live Session) stays hidden/disabled until
 * this is filled in, so the app works exactly as before if left blank.
 */
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
