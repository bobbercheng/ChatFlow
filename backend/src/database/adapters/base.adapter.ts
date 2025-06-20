// Database adapter abstraction for supporting multiple database backends
export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains';
  value: any;
}

export interface QueryOptions {
  filters?: QueryFilter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' }[];
  limit?: number;
  offset?: number;
  startAfter?: any;
}

export interface DatabaseAdapter {
  // Basic CRUD operations
  create<T>(collection: string, id: string, data: T): Promise<T>;
  createWithAutoId<T>(collection: string, data: T): Promise<T & { id: string }>;
  findById<T>(collection: string, id: string): Promise<T | null>;
  update<T>(collection: string, id: string, data: Partial<T>): Promise<T>;
  delete(collection: string, id: string): Promise<void>;
  
  // Query operations
  find<T>(collection: string, options?: QueryOptions): Promise<T[]>;
  findOne<T>(collection: string, options?: QueryOptions): Promise<T | null>;
  findWithPagination<T>(collection: string, options: PaginationOptions & QueryOptions): Promise<PaginationResult<T>>;
  count(collection: string, options?: QueryOptions): Promise<number>;
  
  // Batch operations
  batchWrite(operations: BatchOperation[]): Promise<void>;
  
  // Transaction operations
  runTransaction<T>(updateFunction: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
  
  // Subcollection operations
  createInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    id: string, 
    data: T
  ): Promise<T>;
  findInSubcollection<T>(
    parentCollection: string, 
    parentId: string, 
    subcollection: string, 
    options?: QueryOptions
  ): Promise<T[]>;
}

export interface BatchOperation {
  type: 'create' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: any;
  subcollection?: {
    parentCollection: string;
    parentId: string;
    subcollection: string;
  };
}

export interface DatabaseTransaction {
  get<T>(collection: string, id: string): Promise<T | null>;
  create<T>(collection: string, id: string, data: T): void;
  update<T>(collection: string, id: string, data: Partial<T>): void;
  delete(collection: string, id: string): void;
} 