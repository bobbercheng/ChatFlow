/**
 * Test file for sidebar and message display bug fixes
 * 
 * Fixes tested:
 * 1. Sidebar disappears after logout/login cycle
 * 2. Messages show as "[object Object]" after page refresh
 */

import { ChatFlowApp } from './app.js';
import { apiService } from './services/apiService.js';
import { websocketService } from './services/websocketService.js';

// Mock DOM environment
function setupMockDOM() {
    // Mock basic DOM structure
    document.body.innerHTML = `
        <div id="app"></div>
    `;
    
    // Mock localStorage
    const localStorageMock = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
        value: localStorageMock
    });
    
    // Mock window.dispatchEvent
    window.dispatchEvent = jest.fn();
}

// Mock API responses
function setupApiMocks() {
    // Mock successful login
    jest.spyOn(apiService, 'login').mockResolvedValue({
        success: true,
        data: {
            user: { email: 'test@example.com', displayName: 'Test User', avatarUrl: null },
            token: 'mock-token'
        }
    });
    
    // Mock encryption initialization
    jest.spyOn(apiService, 'initializeEncryption').mockResolvedValue();
    
    // Mock conversations API
    jest.spyOn(apiService, 'getConversations').mockResolvedValue({
        success: true,
        data: {
            data: [
                {
                    id: 'conv_123',
                    participants: [
                        { userId: 'test@example.com' },
                        { userId: 'other@example.com' }
                    ],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ]
        }
    });
    
    // Mock messages API with various content types
    jest.spyOn(apiService, 'getConversationMessages').mockResolvedValue({
        success: true,
        data: {
            data: [
                // Normal string message
                {
                    id: 'msg_1',
                    conversationId: 'conv_123',
                    senderId: 'test@example.com',
                    content: 'Hello world!',
                    createdAt: new Date().toISOString()
                },
                // Object content (problematic case)
                {
                    id: 'msg_2',
                    conversationId: 'conv_123',
                    senderId: 'other@example.com',
                    content: { type: 'text', value: 'This is an object content' } as any,
                    createdAt: new Date().toISOString()
                },
                // Encrypted content object (should be preserved)
                {
                    id: 'msg_3',
                    conversationId: 'conv_123',
                    senderId: 'test@example.com',
                    content: {
                        data: 'encrypted-data-here',
                        encryption: {
                            algorithm: 'AES-256-GCM',
                            keyId: 'key-123'
                        }
                    } as any,
                    createdAt: new Date().toISOString()
                }
            ]
        }
    });
    
    // Mock WebSocket
    jest.spyOn(websocketService, 'connect').mockResolvedValue();
    jest.spyOn(websocketService, 'disconnect').mockImplementation();
    jest.spyOn(websocketService, 'onMessage').mockReturnValue(() => {});
}

describe('Sidebar and Message Display Bug Fixes', () => {
    let app: ChatFlowApp;
    
    beforeEach(() => {
        setupMockDOM();
        setupApiMocks();
        jest.clearAllMocks();
    });
    
    afterEach(() => {
        if (app) {
            (app as any).handleLogout();
        }
        document.body.innerHTML = '';
    });
    
    describe('Fix 1: Sidebar disappears after logout/login cycle', () => {
        test('should properly cleanup sidebar instance on logout', async () => {
            app = new ChatFlowApp();
            
            // Simulate login
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;
            const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
            
            if (emailInput && passwordInput && loginBtn) {
                emailInput.value = 'test@example.com';
                passwordInput.value = 'password';
                loginBtn.click();
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Verify sidebar is initialized
            expect((app as any).conversationSidebar).toBeTruthy();
            expect((app as any).isLoggedIn).toBe(true);
            
            // Simulate logout
            const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
            if (logoutBtn) {
                logoutBtn.click();
            }
            
            // Verify proper cleanup
            expect((app as any).conversationSidebar).toBeNull();
            expect((app as any).searchComponent).toBeNull();
            expect((app as any).currentUser).toBeNull();
            expect((app as any).isLoggedIn).toBe(false);
            expect((app as any).currentConversation).toBeNull();
        });
    });
    
    describe('Fix 2: Messages show as "[object Object]" after page refresh', () => {
        test('should handle string content correctly', async () => {
            app = new ChatFlowApp();
            
            // Login first
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;
            const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
            
            if (emailInput && passwordInput && loginBtn) {
                emailInput.value = 'test@example.com';
                passwordInput.value = 'password';
                loginBtn.click();
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Load conversation messages
            await (app as any).loadConversationMessages('conv_123');
            
            // Verify string content is preserved
            const messages = (app as any).messages;
            const stringMessage = messages.find((m: any) => m.id === 'msg_1');
            
            expect(stringMessage).toBeTruthy();
            expect(typeof stringMessage.content).toBe('string');
            expect(stringMessage.content).toBe('Hello world!');
        });
        
        test('should convert object content to JSON string', async () => {
            app = new ChatFlowApp();
            
            // Login and load messages
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;
            const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
            
            if (emailInput && passwordInput && loginBtn) {
                emailInput.value = 'test@example.com';
                passwordInput.value = 'password';
                loginBtn.click();
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            await (app as any).loadConversationMessages('conv_123');
            
            // Verify object content is converted to string
            const messages = (app as any).messages;
            const objectMessage = messages.find((m: any) => m.id === 'msg_2');
            
            expect(objectMessage).toBeTruthy();
            expect(typeof objectMessage.content).toBe('string');
            expect(objectMessage.content).toBe('{"type":"text","value":"This is an object content"}');
        });
        
        test('should preserve encrypted content objects', async () => {
            app = new ChatFlowApp();
            
            // Login and load messages
            const emailInput = document.getElementById('email') as HTMLInputElement;
            const passwordInput = document.getElementById('password') as HTMLInputElement;
            const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
            
            if (emailInput && passwordInput && loginBtn) {
                emailInput.value = 'test@example.com';
                passwordInput.value = 'password';
                loginBtn.click();
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
            await (app as any).loadConversationMessages('conv_123');
            
            // Verify encrypted content is preserved as object for decryption
            const messages = (app as any).messages;
            const encryptedMessage = messages.find((m: any) => m.id === 'msg_3');
            
            expect(encryptedMessage).toBeTruthy();
            expect(typeof encryptedMessage.content).toBe('object');
            expect(encryptedMessage.content.data).toBe('encrypted-data-here');
            expect(encryptedMessage.content.encryption.algorithm).toBe('AES-256-GCM');
        });
    });
});

export { };
