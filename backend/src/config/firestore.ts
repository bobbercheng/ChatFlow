// Firestore configuration - will be activated after firebase-admin installation
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

let db: admin.firestore.Firestore | null = null;

export const initializeFirestore = () => {
  if (db) {
    return db;
  }

  try {
    // Check if Firebase app is already initialized
    let app: admin.app.App;
    try {
      app = admin.app();
    } catch (error) {
      // Initialize Firebase Admin SDK
      const projectId = process.env['GOOGLE_CLOUD_PROJECT'] || 'chatflow-dev';
      
      if (process.env['FIRESTORE_EMULATOR_HOST']) {
        // Use emulator - no credentials needed
        console.log(`Initializing Firestore with emulator at ${process.env['FIRESTORE_EMULATOR_HOST']}`);
        app = admin.initializeApp({
          projectId: projectId,
        });
      } else {
        // Production - requires service account key
        console.log('Initializing Firestore for production');
        app = admin.initializeApp({
          projectId: projectId,
          // credential: admin.credential.applicationDefault(), // Uses GOOGLE_APPLICATION_CREDENTIALS
        });
      }
    }

    db = getFirestore(app);
    
    // Set emulator settings if needed
    if (process.env['FIRESTORE_EMULATOR_HOST'] && !process.env['NODE_ENV']?.includes('test')) {
      console.log(`Connecting to Firestore emulator at ${process.env['FIRESTORE_EMULATOR_HOST']}`);
    }

    console.log('Firestore initialized successfully');
    return db;
  } catch (error) {
    console.error('Failed to initialize Firestore:', error);
    return null;
  }
};

// Initialize and export the database instance
export { db };

// Initialize on import
initializeFirestore();

// Export types
export type Timestamp = admin.firestore.Timestamp;
export type FieldValue = admin.firestore.FieldValue;
export type DocumentSnapshot = admin.firestore.DocumentSnapshot;
export type QueryDocumentSnapshot = admin.firestore.QueryDocumentSnapshot;
export type WriteBatch = admin.firestore.WriteBatch;
export type Transaction = admin.firestore.Transaction; 