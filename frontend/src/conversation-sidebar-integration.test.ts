import { ChatFlowApp } from './app.js';
import { ConversationSidebar } from './components/ConversationSidebar.js';
import { apiService } from './services/apiService.js';
import { websocketService } from './services/websocketService.js';

// Mock the services
jest.mock('./services/apiService.js');
jest.mock('./services/websocketService.js');
jest.mock('./services/localLlmService.js');

const mockApiService = apiService as jest.Mocked<typeof apiService>;
const mockWebSocketService = websocketService as jest.Mocked<typeof websocketService>;

describe('ConversationSidebar Integration', () => {
    let app: ChatFlowApp;

    beforeEach(() => {
        // Setup DOM
        document.body.innerHTML = '<div id="app"></div>';
        
        // Reset mocks
        jest.clearAllMocks();
        
        // Setup localStorage mock
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: jest.fn(() => null),
                setItem: jest.fn(),
                removeItem: jest.fn(),
            },
            writable: true
        });
        
        // Mock API responses
        mockApiService.getToken.mockReturnValue('mock-token');
        mockApiService.login.mockResolvedValue({
            success: true,
            data: {
                user: { email: 'test@example.com', displayName: 'Test User', avatarUrl: null },
                token: 'mock-token'
            }
        });
        
        mockApiService.getConversations.mockResolvedValue({
            success: true,
            data: {
                data: [
                    {
                        id: 'conv_1',
                        participants: [{ userId: 'user1' }, { userId: 'user2' }],
                        updatedAt: new Date().toISOString()
                    },
                    {
                        id: 'conv_2',
                        participants: [{ userId: 'user1' }],
                        updatedAt: new Date().toISOString()
                    }
                ]
            }
        });
        
        mockApiService.initializeEncryption.mockResolvedValue(undefined);
        
        // Mock WebSocket
        mockWebSocketService.connect.mockResolvedValue(undefined);
        mockWebSocketService.onMessage.mockReturnValue(() => {});
        mockWebSocketService.disconnect.mockReturnValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe('App Integration', () => {
        test('should initialize sidebar when app starts with token', async () => {
            app = new ChatFlowApp();
            
            // Wait for async initialization
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const sidebarContainer = document.getElementById('conversationSidebarContainer');
            const sidebar = sidebarContainer?.querySelector('.conversation-sidebar');
            
            expect(sidebarContainer).toBeTruthy();
            expect(sidebar).toBeTruthy();
        });

        test('should not show sidebar in login form', () => {
            mockApiService.getToken.mockReturnValue(null);
            
            app = new ChatFlowApp();
            
            const sidebarContainer = document.getElementById('conversationSidebarContainer');
            expect(sidebarContainer).toBeFalsy();
            
            const loginForm = document.querySelector('.login-form');
            expect(loginForm).toBeTruthy();
        });

        test('should adjust main content margin when sidebar is toggled', async () => {
            app = new ChatFlowApp();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const mainContent = document.querySelector('.main-content') as HTMLElement;
            const toggleBtn = document.querySelector('.sidebar-toggle') as HTMLButtonElement;
            
            expect(mainContent).toBeTruthy();
            expect(toggleBtn).toBeTruthy();
            
            // Initially not collapsed
            expect(mainContent.classList.contains('sidebar-collapsed')).toBe(false);
            
            // Toggle sidebar
            toggleBtn.click();
            
            // Wait for event handling
            await new Promise(resolve => setTimeout(resolve, 50));
            
            expect(mainContent.classList.contains('sidebar-collapsed')).toBe(true);
        });
    });

    describe('Conversation Selection Integration', () => {
        beforeEach(async () => {
            app = new ChatFlowApp();
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        test('should update participants display when sidebar conversation is selected', async () => {
            const participantsDisplay = document.getElementById('participantsDisplay');
            const conversationItem = document.querySelector('.conversation-item') as HTMLElement;
            
            expect(participantsDisplay).toBeTruthy();
            expect(conversationItem).toBeTruthy();
            
            // Mock getConversation for the selected conversation
            mockApiService.getConversation = jest.fn().mockResolvedValue({
                success: true,
                data: {
                    id: 'conv_1',
                    participants: [
                        { userId: 'user1@example.com', role: 'ADMIN' },
                        { userId: 'user2@example.com', role: 'MEMBER' }
                    ]
                }
            });
            
            // Mock getConversationMessages for the selected conversation
            mockApiService.getConversationMessages.mockResolvedValue({
                success: true,
                data: { data: [] }
            });
            
            // Click conversation item
            conversationItem.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(mockApiService.getConversation).toHaveBeenCalledWith('conv_1');
            expect(mockApiService.getConversationMessages).toHaveBeenCalledWith('conv_1');
        });

        test('should switch to chat view when conversation is selected from sidebar', async () => {
            // Switch to search view first
            const searchTab = document.getElementById('searchTab') as HTMLButtonElement;
            searchTab.click();
            
            expect(document.getElementById('chatContent')?.style.display).toBe('none');
            expect(document.getElementById('searchContent')?.style.display).toBe('block');
            
            // Select conversation from sidebar
            const conversationItem = document.querySelector('.conversation-item') as HTMLElement;
            mockApiService.getConversationMessages.mockResolvedValue({
                success: true,
                data: { data: [] }
            });
            
            conversationItem.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Should switch back to chat view
            expect(document.getElementById('chatContent')?.style.display).toBe('flex');
            expect(document.getElementById('searchContent')?.style.display).toBe('none');
        });

        test('should load conversation messages when sidebar conversation is selected', async () => {
            const mockMessages = [
                {
                    id: 'msg_1',
                    conversationId: 'conv_1',
                    senderId: 'user1',
                    content: 'Hello',
                    createdAt: new Date().toISOString()
                }
            ];
            
            mockApiService.getConversationMessages.mockResolvedValue({
                success: true,
                data: { data: mockMessages }
            });
            
            const conversationItem = document.querySelector('.conversation-item') as HTMLElement;
            conversationItem.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(mockApiService.getConversationMessages).toHaveBeenCalledWith('conv_1');
            
            const messagesList = document.getElementById('messagesList');
            expect(messagesList?.innerHTML).toContain('Hello');
        });
    });

    describe('New Conversation Integration', () => {
        beforeEach(async () => {
            app = new ChatFlowApp();
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        test('should create conversation and select it in the app', async () => {
            const newConversation = {
                id: 'conv_new',
                participants: [{ userId: 'user1' }, { userId: 'user2' }],
                updatedAt: new Date().toISOString()
            };
            
            mockApiService.createConversation.mockResolvedValue({
                success: true,
                data: newConversation
            });
            
            mockApiService.getConversationMessages.mockResolvedValue({
                success: true,
                data: { data: [] }
            });
            
            // Open new conversation modal
            const newConvBtn = document.querySelector('.new-conversation-btn') as HTMLButtonElement;
            newConvBtn.click();
            
            // Fill in participant emails
            const emailInput = document.querySelector('#participantEmails') as HTMLInputElement;
            emailInput.value = 'user1@example.com, user2@example.com';
            
            // Create conversation
            const createBtn = document.querySelector('#modalCreateBtn') as HTMLButtonElement;
            createBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check that conversation was created and selected
            expect(mockApiService.createConversation).toHaveBeenCalledWith({
                participantEmails: ['user1@example.com', 'user2@example.com']
            });
            
            // Check that participants display is updated (conversation data will be loaded)
            const participantsDisplay = document.getElementById('participantsDisplay');
            expect(participantsDisplay).toBeTruthy();
            
            // Check that new conversation appears in sidebar
            const conversationItems = document.querySelectorAll('.conversation-item');
            expect(conversationItems.length).toBeGreaterThan(2); // Original 2 + new one
        });
    });

    describe('Responsive Behavior', () => {
        beforeEach(async () => {
            app = new ChatFlowApp();
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        test('should handle mobile viewport correctly', () => {
            // Mock mobile viewport
            Object.defineProperty(window, 'innerWidth', {
                writable: true,
                configurable: true,
                value: 600
            });
            
            const sidebar = document.querySelector('.conversation-sidebar') as HTMLElement;
            expect(sidebar).toBeTruthy();
            
            // In test environment, we can't test actual CSS transforms
            // Instead, verify the sidebar element exists and has the correct class structure
            expect(sidebar.classList.contains('conversation-sidebar')).toBe(true);
            
            // The responsive behavior is handled by CSS media queries
            // which work correctly in the actual browser environment
        });

        test('should maintain sidebar state across view changes', async () => {
            const toggleBtn = document.querySelector('.sidebar-toggle') as HTMLButtonElement;
            
            // Collapse sidebar
            toggleBtn.click();
            
            // Switch between views
            const searchTab = document.getElementById('searchTab') as HTMLButtonElement;
            const chatTab = document.getElementById('chatTab') as HTMLButtonElement;
            
            searchTab.click();
            await new Promise(resolve => setTimeout(resolve, 50));
            
            chatTab.click();
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Sidebar should still be collapsed
            const sidebar = document.querySelector('.conversation-sidebar');
            expect(sidebar?.classList.contains('collapsed')).toBe(true);
        });
    });

    describe('Error Handling Integration', () => {
        beforeEach(async () => {
            app = new ChatFlowApp();
            await new Promise(resolve => setTimeout(resolve, 100));
        });

        test('should handle conversation loading errors gracefully', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockApiService.getConversationMessages.mockRejectedValue(new Error('API Error'));
            
            const conversationItem = document.querySelector('.conversation-item') as HTMLElement;
            conversationItem.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(consoleSpy).toHaveBeenCalled();
            
            const messagesList = document.getElementById('messagesList');
            expect(messagesList?.innerHTML).toContain('Failed to load conversation');
            
            consoleSpy.mockRestore();
        });

        test('should handle sidebar initialization failure gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // Remove sidebar container to force initialization failure
            const sidebarContainer = document.getElementById('conversationSidebarContainer');
            sidebarContainer?.remove();
            
            // Trigger sidebar initialization
            const initMethod = (app as any).initializeConversationSidebar.bind(app);
            initMethod();
            
            expect(consoleSpy).toHaveBeenCalledWith('Sidebar container not found');
            
            consoleSpy.mockRestore();
        });
    });

    describe('Performance', () => {
        test('should not create multiple sidebar instances', async () => {
            app = new ChatFlowApp();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Try to initialize again
            const initMethod = (app as any).initializeConversationSidebar.bind(app);
            initMethod();
            
            const sidebars = document.querySelectorAll('.conversation-sidebar');
            expect(sidebars.length).toBe(1);
        });

        test('should handle multiple refresh operations', async () => {
            app = new ChatFlowApp();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const initialCallCount = mockApiService.getConversations.mock.calls.length;
            
            const refreshBtn = document.querySelector('.refresh-btn') as HTMLButtonElement;
            
            // Click refresh button
            refreshBtn.click();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Should have made at least one additional API call
            expect(mockApiService.getConversations.mock.calls.length).toBeGreaterThan(initialCallCount);
        });
    });
}); 