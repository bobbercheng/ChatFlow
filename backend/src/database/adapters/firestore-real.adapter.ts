import { 
  DatabaseAdapter, 
  QueryOptions, 
  PaginationOptions, 
  PaginationResult, 
  BatchOperation, 
  DatabaseTransaction 
} from './base.adapter';
import { initializeFirestore } from '../../config/firestore';
import * as admin from 'firebase-admin';

export class RealFirestoreAdapter implements DatabaseAdapter {
  private db: admin.firestore.Firestore;

  constructor() {
    const dbInstance = initializeFirestore();
    if (!dbInstance) {
      throw new Error('Failed to initialize Firestore');
    }
    this.db = dbInstance;
  }

  async create<T>(collection: string, id: string, data: T): Promise<T> {
    const docRef = this.db.collection(collection).doc(id);
    const createData = { 
      ...data, 
      id, 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(createData);
    
    // Return with actual timestamps
    const doc = await docRef.get();
    return doc.data() as T;
  }

  async createWithAutoId<T>(collection: string, data: T): Promise<T & { id: string }> {
    const docRef = this.db.collection(collection).doc();
    const result = await this.create(collection, docRef.id, data);
    return result as T & { id: string };
  }

  async findById<T>(collection: string, id: string): Promise<T | null> {
    const doc = await this.db.collection(collection).doc(id).get();
    return doc.exists ? doc.data() as T : null;
  }

  async update<T>(collection: string, id: string, data: Partial<T>): Promise<T> {
    const docRef = this.db.collection(collection).doc(id);
    const updateData = {
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.update(updateData);
    
    const doc = await docRef.get();
    if (!doc.exists) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
    return doc.data() as T;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.db.collection(collection).doc(id).delete();
  }

  async find<T>(collection: string, options: QueryOptions = {}): Promise<T[]> {
    let query: admin.firestore.Query = this.db.collection(collection);
    
    // Apply filters
    if (options.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, this.mapOperator(filter.operator), filter.value);
      }
    }
    
    // Apply ordering
    if (options.orderBy) {
      for (const order of options.orderBy) {
        query = query.orderBy(order.field, order.direction);
      }
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    // Apply startAfter for pagination
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as T);
  }

  async findOne<T>(collection: string, options: QueryOptions = {}): Promise<T | null> {
    const results = await this.find<T>(collection, { ...options, limit: 1 });
    return results.length > 0 ? results[0] ?? null : null;
  }

  async findWithPagination<T>(
    collection: string, 
    options: PaginationOptions & QueryOptions
  ): Promise<PaginationResult<T>> {
    const { page, limit, ...queryOptions } = options;
    
    // Get total count
    const total = await this.count(collection, queryOptions);
    
    // Calculate offset and get data
    const offset = (page - 1) * limit;
    const data = await this.find<T>(collection, { 
      ...queryOptions, 
      limit,
      offset 
    });
    
    const totalPages = Math.ceil(total / limit);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async count(collection: string, options: QueryOptions = {}): Promise<number> {
    let query: admin.firestore.Query = this.db.collection(collection);
    
    // Apply filters
    if (options.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, this.mapOperator(filter.operator), filter.value);
      }
    }
    
    const snapshot = await query.count().get();
    return snapshot.data().count;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    const batch = this.db.batch();
    
    for (const operation of operations) {
      const docRef = this.db.collection(operation.collection).doc(operation.id);
      
      switch (operation.type) {
        case 'create':
          batch.set(docRef, {
            ...operation.data,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          break;
        case 'update':
          batch.update(docRef, {
            ...operation.data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          break;
        case 'delete':
          batch.delete(docRef);
          break;
      }
    }
    
    await batch.commit();
  }

  async runTransaction<T>(updateFunction: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (t) => {
      const transaction: DatabaseTransaction = {
        get: async <T>(collection: string, id: string): Promise<T | null> => {
          const doc = await t.get(this.db.collection(collection).doc(id));
          return doc.exists ? doc.data() as T : null;
        },
        create: <T>(collection: string, id: string, data: T) => {
          const docRef = this.db.collection(collection).doc(id);
          t.set(docRef, {
            ...data,
            id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        },
        update: <T>(collection: string, id: string, data: Partial<T>) => {
          const docRef = this.db.collection(collection).doc(id);
          t.update(docRef, {
            ...data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        },
        delete: (collection: string, id: string) => {
          const docRef = this.db.collection(collection).doc(id);
          t.delete(docRef);
        }
      };
      
      return updateFunction(transaction);
    });
  }

  async createInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    id: string, 
    data: T
  ): Promise<T> {
    const docRef = this.db
      .collection(parentCollection)
      .doc(parentId)
      .collection(subcollection)
      .doc(id);
      
    const createData = {
      ...data,
      id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await docRef.set(createData);
    
    // Return with actual timestamps
    const doc = await docRef.get();
    return doc.data() as T;
  }

  async findInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    options: QueryOptions = {}
  ): Promise<T[]> {
    let query: admin.firestore.Query = this.db
      .collection(parentCollection)
      .doc(parentId)
      .collection(subcollection);
    
    // Apply filters
    if (options.filters) {
      for (const filter of options.filters) {
        query = query.where(filter.field, this.mapOperator(filter.operator), filter.value);
      }
    }
    
    // Apply ordering
    if (options.orderBy) {
      for (const order of options.orderBy) {
        query = query.orderBy(order.field, order.direction);
      }
    }
    
    // Apply limit
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as T);
  }

  // Helper method to map query operators
  private mapOperator(operator: string): admin.firestore.WhereFilterOp {
    switch (operator) {
      case '==': return '==';
      case '!=': return '!=';
      case '<': return '<';
      case '<=': return '<=';
      case '>': return '>';
      case '>=': return '>=';
      case 'in': return 'in';
      case 'not-in': return 'not-in';
      case 'array-contains': return 'array-contains';
      default: return '==';
    }
  }
} 