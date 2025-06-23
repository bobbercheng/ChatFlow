import { 
  DatabaseAdapter, 
  QueryOptions, 
  QueryFilter, 
  PaginationOptions, 
  PaginationResult, 
  BatchOperation, 
  DatabaseTransaction 
} from './base.adapter';

// Shared mock database storage across all instances
const sharedMockDb: Map<string, Map<string, any>> = new Map();
let sharedAutoIdCounter = 1;

// Mock Firestore adapter for development - will be replaced with real implementation
export class FirestoreAdapter implements DatabaseAdapter {
  
  private getCollection(collectionName: string): Map<string, any> {
    if (!sharedMockDb.has(collectionName)) {
      sharedMockDb.set(collectionName, new Map());
    }
    return sharedMockDb.get(collectionName)!;
  }
  
  private generateId(): string {
    return `mock_id_${sharedAutoIdCounter++}`;
  }
  
  async create<T>(collection: string, id: string, data: T): Promise<T> {
    const coll = this.getCollection(collection);
    const createData = { 
      ...data, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date()
    };
    coll.set(id, createData);
    return createData;
  }

  async createWithAutoId<T>(collection: string, data: T): Promise<T & { id: string }> {
    const id = this.generateId();
    const result = await this.create(collection, id, data);
    return result as T & { id: string };
  }

  async findById<T>(collection: string, id: string): Promise<T | null> {
    const coll = this.getCollection(collection);
    const doc = coll.get(id);
    return doc !== undefined ? doc : null;
  }

  async update<T>(collection: string, id: string, data: Partial<T>): Promise<T> {
    const coll = this.getCollection(collection);
    const existing = coll.get(id);
    if (!existing) {
      throw new Error(`Document ${id} not found in collection ${collection}`);
    }
    
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };
    coll.set(id, updated);
    return updated;
  }

  async delete(collection: string, id: string): Promise<void> {
    const coll = this.getCollection(collection);
    coll.delete(id);
  }

  async find<T>(collection: string, options: QueryOptions = {}): Promise<T[]> {
    const coll = this.getCollection(collection);
    let results = Array.from(coll.values()) as T[];
    
    // Apply filters (basic implementation)
    if (options.filters) {
      for (const filter of options.filters) {
        results = results.filter(item => this.applyFilter(item, filter));
      }
    }
    
    // Apply ordering
    if (options.orderBy) {
      results.sort((a, b) => {
        for (const order of options.orderBy!) {
          const aVal = (a as any)[order.field];
          const bVal = (b as any)[order.field];
          const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          if (comparison !== 0) {
            return order.direction === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
    }
    
    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    
    return results;
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
    const total = await this.count(collection, queryOptions);
    const offset = (page - 1) * limit;
    
    const allResults = await this.find<T>(collection, queryOptions);
    const data = allResults.slice(offset, offset + limit);
    
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
    const results = await this.find(collection, options);
    return results.length;
  }

  async batchWrite(operations: BatchOperation[]): Promise<void> {
    // Mock batch write - just execute operations sequentially
    for (const operation of operations) {
      switch (operation.type) {
        case 'create':
          await this.create(operation.collection, operation.id, operation.data);
          break;
        case 'update':
          await this.update(operation.collection, operation.id, operation.data);
          break;
        case 'delete':
          await this.delete(operation.collection, operation.id);
          break;
      }
    }
  }

  async runTransaction<T>(updateFunction: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
    // Mock transaction - just execute directly (no real transaction isolation)
    const transaction: DatabaseTransaction = {
      get: async <T>(collection: string, id: string): Promise<T | null> => {
        return await this.findById<T>(collection, id);
      },
      create: <T>(collection: string, id: string, data: T) => {
        this.create(collection, id, data);
      },
      update: <T>(collection: string, id: string, data: Partial<T>) => {
        this.update(collection, id, data);
      },
      delete: (collection: string, id: string) => {
        this.delete(collection, id);
      }
    };
    
    return updateFunction(transaction);
  }

  async createInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    id: string, 
    data: T
  ): Promise<T> {
    // Mock subcollection as nested collection name
    const collectionName = `${parentCollection}/${parentId}/${subcollection}`;
    return this.create(collectionName, id, data);
  }

  async findInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    options: QueryOptions = {}
  ): Promise<T[]> {
    const collectionName = `${parentCollection}/${parentId}/${subcollection}`;
    return this.find(collectionName, options);
  }

  // Helper method for applying filters in mock implementation
  private applyFilter(item: any, filter: QueryFilter): boolean {
    const value = item[filter.field];
    switch (filter.operator) {
      case '==':
        return value === filter.value;
      case '!=':
        return value !== filter.value;
      case '<':
        return value < filter.value;
      case '<=':
        return value <= filter.value;
      case '>':
        return value > filter.value;
      case '>=':
        return value >= filter.value;
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'not-in':
        return Array.isArray(filter.value) && !filter.value.includes(value);
      case 'array-contains':
        return Array.isArray(value) && value.includes(filter.value);
      default:
        return true;
    }
  }
}

export const firestoreAdapter = new FirestoreAdapter(); 