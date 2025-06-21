import { apiService } from './services/apiService.js';
import { websocketService } from './services/websocketService.js';
import { User, Message, WebSocketEvent } from './types/index.js';
import { config } from './config/environment.js';
import { SearchComponent } from './modules/chatflow/app/components/SearchComponent.js';

interface MessageDisplay extends Message {
    cssClass: string;
    formattedTime: string;
}

interface SearchResult {
  messageId: string;
  conversationId: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  createdAt: string;
  relevanceScore: number;
}

class ChatFlowApp {
    private isLoggedIn = false;
    private currentUser: User | null = null;
    private conversationId = '';
    private messages: MessageDisplay[] = [];
    private connectionStatus = 'Disconnected';
    private wsUnsubscribe: (() => void) | null = null;
    private isInitializingWebSocket = false;
    private eventListenersAttached = false;
    private currentView: 'chat' | 'search' = 'chat';
    private searchComponent: SearchComponent | null = null;

    constructor() {
        console.log('🚀 ChatFlow Frontend Starting...');
        console.log('📡 API Endpoint:', config.API_BASE_URL);
        console.log('🔌 WebSocket Endpoint:', config.WS_BASE_URL);
        console.log('📱 App Version:', config.VERSION);
        this.initializeApp();
    }

    private initializeApp() {
        // Check if user is already logged in
        const token = apiService.getToken();
        if (token) {
            this.isLoggedIn = true;
            this.initializeWebSocket(token);
            this.showMainInterface();
        } else {
            this.showLoginForm();
        }

        if (!this.eventListenersAttached) {
            this.bindEvents();
            this.eventListenersAttached = true;
        }
    }

    private bindEvents() {
        this.removeEventListeners();

        // Login form events
        const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;

        if (loginBtn) {
            loginBtn.addEventListener('click', this.handleLoginBound);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', this.handlePasswordKeyPressBound);
        }

        // Main interface events
        this.bindMainInterfaceEvents();
    }

    private bindMainInterfaceEvents() {
        // Navigation tabs
        const chatTab = document.getElementById('chatTab') as HTMLButtonElement;
        const searchTab = document.getElementById('searchTab') as HTMLButtonElement;

        if (chatTab) {
            chatTab.addEventListener('click', () => {
                console.log('Chat tab clicked');
                this.switchView('chat');
            });
        }

        if (searchTab) {
            searchTab.addEventListener('click', () => {
                console.log('Search tab clicked');
                this.switchView('search');
                
                // Extra safety: ensure SearchComponent is initialized after tab click
                setTimeout(() => {
                    if (!this.searchComponent) {
                        console.log('SearchComponent missing after tab click, initializing...');
                        this.initializeSearchComponent();
                    }
                }, 50);
            });
        }

        // Chat interface events
        const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
        const messageInput = document.getElementById('messageInput') as HTMLInputElement;
        const conversationInput = document.getElementById('conversationIdInput') as HTMLInputElement;
        const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;

        if (sendBtn) {
            sendBtn.addEventListener('click', this.handleSendMessageBound);
        }

        if (messageInput) {
            messageInput.addEventListener('keypress', this.handleMessageKeyPressBound);
        }

        if (conversationInput) {
            conversationInput.addEventListener('change', this.handleConversationChangeBound);
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogoutBound);
        }

        // Search will be handled by SearchComponent when initialized
    }

    private handleLoginBound = () => this.handleLogin();
    private handlePasswordKeyPressBound = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            this.handleLogin();
        }
    };
    private handleSendMessageBound = () => this.handleSendMessage();
    private handleMessageKeyPressBound = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendMessage();
        }
    };
    private handleConversationChangeBound = (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.conversationId = target.value;
        this.messages = [];
        this.updateMessagesDisplay();
    };
    private handleLogoutBound = () => this.handleLogout();

    private removeEventListeners() {
        const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;

        if (loginBtn) {
            loginBtn.removeEventListener('click', this.handleLoginBound);
        }

        if (passwordInput) {
            passwordInput.removeEventListener('keypress', this.handlePasswordKeyPressBound);
        }

        const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
        const messageInput = document.getElementById('messageInput') as HTMLInputElement;
        const conversationInput = document.getElementById('conversationIdInput') as HTMLInputElement;
        const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;

        if (sendBtn) {
            sendBtn.removeEventListener('click', this.handleSendMessageBound);
        }

        if (messageInput) {
            messageInput.removeEventListener('keypress', this.handleMessageKeyPressBound);
        }

        if (conversationInput) {
            conversationInput.removeEventListener('change', this.handleConversationChangeBound);
        }

        if (logoutBtn) {
            logoutBtn.removeEventListener('click', this.handleLogoutBound);
        }
    }

    private switchView(view: 'chat' | 'search') {
        console.log(`Switching to ${view} view`);
        this.currentView = view;
        
        // Update tab states
        const chatTab = document.getElementById('chatTab');
        const searchTab = document.getElementById('searchTab');
        const chatContent = document.getElementById('chatContent');
        const searchContent = document.getElementById('searchContent');

        if (chatTab && searchTab && chatContent && searchContent) {
            // Update active tab styling
            chatTab.classList.toggle('active', view === 'chat');
            searchTab.classList.toggle('active', view === 'search');

            // Show/hide content
            chatContent.style.display = view === 'chat' ? 'flex' : 'none';
            searchContent.style.display = view === 'search' ? 'block' : 'none';

            // Initialize SearchComponent when switching to search view
            if (view === 'search') {
                if (!this.searchComponent) {
                    this.initializeSearchComponent();
                } else {
                    console.log('SearchComponent already exists');
                }
            }
        } else {
            console.error('Missing DOM elements for view switching:', {
                chatTab: !!chatTab,
                searchTab: !!searchTab, 
                chatContent: !!chatContent,
                searchContent: !!searchContent
            });
        }
    }

    private initializeSearchComponent() {
        console.log('Attempting to initialize SearchComponent...');
        const searchContent = document.getElementById('searchContent');
        
        if (!searchContent) {
            console.error('SearchContent element not found');
            return;
        }
        
        if (this.searchComponent) {
            console.log('SearchComponent already initialized');
            return;
        }

        try {
            console.log('Creating new SearchComponent instance');
            this.searchComponent = new SearchComponent(searchContent);
            console.log('SearchComponent initialized successfully');
            
            // Listen for navigation events from SearchComponent
            window.addEventListener('navigateToConversation', (event: Event) => {
                const customEvent = event as CustomEvent;
                const { conversationId } = customEvent.detail;
                this.navigateToConversation(conversationId);
            });
        } catch (error) {
            console.error('Failed to initialize SearchComponent:', error);
            // Fallback: try again after a short delay
            setTimeout(() => {
                console.log('Retrying SearchComponent initialization...');
                this.searchComponent = null; // Reset flag
                this.initializeSearchComponent();
            }, 100);
        }
    }

    private async handleLogin() {
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
        const errorDiv = document.getElementById('loginError') as HTMLDivElement;

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            this.showError('Please enter both email and password');
            return;
        }

        if (loginBtn.disabled) {
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';
        errorDiv.style.display = 'none';

        try {
            const response = await apiService.login({ email, password });

            if (response.success && response.data) {
                this.currentUser = response.data.user;
                this.isLoggedIn = true;
                apiService.setToken(response.data.token);
                
                await this.initializeWebSocket(response.data.token);
                this.showMainInterface();
            } else {
                this.showError(response.error?.message || 'Login failed');
            }
        } catch (error) {
            this.showError('Network error. Please try again.');
            console.error('Login error:', error);
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    }

    private handleLogout() {
        this.isLoggedIn = false;
        this.currentUser = null;
        this.messages = [];
        this.conversationId = '';
        this.connectionStatus = 'Disconnected';
        this.isInitializingWebSocket = false;
        
        if (this.wsUnsubscribe) {
            this.wsUnsubscribe();
            this.wsUnsubscribe = null;
        }
        
        websocketService.disconnect();
        apiService.clearToken();
        this.showLoginForm();
    }

    private async handleSendMessage() {
        const messageInput = document.getElementById('messageInput') as HTMLInputElement;
        const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;

        const content = messageInput.value.trim();
        if (!content || !this.conversationId) {
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        try {
            websocketService.sendMessage(this.conversationId, content);
            messageInput.value = '';
        } catch (error) {
            console.error('Send message error:', error);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
        }
    }

    private async initializeWebSocket(token: string) {
        if (this.isInitializingWebSocket) {
            console.log('WebSocket initialization already in progress, skipping...');
            return;
        }

        console.log('Initializing WebSocket');
        this.isInitializingWebSocket = true;
        this.connectionStatus = 'Connecting';
        this.updateConnectionStatus();
        
        try {
            await websocketService.connect(token);
            this.connectionStatus = 'Connected';
            this.updateConnectionStatus();
            
            this.wsUnsubscribe = websocketService.onMessage((event: WebSocketEvent) => {
                this.handleWebSocketMessage(event);
            });
        } catch (error) {
            this.connectionStatus = 'Disconnected';
            this.updateConnectionStatus();
            console.error('WebSocket connection failed:', error);
        } finally {
            this.isInitializingWebSocket = false;
        }
    }

    private handleWebSocketMessage(event: WebSocketEvent) {
        console.log('WebSocket message received:', event);

        switch (event.type) {
            case 'connection':
                console.log('WebSocket connected successfully');
                break;

            case 'message:new':
                if (event.payload?.message) {
                    this.addMessage(event.payload.message);
                }
                break;

            case 'message:created':
                if (event.payload) {
                    this.addMessage(event.payload);
                }
                break;

            case 'message:status':
                console.log('Message status update:', event.payload);
                break;

            case 'error':
                console.error('WebSocket error:', event.payload);
                break;

            default:
                console.log('Unknown WebSocket event:', event);
        }
    }

    private addMessage(message: Message) {
        // If no conversation is set, automatically join the conversation of the first received message
        if (!this.conversationId && message.conversationId) {
            this.conversationId = message.conversationId;
            this.updateConversationDisplay();
        }
        
        if (message.conversationId !== this.conversationId) {
            return;
        }

        const messageDisplay: MessageDisplay = {
            ...message,
            cssClass: this.getMessageCssClass(message),
            formattedTime: this.formatTime(message.createdAt)
        };

        this.messages = [messageDisplay, ...this.messages];
        this.updateMessagesDisplay();
    }

    private updateConversationDisplay() {
        // Update the conversation info display
        const conversationInfo = document.querySelector('.conversation-info h3');
        if (conversationInfo) {
            conversationInfo.textContent = `Conversation: ${this.conversationId || 'None'}`;
        }
        
        // Update the conversation ID input field
        const conversationInput = document.getElementById('conversationIdInput') as HTMLInputElement;
        if (conversationInput) {
            conversationInput.value = this.conversationId;
        }
    }

    private getMessageCssClass(message: Message): string {
        const baseClass = 'message';
        const typeClass = message.senderId === this.currentUser?.email ? 'message-sent' : 'message-received';
        return `${baseClass} ${typeClass}`;
    }

    private formatTime(timestamp: string): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    private getConnectionStatusClass(): string {
        switch (this.connectionStatus) {
            case 'Connected':
                return 'status-connected';
            case 'Connecting':
                return 'status-connecting';
            default:
                return 'status-disconnected';
        }
    }

    private updateConnectionStatus() {
        const statusElement = document.querySelector('.connection-status span');
        if (statusElement) {
            statusElement.textContent = this.connectionStatus;
            statusElement.className = this.getConnectionStatusClass();
        }
    }

    private updateMessagesDisplay() {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;

        messagesList.innerHTML = this.messages.map(message => `
            <div class="${message.cssClass}">
                <div class="message-header">
                    <span class="sender">${message.senderDisplayName}</span>
                    <span class="timestamp">${message.formattedTime}</span>
                </div>
                <div class="message-content">${this.escapeHtml(message.content)}</div>
            </div>
        `).join('');

        messagesList.scrollTop = messagesList.scrollHeight;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private showError(message: string) {
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    private async handleSearch() {
        const searchInput = document.getElementById('searchInput') as HTMLInputElement;
        const searchResults = document.getElementById('searchResults') as HTMLElement;
        
        if (!searchInput || !searchResults) return;

        const query = searchInput.value.trim();
        if (!query) return;

        // Show loading
        searchResults.innerHTML = '<div class="loading">🔍 Searching...</div>';

        try {
            const response = await apiService.searchConversations(query, { limit: 20 });
            
            if (response.success && response.data?.results) {
                this.displaySearchResults(response.data.results);
            } else {
                searchResults.innerHTML = '<div class="error">❌ Search failed. Please try again.</div>';
            }
        } catch (error) {
            console.error('Search error:', error);
            searchResults.innerHTML = '<div class="error">❌ Search failed. Please check your connection.</div>';
        }
    }

    private displaySearchResults(results: SearchResult[]) {
        const searchResults = document.getElementById('searchResults') as HTMLElement;
        
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results">🔍 No results found. Try different keywords.</div>';
            return;
        }

        const resultsHtml = results.map(result => {
            const createdAt = new Date(result.createdAt);
            const timeAgo = this.getTimeAgo(createdAt);
            const relevancePercentage = Math.round(result.relevanceScore * 100);
            
            return `
                <div class="search-result" onclick="window.chatApp?.navigateToConversation('${result.conversationId}')">
                    <div class="result-header">
                        <strong>👤 ${this.escapeHtml(result.senderDisplayName)}</strong>
                        <span class="time">🕒 ${timeAgo} • ⭐ ${relevancePercentage}% match</span>
                    </div>
                    <div class="result-content">
                        ${this.escapeHtml(result.content.substring(0, 200))}${result.content.length > 200 ? '...' : ''}
                    </div>
                    <div class="result-conversation">
                        💬 Conversation: ${result.conversationId}
                    </div>
                </div>
            `;
        }).join('');

        searchResults.innerHTML = `
            <div class="results-header">✅ Found ${results.length} results</div>
            ${resultsHtml}
        `;
    }

    public navigateToConversation(conversationId: string) {
        // Switch to chat view
        this.switchView('chat');
        
        // Set the conversation ID
        this.conversationId = conversationId;
        
        // Update the conversation input
        const conversationInput = document.getElementById('conversationIdInput') as HTMLInputElement;
        if (conversationInput) {
            conversationInput.value = conversationId;
        }
        
        // Clear current messages and update display
        this.messages = [];
        this.updateConversationDisplay();
        this.updateMessagesDisplay();
        
        console.log(`Navigated to conversation: ${conversationId}`);
    }

    private getTimeAgo(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${diffDays}d ago`;
    }

    private showLoginForm() {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div class="chat-app">
                <div class="header">
                    <h1>💬 ${config.APP_NAME}</h1>
                </div>
                <div class="login-container">
                    <div class="login-form">
                        <h2>🔐 Login to ChatFlow</h2>
                        <div class="form-group">
                            <label for="email">📧 Email:</label>
                            <input id="email" type="email" placeholder="Enter your email" />
                        </div>
                        <div class="form-group">
                            <label for="password">🔒 Password:</label>
                            <input id="password" type="password" placeholder="Enter your password" />
                        </div>
                        <button id="loginBtn" class="login-btn">🚀 Login</button>
                        <div id="loginError" class="error-message" style="display: none;"></div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    private showMainInterface() {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <div class="chat-app">
                <div class="header">
                    <h1>💬 ${config.APP_NAME}</h1>
                    <div class="user-info">
                        <span>👋 Welcome, ${this.currentUser?.displayName || 'User'}</span>
                        <button id="logoutBtn" class="logout-btn">🚪 Logout</button>
                    </div>
                </div>
                
                <!-- Navigation Tabs -->
                <div class="nav-tabs">
                    <button id="chatTab" class="nav-tab active">
                        💬 Chat
                    </button>
                    <button id="searchTab" class="nav-tab">
                        🔍 Search
                    </button>
                </div>

                <!-- Chat Content -->
                <div id="chatContent" class="content-panel">
                    <div class="chat-container">
                        <div class="conversation-info">
                            <h3>💬 Conversation: ${this.conversationId || 'None'}</h3>
                            <div class="connection-status">
                                <span class="${this.getConnectionStatusClass()}">🔗 ${this.connectionStatus}</span>
                            </div>
                        </div>
                        <div class="conversation-id-input">
                            <label for="conversationIdInput">🆔 Conversation ID:</label>
                            <input id="conversationIdInput" type="text" value="${this.conversationId}" placeholder="Enter conversation ID" />
                        </div>
                        <div class="messages-container">
                            <div id="messagesList" class="messages-list">
                                <!-- Messages will be inserted here -->
                            </div>
                        </div>
                        <div class="message-input-container">
                            <div class="message-input">
                                <input id="messageInput" type="text" placeholder="Type a message..." />
                                <button id="sendBtn">📤 Send</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Search Content -->
                <div id="searchContent" class="content-panel" style="display: none;">
                    <!-- SearchComponent will be initialized here -->
                </div>
            </div>
        `;

        // Use setTimeout to ensure DOM is fully ready before binding events
        setTimeout(() => {
            this.bindEvents();
            this.updateMessagesDisplay();
            
            // Set default view and expose the app globally
            this.switchView(this.currentView);
            (window as any).chatApp = this;
        }, 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatFlowApp();
}); 