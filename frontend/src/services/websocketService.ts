import { WebSocketEvent } from '../types/index.js';

const WS_URL = 'ws://localhost:3002/ws';

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
            const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
            
            try {
                this.ws = new WebSocket(wsUrl);
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data: WebSocketEvent = JSON.parse(event.data);
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

    sendMessage(conversationId: string, content: string): void {
        this.send({
            type: 'message:create',
            payload: {
                conversationId,
                content,
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
}

export const websocketService = new WebSocketService(); 