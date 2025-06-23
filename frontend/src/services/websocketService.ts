import { WebSocketEvent } from '../types/index.js';
import { config } from '../config/environment.js';
import { encryptionService, EncryptedField } from '../utils/encryption.js';

const WS_URL = config.WS_BASE_URL;

type MessageHandler = (event: WebSocketEvent) => void;

class WebSocketService {
    private ws: WebSocket | null = null;
    private token: string | null = null;
    private messageHandlers: MessageHandler[] = [];
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;

    connect(token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.token = token;
            
            try {
                // Note: Browser WebSocket API doesn't support custom headers
                // The enhanced WebSocket security on backend supports both Authorization header and query parameter
                // Using query parameter for browser compatibility
                const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('🔌 WebSocket connected to:', WS_URL);
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = async (event) => {
                    try {
                        const data: WebSocketEvent = JSON.parse(event.data);
                        
                        // Decrypt any encrypted fields if encryption is available
                        if (encryptionService.isReady()) {
                            try {
                                await this.decryptWebSocketPayload(data);
                            } catch (error) {
                                console.error('Failed to decrypt WebSocket payload:', error);
                                // Continue with encrypted content rather than failing
                            }
                        }
                        
                        this.messageHandlers.forEach(handler => handler(data));
                    } catch (error) {
                        console.error('Failed to parse WebSocket message:', error);
                    }
                };

                this.ws.onclose = (event) => {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    this.handleReconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.token = null;
        this.reconnectAttempts = 0;
    }

    send(message: any): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket is not connected');
        }
    }

    async sendMessage(conversationId: string, content: string): Promise<void> {
        let contentToSend: string | EncryptedField = content;

        // Encrypt message content if encryption is available
        if (encryptionService.isReady()) {
            try {
                contentToSend = await encryptionService.encryptMessage(content);
                console.log('🔐 Encrypted WebSocket message content');
            } catch (error) {
                console.error('Failed to encrypt WebSocket message:', error);
                // Continue with plain text if encryption fails
            }
        }

        this.send({
            type: 'message:create',
            payload: {
                conversationId,
                content: contentToSend,
                messageType: 'TEXT'
            }
        });
    }

    markAsRead(messageId: string): void {
        this.send({
            type: 'message:read',
            payload: {
                messageId
            }
        });
    }

    onMessage(handler: MessageHandler): () => void {
        this.messageHandlers.push(handler);
        
        // Return unsubscribe function
        return () => {
            const index = this.messageHandlers.indexOf(handler);
            if (index > -1) {
                this.messageHandlers.splice(index, 1);
            }
        };
    }

    /**
     * Recursively decrypt encrypted fields in WebSocket payload
     */
    private async decryptWebSocketPayload(data: WebSocketEvent): Promise<void> {
        if (!data.payload || typeof data.payload !== 'object') {
            return;
        }

        const decryptedCount = await this.decryptObjectFields(data.payload);
        
        if (decryptedCount > 0) {
            console.log(`🔓 Decrypted ${decryptedCount} fields in WebSocket payload`);
        }
    }

    /**
     * Recursively decrypt encrypted fields in an object
     */
    private async decryptObjectFields(obj: any): Promise<number> {
        if (!obj || typeof obj !== 'object') {
            return 0;
        }

        let decryptedCount = 0;

        // Sensitive field names that might be encrypted
        const sensitiveFields = [
            'content', 'body', 'text', 'query', 'suggestion', 'suggestionText',
            'rawContent', 'semanticContent', 'highlightedContent'
        ];

        for (const [key, value] of Object.entries(obj)) {
            if (sensitiveFields.includes(key) && encryptionService.isEncryptedField(value)) {
                try {
                    const decryptedValue = await encryptionService.decryptField(value as EncryptedField);
                    obj[key] = decryptedValue;
                    decryptedCount++;
                } catch (error) {
                    console.error(`Failed to decrypt field '${key}':`, error);
                    // Continue with other fields
                }
            } else if (value && typeof value === 'object') {
                // Recursively check nested objects
                decryptedCount += await this.decryptObjectFields(value);
            }
        }

        return decryptedCount;
    }

    private handleReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts && this.token) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            setTimeout(() => {
                this.connect(this.token!).catch(error => {
                    console.error('Reconnection failed:', error);
                });
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    // Get current WebSocket URL for debugging
    getWebSocketUrl(): string {
        return WS_URL;
    }
}

export const websocketService = new WebSocketService(); 