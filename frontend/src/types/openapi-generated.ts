// Generated from OpenAPI schema - DO NOT EDIT MANUALLY
// Run: node scripts/generate-types.js > src/types/openapi-generated.ts

export interface ConversationParticipant {
  userId?: string;
  joinedAt?: string;
  role?: 'ADMIN' | 'MEMBER';
}

export interface User {
  email?: string;
  displayName?: string;
  avatarUrl: string | null;
  isOnline?: boolean;
  lastSeen?: string;
  createdAt?: string;
}

export interface Conversation {
  id?: string;
  createdBy?: string;
  type?: 'DIRECT' | 'GROUP';
  createdAt?: string;
  updatedAt?: string;
  participants?: ConversationParticipant[];
}

export interface Message {
  id?: string;
  conversationId?: string;
  senderId?: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationResult<T = any> {
  data?: T[];
  pagination?: { page?: number; limit?: number; total?: number; totalPages?: number; hasNext?: boolean; hasPrev?: boolean };
}

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: { message?: string; code?: string; details?: any };
}

export interface ErrorResponse {
  success?: boolean;
  error?: { message?: string; code?: string; details?: any };
}

export interface AuthRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends AuthRequest {
  displayName: string;
}

export interface CreateConversationRequest {
  participantEmails: string[];
}

export interface CreateMessageRequest {
  content: any;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
}

export interface UpdateMessageRequest {
  content: any;
}

export interface SearchResult {
  id?: string;
  conversationId?: string;
  senderId?: string;
  content?: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
  createdAt?: string;
  relevanceScore?: number;
  highlights?: string[];
  conversationContext?: { participants?: string[]; createdAt?: string };
}

export interface SearchResponse {
  results?: SearchResult[];
  query?: string;
  totalResults?: number;
  searchTime?: number;
}

export interface SearchSuggestion {
  suggestion?: string;
  type?: 'recent' | 'topic' | 'user' | 'keyword';
  count?: number;
}

export interface ClickTrackingRequest {
  query: any;
  suggestionText: any;
  suggestionType: 'recent' | 'topic' | 'user' | 'keyword' | 'completion' | 'popular' | 'trending';
}

export interface IndexMessageRequest {
  conversationId: string;
  messageId: string;
}

export interface EncryptionMetadata {
  algorithm: 'AES-256-GCM';
  keyId: string;
  iv: string;
  tag: string;
  timestamp?: number;
  nonce?: string;
}

export interface EncryptedField {
  data: string;
  encryption: EncryptionMetadata;
}

export interface KeyMetadata {
  keyId?: string;
  userId: string | null;
  purpose?: 'message' | 'search' | 'suggestion' | 'general';
  algorithm?: 'AES-256-GCM';
  createdAt?: string;
  expiresAt: string | null;
  rotatedFrom: string | null;
  isActive?: boolean;
  version?: number;
}

export interface KeySystemHealth {
  totalKeys?: number;
  activeKeys?: number;
  expiredKeys?: number;
  keysNeedingRotation?: number;
  lastRotation: string | null;
}

export interface KeyRotationRequest {
  keyId?: string;
}

export interface KeyInitializeRequest {
  adminEmail?: string;
}

export interface KeySystemStats {
  health?: KeySystemHealth;
  keysByPurpose?: any;
  keysByUser?: any;
  rotationHistory?: { from?: string; to?: string; rotatedAt?: string }[];
}

export interface CurrentKeyIds {
  keyIds?: { message?: string; search?: string; suggestion?: string };
  version?: string;
  lastUpdated?: string;
  instructions?: { usage?: string; derivation?: string; security?: string };
}

export interface SupportedAlgorithms {
  supported?: { symmetric?: { algorithm?: string; keySize?: number; ivSize?: number; recommended?: boolean; description?: string }[] };
  keyDerivation?: any;
  authentication?: any;
}

export interface KeySystemVersion {
  version?: string;
  apiVersion?: string;
  features?: string[];
  status?: any;
  compatibility?: any;
}

export interface UserKeyContext {
  userEmail?: string;
  keyIds?: { message?: string; search?: string; suggestion?: string };
  derivationMethod?: string;
  instructions?: any;
}

export interface KeyVerificationRequest {
  testData: string;
  purpose?: 'message' | 'search' | 'suggestion';
}

export interface KeyVerificationResult {
  verified?: boolean;
  originalData?: string;
  encryptedData?: EncryptedField;
  decryptedData?: string;
  match?: boolean;
  message?: string;
}

// Frontend-specific types (not in OpenAPI schema)
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface WebSocketMessage {
  type: 'message' | 'typing' | 'user_status' | 'error';
  payload: any;
  timestamp: string;
}

export interface WebSocketEvent {
  type: 'connection' | 'message:new' | 'message:status' | 'message:created' | 'error' | 'echo';
  payload: any;
  timestamp: string;
}
