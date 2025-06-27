import { 
    ApiResponse, 
    AuthRequest, 
    LoginResponse, 
    Message, 
    CreateMessageRequest,
    PaginationResult,
    RegisterRequest,
    User,
    Conversation,
    CreateConversationRequest,
    UpdateMessageRequest,
    IndexMessageRequest,
    // Key Management Types
    CurrentKeyIds,
    SupportedAlgorithms,
    KeySystemVersion,
    UserKeyContext,
    KeyVerificationRequest,
    KeyVerificationResult,
    KeySystemHealth,
    KeyMetadata,
    KeyRotationRequest,
    KeyInitializeRequest,
    KeySystemStats
} from '../types/index.js';
import { config } from '../config/environment.js';
import { encryptionService, EncryptedField, KeyContext } from '../utils/encryption.js';

const API_BASE_URL = config.API_BASE_URL;

class ApiService {
    private token: string | null = null;
    private isEncryptionInitialized = false;

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
        // Clear encryption when logging out
        encryptionService.clearKeys();
        this.isEncryptionInitialized = false;
    }

    /**
     * Initialize encryption system after authentication
     */
    async initializeEncryption(): Promise<void> {
        if (this.isEncryptionInitialized) {
            console.info('🔐 Encryption already initialized');
            return;
        }

        try {
            console.info('🔐 Initializing encryption system...');
            
            // Get current keyIds and user context
            const [keyResponse, contextResponse] = await Promise.all([
                this.getCurrentKeyIds(),
                this.getUserKeyContext()
            ]);

            if (!keyResponse.success || !contextResponse.success) {
                throw new Error('Failed to get encryption context from server');
            }

            // Build key context for encryption service
            if (!keyResponse.data?.keyIds?.message || !keyResponse.data?.keyIds?.search || !keyResponse.data?.keyIds?.suggestion) {
                throw new Error('Incomplete keyIds received from server');
            }

            if (!contextResponse.data?.userEmail) {
                throw new Error('User email not available in key context');
            }

            const keyContext: KeyContext = {
                keyIds: {
                    message: keyResponse.data.keyIds.message,
                    search: keyResponse.data.keyIds.search,
                    suggestion: keyResponse.data.keyIds.suggestion
                },
                userEmail: contextResponse.data.userEmail,
                salt: 'salt' // Use same salt as backend
            };

            // Initialize encryption service
            await encryptionService.initialize(keyContext);

            // Verify encryption is working
            const verificationResult = await this.verifyUserKeys({
                testData: 'ChatFlow encryption test',
                purpose: 'message'
            });

            if (!verificationResult.success || !verificationResult.data?.verified) {
                throw new Error('Encryption verification failed');
            }

            this.isEncryptionInitialized = true;
            console.info('🔐 Encryption system initialized successfully');

        } catch (error) {
            console.error('🔐 Failed to initialize encryption:', error);
            throw new Error('Failed to initialize encryption system');
        }
    }

    /**
     * Check if encryption is ready
     */
    isEncryptionReady(): boolean {
        return this.isEncryptionInitialized && encryptionService.isReady();
    }

    /**
     * Recursively decrypt encrypted fields in an object or array
     */
    private async decryptResponseFields(data: any): Promise<number> {
        if (!data || typeof data !== 'object') {
            return 0;
        }

        let decryptedCount = 0;

        // Sensitive field names that might be encrypted
        const sensitiveFields = [
            'content', 'body', 'text', 'query', 'suggestion', 'suggestionText',
            'rawContent', 'semanticContent', 'highlightedContent'
        ];

        if (Array.isArray(data)) {
            // Handle arrays
            for (const item of data) {
                decryptedCount += await this.decryptResponseFields(item);
            }
        } else {
            // Handle objects
            for (const [key, value] of Object.entries(data)) {
                if (sensitiveFields.includes(key) && encryptionService.isEncryptedField(value)) {
                    try {
                        const decryptedValue = await encryptionService.decryptField(value as EncryptedField);
                        (data as any)[key] = decryptedValue;
                        decryptedCount++;
                    } catch (error) {
                        console.error(`Failed to decrypt field '${key}':`, error);
                        // Continue with other fields
                    }
                } else if (value && typeof value === 'object') {
                    // Recursively check nested objects and arrays
                    decryptedCount += await this.decryptResponseFields(value);
                }
            }
        }

        return decryptedCount;
    }

    /**
     * Refresh encryption keys (for key rotation)
     */
    async refreshEncryptionKeys(): Promise<void> {
        console.info('🔄 Refreshing encryption keys...');
        
        try {
            const [keyResponse, contextResponse] = await Promise.all([
                this.getCurrentKeyIds(),
                this.getUserKeyContext()
            ]);

            if (!keyResponse.success || !contextResponse.success) {
                throw new Error('Failed to get updated encryption context');
            }

            if (!keyResponse.data?.keyIds?.message || !keyResponse.data?.keyIds?.search || !keyResponse.data?.keyIds?.suggestion) {
                throw new Error('Incomplete keyIds received from server');
            }

            if (!contextResponse.data?.userEmail) {
                throw new Error('User email not available in key context');
            }

            const keyContext: KeyContext = {
                keyIds: {
                    message: keyResponse.data.keyIds.message,
                    search: keyResponse.data.keyIds.search,
                    suggestion: keyResponse.data.keyIds.suggestion
                },
                userEmail: contextResponse.data.userEmail,
                salt: 'salt' // Use same salt as backend
            };

            await encryptionService.refreshKeys(keyContext);
            console.info('🔄 Encryption keys refreshed successfully');

        } catch (error) {
            console.error('🔄 Failed to refresh encryption keys:', error);
            throw error;
        }
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

    async login(credentials: AuthRequest): Promise<ApiResponse<LoginResponse>> {
        return this.request<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });
    }

    async getMessages(conversationId: string, page = 1, limit = 20): Promise<ApiResponse<any>> {
        const response = await this.request<any>(`/conversations/${conversationId}/messages?page=${page}&limit=${limit}`);
        
        // Decrypt messages if encryption is available and messages are encrypted
        if (response.success && response.data && this.isEncryptionReady()) {
            try {
                const decryptedCount = await this.decryptResponseFields(response.data);
                if (decryptedCount > 0) {
                    console.info(`🔓 Decrypted ${decryptedCount} fields in messages response`);
                }
            } catch (error) {
                console.error('Failed to decrypt messages:', error);
                // Continue with encrypted data rather than failing completely
            }
        }
        
        return response;
    }

    async sendMessage(conversationId: string, data: CreateMessageRequest): Promise<ApiResponse<Message>> {
        let contentToSend = data.content;

        // Encrypt message content if encryption is available and content is a string
        if (this.isEncryptionReady() && typeof data.content === 'string') {
            try {
                contentToSend = await encryptionService.encryptMessage(data.content);
                console.info('🔐 Encrypted message content');
            } catch (error) {
                console.error('Failed to encrypt message content:', error);
                // Continue with plain text if encryption fails
            }
        }

        const response = await this.request<Message>(`/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content: contentToSend,
                messageType: data.messageType || 'TEXT',
            }),
        });

        // Decrypt the response if it contains encrypted content
        if (response.success && response.data && this.isEncryptionReady()) {
            try {
                const decryptedCount = await this.decryptResponseFields(response.data);
                if (decryptedCount > 0) {
                    console.info(`🔓 Decrypted ${decryptedCount} fields in message response`);
                }
            } catch (error) {
                console.error('Failed to decrypt response message content:', error);
            }
        }

        return response;
    }

    async searchConversations(query: string, options: { limit?: number } = {}): Promise<ApiResponse<any>> {
        let queryToSend: string | EncryptedField = query;

        // Encrypt search query if encryption is available
        if (this.isEncryptionReady() && query.trim()) {
            try {
                queryToSend = await encryptionService.encryptSearchQuery(query);
                console.info('🔐 Encrypted search query');
            } catch (error) {
                console.error('Failed to encrypt search query:', error);
                // Continue with plain text if encryption fails
            }
        }

        const response = await this.request<any>('/search/conversations', {
            method: 'POST',
            body: JSON.stringify({
                q: queryToSend,
                ...(options.limit && { limit: options.limit }),
            }),
        });

        // Decrypt search results if encryption is available and results contain encrypted content
        if (response.success && response.data && this.isEncryptionReady()) {
            try {
                const decryptedCount = await this.decryptResponseFields(response.data);
                if (decryptedCount > 0) {
                    console.info(`🔓 Decrypted ${decryptedCount} fields in search conversation results`);
                }
            } catch (error) {
                console.error('Failed to decrypt search results:', error);
                // Continue with encrypted data rather than failing completely
            }
        }

        return response;
    }

    async getSearchSuggestions(query: string = '', limit = 5): Promise<ApiResponse<any>> {
        const requestBody: { q?: string | EncryptedField; limit: number } = {
            limit: limit,
        };
        
        // Only add query field if query is not empty, with encryption if available
        if (query && query.trim().length > 0) {
            if (this.isEncryptionReady()) {
                try {
                    requestBody.q = await encryptionService.encryptSuggestion(query);
                    console.info('🔐 Encrypted suggestion query');
                } catch (error) {
                    console.error('Failed to encrypt suggestion query:', error);
                    requestBody.q = query; // Fallback to plain text
                }
            } else {
                requestBody.q = query;
            }
        }

        const response = await this.request<any>('/search/suggestions', {
            method: 'POST',
            body: JSON.stringify(requestBody),
        });

        // Decrypt suggestions if encryption is available and suggestions are encrypted
        if (response.success && response.data && this.isEncryptionReady()) {
            try {
                const decryptedCount = await this.decryptResponseFields(response.data);
                if (decryptedCount > 0) {
                    console.info(`🔓 Decrypted ${decryptedCount} fields in search suggestions response`);
                }
            } catch (error) {
                console.error('Failed to decrypt search suggestions:', error);
                // Continue with encrypted data rather than failing completely
            }
        }

        return response;
    }

    async trackSuggestionClick(query: string, suggestionText: string, suggestionType: string): Promise<ApiResponse<any>> {
        let queryToSend: string | EncryptedField = query;
        let suggestionToSend: string | EncryptedField = suggestionText;

        // Encrypt suggestion tracking data if encryption is available
        if (this.isEncryptionReady()) {
            try {
                queryToSend = await encryptionService.encryptSuggestion(query);
                suggestionToSend = await encryptionService.encryptSuggestion(suggestionText);
                console.info('🔐 Encrypted suggestion click tracking data');
            } catch (error) {
                console.error('Failed to encrypt suggestion tracking data:', error);
                // Continue with plain text if encryption fails
            }
        }

        return this.request<any>('/search/suggestions/click', {
            method: 'POST',
            body: JSON.stringify({
                query: queryToSend,
                suggestionText: suggestionToSend,
                suggestionType, // This remains plain text for analytics
            }),
        });
    }

    async getConversationMessages(conversationId: string, limit = 50): Promise<ApiResponse<PaginationResult<Message>>> {
        const response = await this.request<PaginationResult<Message>>(`/conversations/${conversationId}/messages?limit=${limit}&page=1`);
        
        // Decrypt messages if encryption is available and messages are encrypted
        if (response.success && response.data && this.isEncryptionReady()) {
            try {
                const decryptedCount = await this.decryptResponseFields(response.data);
                if (decryptedCount > 0) {
                    console.info(`🔓 Decrypted ${decryptedCount} fields in conversation messages response`);
                }
            } catch (error) {
                console.error('Failed to decrypt conversation messages:', error);
                // Continue with encrypted data rather than failing completely
            }
        }
        
        return response;
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

    async getConversation(conversationId: string): Promise<ApiResponse<Conversation>> {
        return this.request<Conversation>(`/conversations/${conversationId}`);
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

    // === Key Management Endpoints ===

    // Public Key Coordination endpoints
    async getCurrentKeyIds(): Promise<ApiResponse<CurrentKeyIds>> {
        return this.request<CurrentKeyIds>('/keys/current');
    }

    async getSupportedAlgorithms(): Promise<ApiResponse<SupportedAlgorithms>> {
        return this.request<SupportedAlgorithms>('/keys/algorithms');
    }

    async getKeySystemVersion(): Promise<ApiResponse<KeySystemVersion>> {
        return this.request<KeySystemVersion>('/keys/version');
    }

    async getKeySystemHealthPublic(): Promise<ApiResponse<{
        status: 'healthy' | 'degraded';
        encryption: 'available' | 'limited';
        lastUpdate: string;
        message: string;
    }>> {
        return this.request<{
            status: 'healthy' | 'degraded';
            encryption: 'available' | 'limited';
            lastUpdate: string;
            message: string;
        }>('/keys/health');
    }

    // User Key Context endpoints
    async getUserKeyContext(): Promise<ApiResponse<UserKeyContext>> {
        return this.request<UserKeyContext>('/users/me/keys/context');
    }

    async verifyUserKeys(data: KeyVerificationRequest): Promise<ApiResponse<KeyVerificationResult>> {
        return this.request<KeyVerificationResult>('/users/me/keys/verify', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Admin Key Management endpoints
    async getKeySystemHealth(): Promise<ApiResponse<KeySystemHealth>> {
        return this.request<KeySystemHealth>('/admin/keys/health');
    }

    async getKeyMetadata(params?: {
        purpose?: 'message' | 'search' | 'suggestion' | 'general';
        userId?: string;
        isActive?: boolean;
        includeExpired?: boolean;
    }): Promise<ApiResponse<KeyMetadata[]>> {
        const queryParams = new URLSearchParams();
        if (params?.purpose) queryParams.append('purpose', params.purpose);
        if (params?.userId) queryParams.append('userId', params.userId);
        if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
        if (params?.includeExpired !== undefined) queryParams.append('includeExpired', params.includeExpired.toString());
        
        const queryString = queryParams.toString();
        const endpoint = queryString ? `/admin/keys?${queryString}` : '/admin/keys';
        
        return this.request<KeyMetadata[]>(endpoint);
    }

    async rotateKeys(data?: KeyRotationRequest): Promise<ApiResponse<{
        message: string;
        oldKeyId: string | null;
        newKeyId: string | null;
        newVersion: number | null;
    }>> {
        return this.request<{
            message: string;
            oldKeyId: string | null;
            newKeyId: string | null;
            newVersion: number | null;
        }>('/admin/keys/rotate', {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    async cleanupKeys(): Promise<ApiResponse<{ message: string }>> {
        return this.request<{ message: string }>('/admin/keys/cleanup', {
            method: 'POST',
        });
    }

    async getKeySystemStats(): Promise<ApiResponse<KeySystemStats>> {
        return this.request<KeySystemStats>('/admin/keys/stats');
    }

    async initializeKeySystem(data?: KeyInitializeRequest): Promise<ApiResponse<{
        message: string;
        adminEmail: string;
    }>> {
        return this.request<{
            message: string;
            adminEmail: string;
        }>('/admin/keys/initialize', {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    // Get current API base URL for debugging
    getApiBaseUrl(): string {
        return API_BASE_URL;
    }
}

export const apiService = new ApiService(); 