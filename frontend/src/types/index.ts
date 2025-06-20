// Shared types (copied from shared package)
export interface PaginationParams {
  page?: number;
  limit?: number;
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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
}

export interface WebSocketMessage {
  type: 'message' | 'typing' | 'user_status' | 'error';
  payload: any;
  timestamp: string;
}

// Frontend-specific types
export interface User {
  email: string;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE';
  content: string;
  createdAt: string;
  updatedAt: string;
  senderDisplayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface CreateMessageRequest {
  conversationId: string;
  content: string;
  messageType?: 'TEXT' | 'IMAGE' | 'FILE';
}

export interface WebSocketEvent {
  type: 'connection' | 'message:new' | 'message:status' | 'message:created' | 'error' | 'echo';
  payload: any;
  timestamp: string;
} 