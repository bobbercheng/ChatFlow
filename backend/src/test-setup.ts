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
      return Promise.resolve({ id, ...data });
    }
    if (collection === 'conversations') {
      return Promise.resolve({ id, ...data });
    }
    if (collection.includes('messages')) {
      return Promise.resolve({ id, ...data });
    }
    return Promise.resolve({ id, ...data });
  }),

  findById: jest.fn().mockImplementation((collection, id) => {
    if (collection === 'users') {
      return Promise.resolve(mockUsers.find(u => u.email === id) || null);
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
      return Promise.resolve({
        data: [mockMessage],
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
    return Promise.resolve({ id, ...data });
  }),

  delete: jest.fn().mockResolvedValue(true),

  // Query operations
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
  findInSubcollection: jest.fn().mockImplementation((_parentCollection, _parentId, subcollection, _options) => {
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

  createInSubcollection: jest.fn().mockImplementation((_parentCollection, _parentId, _subcollection, id, data) => {
    return Promise.resolve({ id, ...data });
  }),

  // Batch operations
  batchWrite: jest.fn().mockResolvedValue(undefined),

  // Transaction operations
  runTransaction: jest.fn().mockImplementation(async (callback) => {
    const mockTransaction = {
      create: jest.fn().mockImplementation((_collection, id, data) => ({ id, ...data })),
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
  firestoreAdapter: mockFirestoreAdapter,
}));

jest.mock('./messaging/adapters/pubsub.adapter', () => ({
  gcpPubSubAdapter: mockPubSubAdapter,
}));

// Mock WebSocket for testing
jest.mock('ws', () => ({
  WebSocket: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    readyState: 1, // OPEN
  })),
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock JWT for testing
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'mock-jwt-token'),
  verify: jest.fn((token) => {
    if (token === 'mock-jwt-token') {
      return { email: 'user@example.com' };
    }
    if (token === 'invalid-token') {
      throw new Error('Invalid token');
    }
    return { email: 'user@example.com' };
  }),
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
process.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8080';
process.env['PUBSUB_EMULATOR_HOST'] = 'localhost:8085';
process.env['GOOGLE_CLOUD_PROJECT'] = 'chatflow-test';
process.env['USE_FIRESTORE'] = 'true';
process.env['USE_PUBSUB'] = 'true';

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
}; 