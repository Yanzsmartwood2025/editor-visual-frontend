import type { NextApiRequest } from 'next';

export type FirebaseIdentity = { uid: string; email?: string };

const dynamicImport = (moduleName: string) => Function('name', 'return import(name)')(moduleName) as Promise<any>;

async function getFirebaseAdminAuth() {
  const app = await dynamicImport('firebase-admin/app');
  const auth = await dynamicImport('firebase-admin/auth');
  if (!app.getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin no está configurado. Define FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY.');
    app.initializeApp({ credential: app.cert({ projectId, clientEmail, privateKey }) });
  }
  return auth.getAuth();
}

export async function requireFirebaseUser(req: NextApiRequest): Promise<FirebaseIdentity> {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Falta el token Bearer de Firebase.');
  const decoded = await (await getFirebaseAdminAuth()).verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}

export const isFirebaseAdmin = (identity: FirebaseIdentity) =>
  (process.env.FIREBASE_ADMIN_EMAILS || '').split(',').map((email) => email.trim()).filter(Boolean).includes(identity.email || '');
