import { MessageType, ConversationType, ConversationParticipantRole } from './types/firestore';

// Mock Firestore data
const mockUser = {
  email: 'user@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'Bobber Cheng',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser2 = {
  email: 'user2@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'User 2',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser3 = {
  email: 'user3@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'User 3',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUsers = [mockUser, mockUser2, mockUser3];

// Dynamic storage for created data during tests
const dynamicUsers = new Map<string, any>();
const dynamicConversations = new Map<string, any>();
const dynamicSubcollections = new Map<string, Map<string, any[]>>();

const mockMessage = {
  id: 'msg_123456789',
  senderId: 'user@example.com',
  messageType: MessageType.TEXT,
  content: 'Hello, this is a test message',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockConversation = {
  id: 'conv_123456789',
  type: ConversationType.DIRECT,
  participantEmails: ['user@example.com', 'user2@example.com'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock Firestore Adapter
const mockFirestoreAdapter = {
  // Basic CRUD operations
  create: jest.fn().mockImplementation((collection, id, data) => {
    if (collection === 'users') {
      const userData = { id, ...data };
      dynamicUsers.set(id, userData);
      return Promise.resolve(userData);
    }
    if (collection === 'conversations') {
      const conversationData = { id, ...data };
      dynamicConversations.set(id, conversationData);
      return Promise.resolve(conversationData);
    }
    if (collection.includes('messages')) {
      return Promise.resolve({ id, ...data });
    }
    return Promise.resolve({ id, ...data });
  }),

  createWithAutoId: jest.fn().mockImplementation((_collection, data) => {
    const id = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return Promise.resolve({ id, ...data });
  }),

  findById: jest.fn().mockImplementation((collection, id) => {
    if (collection === 'users') {
      // Check dynamic users first (created during tests)
      const dynamicUser = dynamicUsers.get(id);
      if (dynamicUser) {
        return Promise.resolve(dynamicUser);
      }
      // Fall back to static mock users
      return Promise.resolve(mockUsers.find(u => u.email === id) || null);
    }
    if (collection === 'conversations') {
      // Check dynamic conversations first (created during tests)
      const dynamicConversation = dynamicConversations.get(id);
      if (dynamicConversation) {
        return Promise.resolve(dynamicConversation);
      }
      // Only return static mock conversation for the specific hardcoded ID
      if (id === 'conv_1750386041311_fpmswok2p') {
        return Promise.resolve(mockConversation);
      }
      // Return null for non-existent conversation IDs
      return Promise.resolve(null);
    }
    // Handle message subcollection queries - check dynamic storage
    if (collection.includes('messages')) {
      const collectionParts = collection.split('/');
      if (collectionParts.length === 3) {
        const [parentCollection, parentId, subcollection] = collectionParts;
        const parentKey = `${parentCollection}/${parentId}`;
        const parentSubcollections = dynamicSubcollections.get(parentKey);
        if (parentSubcollections && parentSubcollections.has(subcollection)) {
          const messages = parentSubcollections.get(subcollection)!;
          const message = messages.find((msg: any) => msg.id === id);
          if (message) {
            return Promise.resolve(message);
          }
        }
      }
      // Fall back to hardcoded message for compatibility
      if (id === 'msg_1750386041311_abc123def') {
        return Promise.resolve({
          ...mockMessage,
          id: 'msg_1750386041311_abc123def',
          conversationId: 'conv_1750386041311_fpmswok2p',
          senderDisplayName: 'Test User',
        });
      }
    }
    return Promise.resolve(null);
  }),

  find: jest.fn().mockImplementation((collection, options) => {
    if (collection === 'users') {
      return Promise.resolve(mockUsers);
    }
    if (collection === 'conversations') {
      // Handle filtering for direct conversations
      if (options?.filters) {
        const typeFilter = options.filters.find((f: any) => f.field === 'type' && f.value === 'DIRECT');
        const participantFilter = options.filters.find((f: any) => f.field === 'participantEmails' && f.operator === 'array-contains');
        
        if (typeFilter && participantFilter) {
          // Return empty array to simulate no existing direct conversation
          return Promise.resolve([]);
        }
      }
      return Promise.resolve([mockConversation]);
    }
    return Promise.resolve([]);
  }),

  findOne: jest.fn().mockImplementation((collection, _options) => {
    if (collection === 'users') {
      return Promise.resolve(mockUsers[0] || null);
    }
    if (collection === 'conversations') {
      return Promise.resolve(mockConversation);
    }
    return Promise.resolve(null);
  }),

  findMany: jest.fn().mockImplementation((collection, _options) => {
    if (collection === 'users') {
      return Promise.resolve(mockUsers);
    }
    if (collection === 'conversations') {
      return Promise.resolve([mockConversation]);
    }
    return Promise.resolve([]);
  }),

  findWithPagination: jest.fn().mockImplementation((collection, options) => {
    if (collection === 'conversations') {
      return Promise.resolve({
        data: [mockConversation],
        pagination: {
          page: options?.page || 1,
          limit: options?.limit || 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    }
    if (collection.includes('messages')) {
      // Check dynamic storage first for message subcollections
      const collectionParts = collection.split('/');
      if (collectionParts.length === 3) {
        const [parentCollection, parentId, subcollection] = collectionParts;
        const parentKey = `${parentCollection}/${parentId}`;
        
        // Always return static mock message for hardcoded conversation ID to ensure test consistency
        if (parentId === 'conv_1750386041311_fpmswok2p') {
          const testMessage = {
            ...mockMessage,
            id: 'msg_1750386041311_abc123def',
            conversationId: 'conv_1750386041311_fpmswok2p',
            senderDisplayName: 'Test User',
          };
          return Promise.resolve({
            data: [testMessage],
            pagination: {
              page: options?.page || 1,
              limit: options?.limit || 20,
              total: 1,
              totalPages: 1,
              hasNext: false,
              hasPrev: false,
            },
          });
        }
        
        const parentSubcollections = dynamicSubcollections.get(parentKey);
        if (parentSubcollections && parentSubcollections.has(subcollection)) {
          const dynamicMessages = parentSubcollections.get(subcollection)!;
          // Only return dynamic data if it actually has messages for this conversation
          if (dynamicMessages.length > 0) {
            return Promise.resolve({
              data: dynamicMessages,
              pagination: {
                page: options?.page || 1,
                limit: options?.limit || 20,
                total: dynamicMessages.length,
                totalPages: Math.ceil(dynamicMessages.length / (options?.limit || 20)),
                hasNext: false,
                hasPrev: false,
              },
            });
          }
        }
      }
      
      // Fall back to static mock message for compatibility
      const testMessage = {
        ...mockMessage,
        id: 'msg_1750386041311_abc123def',
        conversationId: 'conv_1750386041311_fpmswok2p',
        senderDisplayName: 'Test User',
      };
      return Promise.resolve({
        data: [testMessage],
        pagination: {
          page: options?.page || 1,
          limit: options?.limit || 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    }
    return Promise.resolve({
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    });
  }),

  update: jest.fn().mockImplementation((collection, id, data) => {
    if (collection === 'users') {
      const user = mockUsers.find(u => u.email === id);
      return Promise.resolve({ ...user, ...data });
    }
    if (collection === 'conversations') {
      return Promise.resolve({ ...mockConversation, ...data });
    }
    // Handle message updates - check dynamic storage
    if (collection.includes('messages')) {
      const collectionParts = collection.split('/');
      if (collectionParts.length === 3) {
        const [parentCollection, parentId, subcollection] = collectionParts;
        const parentKey = `${parentCollection}/${parentId}`;
        const parentSubcollections = dynamicSubcollections.get(parentKey);
        if (parentSubcollections && parentSubcollections.has(subcollection)) {
          const messages = parentSubcollections.get(subcollection)!;
          const messageIndex = messages.findIndex((msg: any) => msg.id === id);
          if (messageIndex >= 0) {
            const updatedMessage = { ...messages[messageIndex], ...data };
            messages[messageIndex] = updatedMessage;
            return Promise.resolve(updatedMessage);
          }
        }
      }
      // Fall back to hardcoded message for compatibility
      if (id === 'msg_1750386041311_abc123def') {
        return Promise.resolve({
          ...mockMessage,
          id: 'msg_1750386041311_abc123def',
          conversationId: 'conv_1750386041311_fpmswok2p',
          senderDisplayName: 'Test User',
          ...data,
        });
      }
    }
    return Promise.resolve({ id, ...data });
  }),

  delete: jest.fn().mockImplementation((collection, id) => {
    if (collection === 'conversations') {
      // Check if conversation exists in dynamic storage
      const dynamicConversation = dynamicConversations.get(id);
      if (dynamicConversation) {
        dynamicConversations.delete(id);
        return true;
      }
      // Check if it's the hardcoded conversation
      if (id === 'conv_1750386041311_fpmswok2p') {
        return true;
      }
      // Return false for non-existent conversations
      return false;
    }
    // Handle subcollection paths and messages
    if (collection.includes('/')) {
      const collectionParts = collection.split('/');
      if (collectionParts.length === 3) {
        const [parentCollection, parentId, subcollection] = collectionParts;
        const parentKey = `${parentCollection}/${parentId}`;
        const parentSubcollections = dynamicSubcollections.get(parentKey);
        if (parentSubcollections && parentSubcollections.has(subcollection)) {
          const items = parentSubcollections.get(subcollection)!;
          const itemIndex = items.findIndex((item: any) => item.id === id || item.userId === id);
          if (itemIndex >= 0) {
            items.splice(itemIndex, 1);
            return true;
          }
        }
      }
      return false;
    }
    return true;
  }),

  // Query operations
  count: jest.fn().mockImplementation((collection, _options) => {
    if (collection === 'users') {
      return Promise.resolve(mockUsers.length);
    }
    if (collection === 'conversations') {
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  }),

  findWhere: jest.fn().mockImplementation((collection, _filters) => {
    if (collection === 'conversations') {
      return Promise.resolve([mockConversation]);
    }
    return Promise.resolve([]);
  }),

  findWhereArrayContains: jest.fn().mockImplementation((collection, field, _value) => {
    if (collection === 'conversations' && field === 'participantEmails') {
      return Promise.resolve([mockConversation]);
    }
    return Promise.resolve([]);
  }),

  findWhereArrayContainsAny: jest.fn().mockResolvedValue([]),

  // Subcollection operations
  findInSubcollection: jest.fn().mockImplementation((parentCollection, parentId, subcollection, _options) => {
    // Check dynamic storage first
    const parentKey = `${parentCollection}/${parentId}`;
    const parentSubcollections = dynamicSubcollections.get(parentKey);
    if (parentSubcollections && parentSubcollections.has(subcollection)) {
      const dynamicData = parentSubcollections.get(subcollection)!;
      return Promise.resolve(dynamicData);
    }
    
    // Fall back to static mock data
    if (subcollection === 'participants') {
      return Promise.resolve([
        { userId: 'user@example.com', role: ConversationParticipantRole.ADMIN, joinedAt: new Date() },
        { userId: 'user2@example.com', role: ConversationParticipantRole.MEMBER, joinedAt: new Date() },
      ]);
    }
    if (subcollection === 'messages') {
      return Promise.resolve([mockMessage]);
    }
    if (subcollection === 'status') {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }),

  createInSubcollection: jest.fn().mockImplementation((parentCollection, parentId, subcollection, id, data) => {
    // Create dynamic storage for subcollections
    const parentKey = `${parentCollection}/${parentId}`;
    if (!dynamicSubcollections.has(parentKey)) {
      dynamicSubcollections.set(parentKey, new Map());
    }
    const parentSubcollections = dynamicSubcollections.get(parentKey)!;
    if (!parentSubcollections.has(subcollection)) {
      parentSubcollections.set(subcollection, []);
    }
    const subcollectionData = parentSubcollections.get(subcollection)!;
    const newItem = { id, ...data };
    subcollectionData.push(newItem);
    return Promise.resolve(newItem);
  }),

  // Batch operations
  batchWrite: jest.fn().mockResolvedValue(undefined),

  // Transaction operations
  runTransaction: jest.fn().mockImplementation(async (callback) => {
    const mockTransaction = {
      create: jest.fn().mockImplementation((collection, id, data) => {
        // Store in dynamic storage like the main create method
        if (collection === 'users') {
          const userData = { id, ...data };
          dynamicUsers.set(id, userData);
          return userData;
        }
        if (collection === 'conversations') {
          const conversationData = { id, ...data };
          dynamicConversations.set(id, conversationData);
          return conversationData;
        }
        // Handle subcollection creation (like participants)
        const collectionParts = collection.split('/');
        if (collectionParts.length === 3) {
          const [parentCollection, parentId, subcollection] = collectionParts;
          const parentKey = `${parentCollection}/${parentId}`;
          if (!dynamicSubcollections.has(parentKey)) {
            dynamicSubcollections.set(parentKey, new Map());
          }
          const parentSubcollections = dynamicSubcollections.get(parentKey)!;
          if (!parentSubcollections.has(subcollection)) {
            parentSubcollections.set(subcollection, []);
          }
          const subcollectionData = parentSubcollections.get(subcollection)!;
          const newItem = { id, ...data };
          subcollectionData.push(newItem);
          return newItem;
        }
        return { id, ...data };
      }),
      update: jest.fn().mockImplementation((_collection, id, data) => ({ id, ...data })),
      delete: jest.fn().mockResolvedValue(true),
    };
    return callback(mockTransaction);
  }),

  // Connection status
  isConnected: jest.fn().mockReturnValue(true),
  disconnect: jest.fn().mockResolvedValue(undefined),
};

// Mock GCP Pub/Sub Adapter
const mockPubSubAdapter = {
  publishJson: jest.fn().mockResolvedValue('msg-123'),
  subscribe: jest.fn().mockResolvedValue(undefined),
  unsubscribe: jest.fn().mockResolvedValue(undefined),
  createTopic: jest.fn().mockResolvedValue(undefined),
  createSubscription: jest.fn().mockResolvedValue(undefined),
  checkHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  close: jest.fn().mockResolvedValue(undefined),
};

// Mock the adapters
jest.mock('./database/adapters/firestore.adapter', () => ({
  FirestoreAdapter: jest.fn().mockImplementation(() => mockFirestoreAdapter),
}));

jest.mock('./messaging/adapters/pubsub.adapter', () => ({
  GcpPubSubAdapter: jest.fn().mockImplementation(() => mockPubSubAdapter),
}));

// Mock the main adapters module
jest.mock('./adapters', () => ({
  getDatabaseAdapter: jest.fn(() => mockFirestoreAdapter),
  getMessagingAdapter: jest.fn(() => mockPubSubAdapter),
  databaseAdapter: mockFirestoreAdapter,
  messagingAdapter: mockPubSubAdapter,
}));

// Mock Search Service
const mockSearchService = {
  semanticSearch: jest.fn().mockResolvedValue([
    {
      messageId: 'msg-1',
      conversationId: 'conv_1750455035529_abc123',
      senderId: 'user1@example.com',
      senderDisplayName: 'User One',
      content: "Let's have lunch at the new restaurant",
      highlightedContent: "Let's have **lunch** at the new **restaurant**",
      relevanceScore: 0.95,
      createdAt: new Date('2025-06-21T20:47:52.697Z'),
      conversationContext: {
        participantEmails: ['user1@example.com', 'user2@example.com'],
        conversationType: 'DIRECT',
        summary: 'Lunch discussion',
      },
    },
    {
      messageId: 'msg-2', 
      conversationId: 'conv_1750455035530_def456',
      senderId: 'user2@example.com',
      senderDisplayName: 'User Two',
      content: 'Great idea! What time works for lunch?',
      highlightedContent: 'Great idea! What time works for **lunch**?',
      relevanceScore: 0.87,
      createdAt: new Date('2025-06-21T20:47:52.697Z'),
      conversationContext: {
        participantEmails: ['user1@example.com', 'user2@example.com'],
        conversationType: 'DIRECT',
        summary: 'Time coordination',
      },
    }
  ]),
  getSuggestions: jest.fn().mockResolvedValue([
    { text: 'lunch', type: 'recent', frequency: 5 },
    { text: 'meeting', type: 'popular', frequency: 3 },
    { text: 'project', type: 'trending', frequency: 2 },
  ]),
  indexMessage: jest.fn().mockResolvedValue(undefined),
  indexAllMessages: jest.fn().mockResolvedValue({
    totalConversations: 10,
    totalMessages: 50,
    indexedMessages: 48,
    errors: ['Error 1', 'Error 2'],
    duration: 1500,
  }),
  trackSuggestionClick: jest.fn().mockResolvedValue(undefined),
  trackSearchQuery: jest.fn().mockResolvedValue(undefined),
};

jest.mock('./services/search.service', () => ({
  searchService: mockSearchService,
}));

// Mock WebSocket for testing
class MockWebSocket {
  constructor(url: string, options?: any) {
    this.url = url;
    this.options = options;
    this.readyState = 1; // OPEN
    // Simulate connection events
    setTimeout(() => {
      if (this.onopen) this.onopen({} as any);
    }, 10);
  }
  
  url: string;
  options?: any;
  readyState: number;
  onopen?: (event: any) => void;
  onclose?: (event: any) => void;
  onmessage?: (event: any) => void;
  onerror?: (event: any) => void;
  
  send = jest.fn();
  close = jest.fn((code?: number, reason?: string) => {
    setTimeout(() => {
      if (this.onclose) this.onclose({ code, reason } as any);
    }, 10);
  });
  
  on = jest.fn((event: string, handler: Function) => {
    if (event === 'open') this.onopen = handler as any;
    if (event === 'close') this.onclose = handler as any;
    if (event === 'message') this.onmessage = handler as any;
    if (event === 'error') this.onerror = handler as any;
  });
  
  off = jest.fn();
}

jest.mock('ws', () => {
  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
    WebSocketServer: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  };
});

// Mock JWT for testing
class MockJsonWebTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonWebTokenError';
  }
}

class MockTokenExpiredError extends Error {
  constructor(message: string, expiredAt: Date) {
    super(message);
    this.name = 'TokenExpiredError';
    (this as any).expiredAt = expiredAt;
  }
}

// Store token-to-email mapping for tests
const tokenEmailMap = new Map<string, string>();

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn((payload: { email: string }) => {
    const token = `mock-jwt-token-${Math.random().toString(36).substr(2, 9)}`;
    tokenEmailMap.set(token, payload.email);
    return token;
  }),
  verify: jest.fn((token: string) => {
    if (token === 'invalid-token') {
      throw new MockJsonWebTokenError('Invalid token');
    }
    const email = tokenEmailMap.get(token);
    if (email) {
      return { email };
    }
    // Fallback for any untracked tokens
    return { email: 'user@example.com' };
  }),
  JsonWebTokenError: MockJsonWebTokenError,
  TokenExpiredError: MockTokenExpiredError,
}));

// Mock bcrypt for testing
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era'),
  compare: jest.fn().mockImplementation((password, _hash) => {
    // Mock successful comparison for '123456' against the mock hash
    return Promise.resolve(password === '123456');
  }),
}));

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret';
process.env['GOOGLE_CLOUD_PROJECT'] = 'chatflow-test';
// Force tests to use mock adapters instead of emulator
process.env['USE_FIRESTORE'] = 'false';
process.env['USE_PUBSUB'] = 'false';

// Export mock data for tests
export {
  mockUser,
  mockUser2,
  mockUser3,
  mockUsers,
  mockMessage,
  mockConversation,
  mockFirestoreAdapter,
  mockPubSubAdapter,
  mockSearchService,
};

// Global test setup - runs before all tests

// Comprehensive Firestore mocking for all tests
const mockDoc = {
  set: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue({
    exists: false,
    data: () => null,
    id: 'mock-doc-id',
  }),
  update: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
};

const mockCollection = {
  doc: jest.fn(() => mockDoc),
  add: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn().mockResolvedValue({ 
    docs: [],
    empty: true,
    size: 0
  }),
};

const mockFirestore = {
  collection: jest.fn(() => mockCollection),
  doc: jest.fn(() => mockDoc),
  batch: jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue([]),
  })),
  runTransaction: jest.fn(),
  Timestamp: {
    now: jest.fn(() => ({ 
      toDate: () => new Date(),
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0
    })),
    fromDate: jest.fn((date) => ({ 
      toDate: () => date,
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: 0
    })),
  },
  FieldValue: {
    delete: jest.fn(),
    serverTimestamp: jest.fn(),
    arrayUnion: jest.fn(),
    arrayRemove: jest.fn(),
    increment: jest.fn(),
  },
};

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => mockFirestore),
  initializeApp: jest.fn(),
  credential: {
    applicationDefault: jest.fn(),
    cert: jest.fn(),
  },
  app: jest.fn(() => ({
    firestore: jest.fn(() => mockFirestore),
  })),
}));

// Mock Firebase Admin Firestore module
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockFirestore),
  Timestamp: mockFirestore.Timestamp,
  FieldValue: mockFirestore.FieldValue,
}));

// Mock the Firestore config
jest.mock('./config/firestore', () => ({
  initializeFirestore: jest.fn(() => mockFirestore),
  db: mockFirestore,
  Timestamp: mockFirestore.Timestamp,
  FieldValue: mockFirestore.FieldValue,
}));

// Export mock objects for use in tests
(global as any).mockFirestore = mockFirestore;
(global as any).mockCollection = mockCollection;
(global as any).mockDoc = mockDoc;

// Set up global test environment
beforeEach(() => {
  // Reset all mocks between tests
  jest.clearAllMocks();
  
  // Reset Firestore mocks to default state
  mockDoc.get.mockResolvedValue({
    exists: false,
    data: () => null,
    id: 'mock-doc-id',
  });
  mockDoc.set.mockResolvedValue({});
  mockDoc.update.mockResolvedValue({});
  mockDoc.delete.mockResolvedValue({});
  mockCollection.get.mockResolvedValue({ 
    docs: [],
    empty: true,
    size: 0
  });
  mockCollection.add.mockResolvedValue({ id: 'mock-id' });
});

// Suppress console errors during tests unless explicitly needed
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = jest.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
}); 