import { ConversationParticipantRole, ConversationType, MessageType } from '@prisma/client';

// Mock Prisma Client for tests
const mockUser = {
  email: 'user@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'Bobber Cheng',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
};

const mockUser2 = {
  email: 'user2@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'User 2',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
};

const mockUser3 = {
  email: 'user3@example.com',
  hashedPassword: '$2b$12$zlSenvQ/Ys2humEox9oR/.KbMh2Fny2j0..LQUyQO5JNETW3Z/era',
  displayName: 'User 3',
  avatarUrl: null,
  isOnline: false,
  lastSeen: new Date(),
  createdAt: new Date(),
};

const mockUsers = [mockUser, mockUser2, mockUser3];

const mockMessage = {
  id: '123e4567-e89b-12d3-a456-426614174001',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  senderId: 'user@example.com',
  messageType: MessageType.TEXT,
  content: 'Hello, this is a test message',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMessages = [mockMessage];

jest.mock('@prisma/client', () => ({
  ConversationParticipantRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER'
  },
  ConversationType: {
    DIRECT: 'DIRECT',
    GROUP: 'GROUP'
  },
  MessageType: {
    TEXT: 'TEXT',
    IMAGE: 'IMAGE',
    FILE: 'FILE'
  },
  PrismaClient: jest.fn().mockImplementation(() => ({
    user: {
      create: jest.fn().mockImplementation(({ data }) => {
        const newUser = { ...mockUser, ...data };
        return Promise.resolve(newUser);
      }),
      findUnique: jest.fn().mockImplementation(({ where }) => {
        const user = mockUsers.find(u => u.email === where.email);
        return Promise.resolve(user || null);
      }),
      findMany: jest.fn().mockImplementation(({ where }) => {
        if (where?.email?.in) {
          return Promise.resolve(mockUsers.filter(u => where.email.in.includes(u.email)));
        }
        return Promise.resolve(mockUsers);
      }),
      update: jest.fn().mockResolvedValue(mockUser),
      delete: jest.fn().mockResolvedValue(mockUser),
    },
    conversation: {
      create: jest.fn().mockImplementation(({ data }) => {
        const conversation = {
          id: 'mock-conversation-id',
          createdBy: data.createdBy,
          type: data.type, // This will use the type passed from the service
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return Promise.resolve(conversation);
      }),
      findUnique: jest.fn().mockImplementation(({ where, include }) => {
        if (include?.participants) {
          return Promise.resolve({
            id: where.id,
            createdBy: 'user@example.com',
            type: ConversationType.DIRECT,
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [
              { userId: 'user@example.com', joinedAt: new Date(), role: ConversationParticipantRole.ADMIN },
              { userId: 'user2@example.com', joinedAt: new Date(), role: ConversationParticipantRole.MEMBER }
            ]
          });
        }
        return Promise.resolve({
          id: where.id,
          createdBy: 'user@example.com',
          type: ConversationType.DIRECT,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }),
      findMany: jest.fn().mockImplementation(({ include }) => {
        const conversations = [];
        if (include?.participants) {
          conversations.push({
            id: '123e4567-e89b-12d3-a456-426614174000',
            createdBy: 'user@example.com',
            type: ConversationType.DIRECT,
            createdAt: new Date(),
            updatedAt: new Date(),
            participants: [
              { userId: 'user@example.com', joinedAt: new Date(), role: ConversationParticipantRole.ADMIN },
              { userId: 'user2@example.com', joinedAt: new Date(), role: ConversationParticipantRole.MEMBER }
            ]
          });
        }
        return Promise.resolve(conversations);
      }),
      findFirst: jest.fn().mockResolvedValue(null), // For existing direct conversation check
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    message: {
      create: jest.fn().mockImplementation(({ data, include }) => {
        const newMessage = {
          id: '123e4567-e89b-12d3-a456-426614174001',
          conversationId: data.conversationId,
          senderId: data.senderId,
          messageType: data.messageType || MessageType.TEXT,
          content: data.content,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        if (include?.sender) {
          return {
            ...newMessage,
            sender: {
              email: data.senderId,
              displayName: mockUsers.find(u => u.email === data.senderId)?.displayName || 'Unknown User',
            },
          };
        }
        
        return newMessage;
      }),
      findMany: jest.fn().mockImplementation(({ where, include }) => {
        let messages = mockMessages.filter(m => 
          !where.conversationId || m.conversationId === where.conversationId
        );
        
        if (include?.sender) {
          messages = messages.map(m => ({
            ...m,
            sender: {
              email: m.senderId,
              displayName: mockUsers.find(u => u.email === m.senderId)?.displayName || 'Unknown User',
            },
          }));
        }
        
        return Promise.resolve(messages);
      }),
      findUnique: jest.fn().mockImplementation(({ where, include }) => {
        const message = mockMessages.find(m => m.id === where.id);
        if (!message) return Promise.resolve(null);
        
        if (include?.sender) {
          return Promise.resolve({
            ...message,
            sender: {
              email: message.senderId,
              displayName: mockUsers.find(u => u.email === message.senderId)?.displayName || 'Unknown User',
            },
          });
        }
        
        return Promise.resolve(message);
      }),
      update: jest.fn().mockImplementation(({ where, data, include }) => {
        const message = mockMessages.find(m => m.id === where.id);
        if (!message) throw new Error('Message not found');
        
        const updatedMessage = {
          ...message,
          ...data,
          updatedAt: new Date(),
        };
        
        if (include?.sender) {
          return Promise.resolve({
            ...updatedMessage,
            sender: {
              email: updatedMessage.senderId,
              displayName: mockUsers.find(u => u.email === updatedMessage.senderId)?.displayName || 'Unknown User',
            },
          });
        }
        
        return Promise.resolve(updatedMessage);
      }),
      delete: jest.fn().mockResolvedValue(mockMessage),
      count: jest.fn().mockResolvedValue(1),
    },
    conversationParticipant: {
      create: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      findMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        conversationId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user@example.com',
        joinedAt: new Date(),
        role: ConversationParticipantRole.ADMIN
      }),
      delete: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (fn) => {
      // Create a mock transaction client that behaves like the normal client
      let lastCreatedType = ConversationType.DIRECT; // Default type
      
      const mockTx = {
        conversation: {
          create: jest.fn().mockImplementation(({ data }) => {
            lastCreatedType = data.type; // Store the type
            return {
              id: '123e4567-e89b-12d3-a456-426614174000',
              createdBy: data.createdBy,
              type: data.type, // This will use the type passed from the service
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
          findUnique: jest.fn().mockImplementation(({ where, include }) => {
            if (include?.participants) {
              return {
                id: where.id || '123e4567-e89b-12d3-a456-426614174000',
                createdBy: 'user@example.com',
                type: lastCreatedType, // Use the stored type
                createdAt: new Date(),
                updatedAt: new Date(),
                participants: [
                  { userId: 'user@example.com', joinedAt: new Date(), role: ConversationParticipantRole.ADMIN },
                  { userId: 'user2@example.com', joinedAt: new Date(), role: ConversationParticipantRole.MEMBER }
                ]
              };
            }
            return {
              id: where.id || '123e4567-e89b-12d3-a456-426614174000',
              createdBy: 'user@example.com',
              type: lastCreatedType, // Use the stored type
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }),
          update: jest.fn().mockImplementation(({ where, data }) => {
            return {
              id: where.id || '123e4567-e89b-12d3-a456-426614174000',
              createdBy: 'user@example.com',
              type: lastCreatedType,
              createdAt: new Date(),
              updatedAt: data.updatedAt || new Date(),
            };
          }),
        },
        conversationParticipant: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        message: {
          create: jest.fn().mockImplementation(({ data, include }) => {
            const newMessage = {
              id: '123e4567-e89b-12d3-a456-426614174001',
              conversationId: data.conversationId,
              senderId: data.senderId,
              messageType: data.messageType || MessageType.TEXT,
              content: data.content,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            if (include?.sender) {
              return {
                ...newMessage,
                sender: {
                  email: data.senderId,
                  displayName: mockUsers.find(u => u.email === data.senderId)?.displayName || 'Unknown User',
                },
              };
            }
            
            return newMessage;
          }),
        },
      };
      return fn(mockTx);
    }),
    $disconnect: jest.fn(),
  })),
}));

// Set test environment variables
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret'; 