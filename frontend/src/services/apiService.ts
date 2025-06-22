import { 
    ApiResponse, 
    LoginRequest, 
    LoginResponse, 
    Message, 
    CreateMessageRequest,
    PaginationResult,
    RegisterRequest,
    User,
    Conversation,
    CreateConversationRequest,
    UpdateMessageRequest,
    IndexMessageRequest
} from '../types/index.js';
import { config } from '../config/environment.js';

const API_BASE_URL = config.API_BASE_URL;

class ApiService {
    private token: string | null = null;

    setToken(token: string): void {
        this.token = token;
        localStorage.setItem('chatflow_token', token);
    }

    getToken(): string | null {
        if (!this.token) {
            this.token = localStorage.getItem('chatflow_token');
        }
        return this.token;
    }

    clearToken(): void {
        this.token = null;
        localStorage.removeItem('chatflow_token');
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<ApiResponse<T>> {
        const url = `${API_BASE_URL}${endpoint}`;
        const token = this.getToken();

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (options.headers) {
            Object.assign(headers, options.headers);
        }

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            return {
                success: false,
                error: {
                    message: 'Network error',
                    code: 'NETWORK_ERROR',
                },
            };
        }
    }

    async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
        return this.request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });
    }

    async getMessages(conversationId: string, page = 1, limit = 20): Promise<ApiResponse<any>> {
        return this.request<any>(`/conversations/${conversationId}/messages?page=${page}&limit=${limit}`);
    }

    async sendMessage(conversationId: string, data: CreateMessageRequest): Promise<ApiResponse<Message>> {
        return this.request<Message>(`/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content: data.content,
                messageType: data.messageType || 'TEXT',
            }),
        });
    }

    async searchConversations(query: string, options: { limit?: number } = {}): Promise<ApiResponse<any>> {
        return this.request<any>('/search/conversations', {
            method: 'POST',
            body: JSON.stringify({
                q: query,
                ...(options.limit && { limit: options.limit }),
            }),
        });
    }

    async getSearchSuggestions(query: string = '', limit = 5): Promise<ApiResponse<any>> {
        const requestBody: { q?: string; limit: number } = {
            limit: limit,
        };
        
        // Only add query field if query is not empty
        if (query && query.trim().length > 0) {
            requestBody.q = query;
        }

        return this.request<any>('/search/suggestions', {
            method: 'POST',
            body: JSON.stringify(requestBody),
        });
    }

    async trackSuggestionClick(query: string, suggestionText: string, suggestionType: string): Promise<ApiResponse<any>> {
        return this.request<any>('/search/suggestions/click', {
            method: 'POST',
            body: JSON.stringify({
                query,
                suggestionText,
                suggestionType,
            }),
        });
    }

    async getConversationMessages(conversationId: string, limit = 50): Promise<ApiResponse<PaginationResult<Message>>> {
        return this.request<PaginationResult<Message>>(`/conversations/${conversationId}/messages?limit=${limit}&page=1`);
    }

    // === Complete OpenAPI Endpoint Coverage ===
    
    // Authentication endpoints
    async register(data: RegisterRequest): Promise<ApiResponse<User>> {
        return this.request<User>('/auth/register', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Users endpoints  
    async getCurrentUser(): Promise<ApiResponse<User>> {
        return this.request<User>('/users/me');
    }

    // Conversations endpoints
    async getConversations(page = 1, limit = 20): Promise<ApiResponse<PaginationResult<Conversation>>> {
        return this.request<PaginationResult<Conversation>>(`/conversations?page=${page}&limit=${limit}`);
    }

    async createConversation(data: CreateConversationRequest): Promise<ApiResponse<Conversation>> {
        return this.request<Conversation>('/conversations', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Message endpoints
    async getMessage(conversationId: string, messageId: string): Promise<ApiResponse<Message>> {
        return this.request<Message>(`/conversations/${conversationId}/messages/${messageId}`);
    }

    async updateMessage(conversationId: string, messageId: string, data: UpdateMessageRequest): Promise<ApiResponse<Message>> {
        return this.request<Message>(`/conversations/${conversationId}/messages/${messageId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteMessage(conversationId: string, messageId: string): Promise<ApiResponse<void>> {
        return this.request<void>(`/conversations/${conversationId}/messages/${messageId}`, {
            method: 'DELETE',
        });
    }

    // Search endpoints (already implemented but adding for completeness)
    async indexMessage(data: IndexMessageRequest): Promise<ApiResponse<{ message: string; messageId: string; conversationId: string }>> {
        return this.request<{ message: string; messageId: string; conversationId: string }>('/search/index', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async indexAllMessages(userOnly = true): Promise<ApiResponse<{
        totalConversations: number;
        totalMessages: number; 
        indexedMessages: number;
        errors: string[];
        duration: number;
        message: string;
    }>> {
        const params = new URLSearchParams({ userOnly: userOnly.toString() });
        return this.request<{
            totalConversations: number;
            totalMessages: number;
            indexedMessages: number;
            errors: string[];
            duration: number;
            message: string;
        }>(`/search/index-all?${params}`, {
            method: 'POST',
        });
    }

    // Get current API base URL for debugging
    getApiBaseUrl(): string {
        return API_BASE_URL;
    }
}

export const apiService = new ApiService(); 