// Adapter factory that selects the appropriate adapters based on environment variables
import { DatabaseAdapter } from './database/adapters/base.adapter';
import { MessagingAdapter } from './messaging/adapters/base.adapter';

// Import mock adapters
import { FirestoreAdapter } from './database/adapters/firestore.adapter';
import { GcpPubSubAdapter } from './messaging/adapters/pubsub.adapter';

// Import real adapters
import { RealFirestoreAdapter } from './database/adapters/firestore-real.adapter';
import { RealGcpPubSubAdapter } from './messaging/adapters/pubsub-real.adapter';

// Singleton instances
let databaseAdapterInstance: DatabaseAdapter | null = null;
let messagingAdapterInstance: MessagingAdapter | null = null;

export function getDatabaseAdapter(): DatabaseAdapter {
  if (!databaseAdapterInstance) {
    const useFirestore = process.env['USE_FIRESTORE'] === 'true';
    const hasEmulatorHost = !!process.env['FIRESTORE_EMULATOR_HOST'];
    
    if (useFirestore && hasEmulatorHost) {
      console.log('Using Real Firestore Adapter (connected to emulator)');
      try {
        databaseAdapterInstance = new RealFirestoreAdapter();
      } catch (error) {
        console.warn('Failed to initialize Real Firestore Adapter, falling back to mock:', error);
        databaseAdapterInstance = new FirestoreAdapter();
      }
    } else if (useFirestore) {
      console.log('Using Real Firestore Adapter (production)');
      try {
        databaseAdapterInstance = new RealFirestoreAdapter();
      } catch (error) {
        console.warn('Failed to initialize Real Firestore Adapter, falling back to mock:', error);
        databaseAdapterInstance = new FirestoreAdapter();
      }
    } else {
      console.log('Using Mock Firestore Adapter');
      databaseAdapterInstance = new FirestoreAdapter();
    }
  }
  
  return databaseAdapterInstance;
}

export function getMessagingAdapter(): MessagingAdapter {
  if (!messagingAdapterInstance) {
    const usePubSub = process.env['USE_PUBSUB'] === 'true';
    const hasEmulatorHost = !!process.env['PUBSUB_EMULATOR_HOST'];
    
    if (usePubSub && hasEmulatorHost) {
      console.log('Using Real GCP Pub/Sub Adapter (connected to emulator)');
      try {
        messagingAdapterInstance = new RealGcpPubSubAdapter();
      } catch (error) {
        console.warn('Failed to initialize Real GCP Pub/Sub Adapter, falling back to mock:', error);
        messagingAdapterInstance = new GcpPubSubAdapter();
      }
    } else if (usePubSub) {
      console.log('Using Real GCP Pub/Sub Adapter (production)');
      try {
        messagingAdapterInstance = new RealGcpPubSubAdapter();
      } catch (error) {
        console.warn('Failed to initialize Real GCP Pub/Sub Adapter, falling back to mock:', error);
        messagingAdapterInstance = new GcpPubSubAdapter();
      }
    } else {
      console.log('Using Mock GCP Pub/Sub Adapter');
      messagingAdapterInstance = new GcpPubSubAdapter();
    }
  }
  
  return messagingAdapterInstance;
}

// Export adapter instances
export const databaseAdapter = getDatabaseAdapter();
export const messagingAdapter = getMessagingAdapter(); 