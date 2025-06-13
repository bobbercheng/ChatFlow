import { ApiResponse, LoginRequest, LoginResponse, Message, CreateMessageRequest } from '../types/index.js';

const API_BASE_URL = 'http://localhost:3002/v1';

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

    async sendMessage(data: CreateMessageRequest): Promise<ApiResponse<Message>> {
        return this.request<Message>(`/conversations/${data.conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content: data.content,
                messageType: data.messageType || 'TEXT',
            }),
        });
    }
}

export const apiService = new ApiService(); 