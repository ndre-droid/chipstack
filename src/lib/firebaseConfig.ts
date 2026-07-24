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
  apiKey: 'AIzaSyCE3qa9T8xvzH8DtysqR6fNFi9l2Zrw_Ds',
  authDomain: 'chipstack-live.firebaseapp.com',
  projectId: 'chipstack-live',
  storageBucket: 'chipstack-live.firebasestorage.app',
  messagingSenderId: '398045544671',
  appId: '1:398045544671:web:6e70bf93ed59197e27e96a',
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
