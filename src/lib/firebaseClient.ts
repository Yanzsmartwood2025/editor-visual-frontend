export type FirebaseSession = {
  user: { id: string; email: string | null };
  accessToken: string;
};

type FirebaseAuthModule = any;
const dynamicImport = (moduleName: string) => Function('name', 'return import(name)')(moduleName) as Promise<any>;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const configured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

async function firebase() {
  if (!configured()) throw new Error('Firebase Auth no está configurado. Define las variables NEXT_PUBLIC_FIREBASE_* պահանջidas.');
  const [{ getApps, initializeApp }, auth] = await Promise.all([
    dynamicImport('firebase/app'),
    dynamicImport('firebase/auth'),
  ]);
  const app = getApps()[0] || initializeApp(firebaseConfig);
  return { auth: auth.getAuth(app), sdk: auth as FirebaseAuthModule };
}

export const getFirebaseSession = async (): Promise<FirebaseSession | null> => {
  const { auth } = await firebase();
  const user = auth.currentUser;
  if (!user) return null;
  return { user: { id: user.uid, email: user.email }, accessToken: await user.getIdToken() };
};

export const observeFirebaseSession = async (callback: (session: FirebaseSession | null) => void) => {
  const { auth, sdk } = await firebase();
  return sdk.onIdTokenChanged(auth, async (user: any) => {
    callback(user ? { user: { id: user.uid, email: user.email }, accessToken: await user.getIdToken() } : null);
  });
};

export const sendFirebaseEmailLink = async (email: string) => {
  const { auth, sdk } = await firebase();
  const url = `${window.location.origin}/`;
  await sdk.sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true });
  window.localStorage.setItem('nayla.firebase.emailForSignIn', email);
};

export const completeFirebaseEmailLink = async (): Promise<FirebaseSession | null> => {
  const { auth, sdk } = await firebase();
  if (!sdk.isSignInWithEmailLink(auth, window.location.href)) return null;
  const email = window.localStorage.getItem('nayla.firebase.emailForSignIn');
  if (!email) throw new Error('Abre el enlace de verificación en el mismo dispositivo donde solicitaste el acceso.');
  const credential = await sdk.signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem('nayla.firebase.emailForSignIn');
  window.history.replaceState({}, document.title, '/');
  return { user: { id: credential.user.uid, email: credential.user.email }, accessToken: await credential.user.getIdToken() };
};

export const signOutFirebase = async () => {
  const { auth, sdk } = await firebase();
  await sdk.signOut(auth);
};
