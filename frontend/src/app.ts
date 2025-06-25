import { apiService } from './services/apiService.js';
import { websocketService } from './services/websocketService.js';
import { localLlmService } from './services/localLlmService.js';
import { User, Message, WebSocketEvent, SearchResult } from './types/index.js';
import { config } from './config/environment.js';
import { SearchComponent } from './modules/chatflow/app/components/SearchComponent.js';
import { ConversationSidebar } from './components/ConversationSidebar.js';
import anchorme from 'anchorme';
import './version.js'; // Initialize version display

export interface MessageDisplay {
    id?: string;
    conversationId?: string;
    senderId?: string;
    messageType?: 'TEXT' | 'IMAGE' | 'FILE';
    content?: string;
    createdAt?: string;
    updatedAt?: string;
    senderDisplayName?: string; // Custom field for display
    cssClass: string;
    formattedTime: string;
}

export class ChatFlowApp {
    private isLoggedIn = false;
    private currentUser: User | null = null;
    private conversationId = '';
    private currentConversation: any = null; // Store current conversation data with participants
    private messages: MessageDisplay[] = [];
    private connectionStatus = 'Disconnected';
    private wsUnsubscribe: (() => void) | null = null;
    private isInitializingWebSocket = false;
    private eventListenersAttached = false;
    private currentView: 'chat' | 'search' = 'chat';
    private searchComponent: SearchComponent | null = null;
    private conversationSidebar: ConversationSidebar | null = null;
    private isLlmDelegationEnabled = false;
    private currentForm: 'login' | 'register' = 'login';

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
            this.currentForm = 'login'; // Ensure we start with login form
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
        const showRegisterLink = document.getElementById('showRegisterLink') as HTMLAnchorElement;

        // Registration form events
        const registerBtn = document.getElementById('registerBtn') as HTMLButtonElement;
        const showLoginLink = document.getElementById('showLoginLink') as HTMLAnchorElement;
        const displayNameInput = document.getElementById('displayName') as HTMLInputElement;

        if (loginBtn) {
            loginBtn.addEventListener('click', this.handleLoginBound);
        }

        if (registerBtn) {
            registerBtn.addEventListener('click', this.handleRegisterBound);
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', this.handlePasswordKeyPressBound);
        }

        if (displayNameInput) {
            displayNameInput.addEventListener('keypress', this.handleRegisterKeyPressBound);
        }

        if (showRegisterLink) {
            showRegisterLink.addEventListener('click', this.handleShowRegisterBound);
        }

        if (showLoginLink) {
            showLoginLink.addEventListener('click', this.handleShowLoginBound);
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
        const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;
        const llmToggle = document.getElementById('llmToggle') as HTMLInputElement;

        if (sendBtn) {
            sendBtn.addEventListener('click', this.handleSendMessageBound);
        }

        if (messageInput) {
            messageInput.addEventListener('keypress', this.handleMessageKeyPressBound);
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', this.handleLogoutBound);
        }

        if (llmToggle) {
            llmToggle.addEventListener('change', this.handleLlmToggleBound);
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

    private handleLogoutBound = () => this.handleLogout();
    private handleLlmToggleBound = (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.handleLlmToggle(target.checked);
    };

    private handleRegisterBound = () => this.handleRegister();
    private handleRegisterKeyPressBound = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            this.handleRegister();
        }
    };
    private handleShowRegisterBound = (e: Event) => {
        e.preventDefault();
        this.showRegisterForm();
    };
    private handleShowLoginBound = (e: Event) => {
        e.preventDefault();
        this.showLoginFormView();
    };

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
        const logoutBtn = document.getElementById('logoutBtn') as HTMLButtonElement;

        if (sendBtn) {
            sendBtn.removeEventListener('click', this.handleSendMessageBound);
        }

        if (messageInput) {
            messageInput.removeEventListener('keypress', this.handleMessageKeyPressBound);
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
                const { conversationId, messageId } = customEvent.detail;
                this.navigateToConversation(conversationId, messageId);
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

    private initializeConversationSidebar() {
        console.log('Initializing Conversation Sidebar...');
        const sidebarContainer = document.getElementById('conversationSidebarContainer');
        
        if (!sidebarContainer) {
            console.error('Sidebar container not found');
            return;
        }
        
        if (this.conversationSidebar) {
            console.log('ConversationSidebar already initialized');
            return;
        }

        try {
            this.conversationSidebar = new ConversationSidebar(
                sidebarContainer,
                this.currentUser?.email || '',
                (conversationId: string) => this.handleSidebarConversationSelect(conversationId)
            );
            
            // Set initial layout state to match sidebar's collapsed state
            const isCollapsed = this.conversationSidebar.isCollapsed();
            document.body.classList.toggle('sidebar-collapsed', isCollapsed);
            
            const mainContent = document.querySelector('.main-content') as HTMLElement;
            if (mainContent) {
                mainContent.classList.toggle('sidebar-collapsed', isCollapsed);
            }
            
            console.log('ConversationSidebar initialized successfully with layout state:', isCollapsed ? 'collapsed' : 'expanded');
        } catch (error) {
            console.error('Failed to initialize ConversationSidebar:', error);
        }
    }

    private bindSidebarEvents() {
        // Listen for sidebar toggle events to update main content layout
        window.addEventListener('sidebarToggle', (event: Event) => {
            const customEvent = event as CustomEvent;
            const { isCollapsed } = customEvent.detail;
            
            // Update both body and main-content classes for reliable layout
            document.body.classList.toggle('sidebar-collapsed', isCollapsed);
            
            const mainContent = document.querySelector('.main-content') as HTMLElement;
            if (mainContent) {
                mainContent.classList.toggle('sidebar-collapsed', isCollapsed);
            }
            
            console.log(`Layout updated: sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`);
        });
    }

    private async handleSidebarConversationSelect(conversationId: string) {
        console.log(`Sidebar selected conversation: ${conversationId}`);
        
        // Update current conversation
        this.conversationId = conversationId;
        
        // Fetch conversation data with participants
        await this.loadConversationData(conversationId);
        
        // Load conversation messages
        await this.loadConversationMessages(conversationId);
        
        // Switch to chat view if not already there
        if (this.currentView !== 'chat') {
            this.switchView('chat');
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
                
                // Initialize encryption system after authentication
                try {
                    await apiService.initializeEncryption();
                    console.log('🔐 Encryption system ready');
                } catch (error) {
                    console.warn('🔐 Encryption initialization failed, continuing without encryption:', error);
                }
                
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
        this.currentForm = 'login'; // Reset to login form
        
        if (this.wsUnsubscribe) {
            this.wsUnsubscribe();
            this.wsUnsubscribe = null;
        }
        
        websocketService.disconnect();
        apiService.clearToken();
        this.showLoginForm();
    }

    private handleLlmToggle(enabled: boolean) {
        this.isLlmDelegationEnabled = enabled;
        localLlmService.setEnabled(enabled);
        console.log(`🤖 LLM delegation ${enabled ? 'enabled' : 'disabled'}`);
        
        // Test connection when enabled
        if (enabled) {
            this.testLlmConnection();
        }
    }

    private async testLlmConnection() {
        try {
            const isConnected = await localLlmService.testConnection();
            if (!isConnected) {
                console.warn('🤖 Local LLM connection test failed - please ensure LM Studio or compatible server is running on http://127.0.0.1:1234');
                alert('⚠️ Cannot connect to local LLM server. Please ensure LM Studio is running on http://127.0.0.1:1234');
            } else {
                console.log('🤖 Local LLM connection test successful');
            }
        } catch (error) {
            console.error('🤖 LLM connection test error:', error);
        }
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
            // Send the user's message
            await websocketService.sendMessage(this.conversationId, content);
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

    private async handleWebSocketMessage(event: WebSocketEvent) {
        console.log('WebSocket message received:', event);

        switch (event.type) {
            case 'connection':
                console.log('WebSocket connected successfully');
                break;

            case 'message:new':
                if (event.payload?.message) {
                    await this.addMessage(event.payload.message);
                }
                break;

            case 'message:created':
                if (event.payload) {
                    await this.addMessage(event.payload);
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

    private async addMessage(message: Message) {
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
            formattedTime: this.formatTime(message.createdAt || new Date().toISOString())
        };

        this.messages = [messageDisplay, ...this.messages];
        this.updateMessagesDisplay('top'); // Scroll to top for new messages

        // Trigger LLM delegation when receiving messages from others (not current user)
        if (this.isLlmDelegationEnabled && 
            this.currentUser?.email && 
            message.senderId !== this.currentUser.email &&
            message.conversationId === this.conversationId) {
            
            console.log('🤖 New message from other user detected, generating LLM response...');
            
            // Show spinner to indicate LLM is thinking
            this.showLlmSpinner();
            
            try {
                // Wait a moment to ensure message is fully processed
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const llmResponse = await localLlmService.generateResponse(
                    this.messages, 
                    this.currentUser.email
                );
                
                if (llmResponse) {
                    console.log('🤖 Sending LLM response:', llmResponse.substring(0, 100) + '...');
                    await websocketService.sendMessage(this.conversationId, llmResponse);
                    console.log('🤖 LLM response sent successfully');
                }
            } catch (llmError) {
                console.error('🤖 LLM response generation error:', llmError);
                // Fail silently to avoid disrupting user experience
            } finally {
                // Always hide spinner when LLM generation is complete
                this.hideLlmSpinner();
            }
        }
    }

    private updateConversationDisplay() {
        const participantsDisplay = document.getElementById('participantsDisplay');
        if (participantsDisplay) {
            if (this.currentConversation) {
                participantsDisplay.textContent = this.getParticipantNames();
            } else if (this.conversationId) {
                participantsDisplay.textContent = `Conversation: ${this.conversationId}`;
            } else {
                participantsDisplay.textContent = 'Select a conversation from the sidebar or search';
            }
        }
    }

    private getParticipantNames(): string {
        if (!this.currentConversation?.participants || this.currentConversation.participants.length === 0) {
            return 'Unknown participants';
        }

        const participants = this.currentConversation.participants;
        const participantCount = participants.length;
        
        if (participantCount === 1) {
            return 'You';
        }
        
        if (participantCount === 2) {
            // For direct chat, show the other participant's name/email
            const otherParticipant = participants.find((p: any) => p.userId !== this.currentUser?.email);
            return otherParticipant ? `Chat with ${otherParticipant.userId}` : 'Direct Chat';
        }
        
        // For group chat, show member count and participant emails with creator icon
        const createdBy = this.currentConversation.createdBy;
        const participantEmails = participants.map((p: any) => {
            const isCreator = p.userId === createdBy;
            return isCreator ? `${p.userId} 👑` : p.userId;
        }).join(', ');
        
        return `Group Chat (${participantCount} members): ${participantEmails}`;
    }

    private async loadConversationData(conversationId: string) {
        try {
            const response = await apiService.getConversation(conversationId);
            if (response.success && response.data) {
                this.currentConversation = response.data;
                this.updateConversationDisplay();
                console.log('Loaded conversation data:', this.currentConversation);
            } else {
                console.error('Failed to load conversation data:', response.error);
                this.currentConversation = null;
                this.updateConversationDisplay();
            }
        } catch (error) {
            console.error('Error loading conversation data:', error);
            this.currentConversation = null;
            this.updateConversationDisplay();
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

    private showLlmSpinner() {
        const spinner = document.getElementById('llmSpinner');
        if (spinner) {
            spinner.style.display = 'flex';
            console.log('🤖 Showing LLM generation spinner');
        }
    }

    private hideLlmSpinner() {
        const spinner = document.getElementById('llmSpinner');
        if (spinner) {
            spinner.style.display = 'none';
            console.log('🤖 Hiding LLM generation spinner');
        }
    }

    private updateMessagesDisplay(scrollBehavior: 'top' | 'bottom' | 'none' = 'top') {
        const messagesList = document.getElementById('messagesList');
        if (!messagesList) return;

        messagesList.innerHTML = this.messages.map(message => `
            <div class="${message.cssClass}" data-message-id="${message.id}">
                <div class="message-header">
                    <span class="sender">${message.senderDisplayName}</span>
                    <span class="timestamp">${message.formattedTime}</span>
                </div>
                <div class="message-content">${this.linkifyText(message.content || '')}</div>
            </div>
        `).join('');

        // Handle scrolling based on message ordering (newest first)
        if (scrollBehavior === 'top') {
            // Scroll to top for new messages (since newest messages are at the top)
            messagesList.scrollTop = 0;
        } else if (scrollBehavior === 'bottom') {
            // Scroll to bottom for historical context
            messagesList.scrollTop = messagesList.scrollHeight;
        }
        // 'none' - don't change scroll position
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private linkifyText(text: string): string {
        // First escape HTML to prevent XSS
        const escapedText = this.escapeHtml(text);
        
        // Then convert URLs to clickable links using anchorme
        let linkedText = anchorme(escapedText);
        
        // Add security attributes to all generated links
        linkedText = linkedText.replace(
            /<a href="/g, 
            '<a target="_blank" rel="noopener noreferrer" class="message-link" href="'
        );
        
        return linkedText;
    }

    private showError(message: string) {
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    private showRegisterError(message: string) {
        const errorDiv = document.getElementById('registerError');
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
            const createdAt = new Date(result.createdAt || new Date().toISOString());
            const timeAgo = this.getTimeAgo(createdAt);
            const relevancePercentage = Math.round((result.relevanceScore || 0) * 100);
            const content = result.content || '';
            const senderName = result.senderId || 'Unknown';
            
            return `
                <div class="search-result" onclick="window.chatApp?.navigateToConversation('${result.conversationId || ''}')">
                    <div class="result-header">
                        <strong>👤 ${this.escapeHtml(senderName)}</strong>
                        <span class="time">🕒 ${timeAgo} • ⭐ ${relevancePercentage}% match</span>
                    </div>
                    <div class="result-content">
                        ${this.linkifyText(content.substring(0, 200))}${content.length > 200 ? '...' : ''}
                    </div>
                    <div class="result-conversation">
                        💬 Conversation: ${result.conversationId || 'Unknown'}
                    </div>
                </div>
            `;
        }).join('');

        searchResults.innerHTML = `
            <div class="results-header">✅ Found ${results.length} results</div>
            ${resultsHtml}
        `;
    }

    public async navigateToConversation(conversationId: string, messageId?: string) {
        console.log(`Navigating to conversation: ${conversationId}`, messageId ? `message: ${messageId}` : '');
        
        // Switch to chat view
        this.switchView('chat');
        
        // Set the conversation ID
        this.conversationId = conversationId;
        
        // Fetch conversation data with participants
        await this.loadConversationData(conversationId);
        
        // Load conversation messages for better UX
        await this.loadConversationMessages(conversationId, messageId);
    }

    /**
     * Load messages for a specific conversation
     */
    private async loadConversationMessages(conversationId: string, highlightMessageId?: string): Promise<void> {
        try {
            console.log('Loading conversation messages...');
            
            // Show loading state
            const messagesList = document.getElementById('messagesList');
            if (messagesList) {
                messagesList.innerHTML = '<div class="loading">📡 Loading conversation...</div>';
            }

            // Load messages from the API
            const response = await apiService.getConversationMessages(conversationId);
            
            if (response.success && response.data && response.data.data) {
                // Convert to MessageDisplay format and handle Firestore timestamps
                this.messages = response.data.data.map((message: any) => {
                    // Convert Firestore timestamp to ISO string if needed
                    let createdAt = message.createdAt;
                    if (createdAt && typeof createdAt === 'object' && createdAt._seconds) {
                        createdAt = new Date(createdAt._seconds * 1000 + createdAt._nanoseconds / 1000000).toISOString();
                    }
                    
                    return {
                        ...message,
                        createdAt,
                        cssClass: this.getMessageCssClass(message),
                        formattedTime: this.formatTime(createdAt)
                    };
                });

                // Sort by creation time (newest first for display)
                this.messages.sort((a, b) => {
                    const dateA = new Date(a.createdAt || new Date().toISOString()).getTime();
                    const dateB = new Date(b.createdAt || new Date().toISOString()).getTime();
                    return dateB - dateA;
                });
                
                this.updateMessagesDisplay('top'); // Scroll to top to show newest messages
                
                // Scroll to highlighted message if specified
                if (highlightMessageId) {
                    setTimeout(() => {
                        this.scrollToMessage(highlightMessageId);
                    }, 100);
                }
                
                console.log(`✅ Loaded ${this.messages.length} messages for conversation ${conversationId}`);
            } else {
                console.error('Failed to load conversation messages:', response.error);
                this.messages = [];
                this.updateMessagesDisplay('none');
                
                if (messagesList) {
                    messagesList.innerHTML = '<div class="error">❌ Failed to load conversation. You may need to send a message to start the conversation.</div>';
                }
            }
        } catch (error) {
            console.error('Error loading conversation messages:', error);
            this.messages = [];
            this.updateMessagesDisplay('none');
            
            const messagesList = document.getElementById('messagesList');
            if (messagesList) {
                messagesList.innerHTML = '<div class="error">❌ Failed to load conversation. Please try again.</div>';
            }
        }
    }

    /**
     * Scroll to and highlight a specific message
     */
    private scrollToMessage(messageId: string): void {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElement.classList.add('highlighted');
            
            // Remove highlight after 3 seconds
            setTimeout(() => {
                messageElement.classList.remove('highlighted');
            }, 3000);
        }
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

        if (this.currentForm === 'login') {
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
                            <div class="form-footer">
                                <p>Don't have an account? <a id="showRegisterLink" href="#" class="register-link">Register here</a></p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            app.innerHTML = `
                <div class="chat-app">
                    <div class="header">
                        <h1>💬 ${config.APP_NAME}</h1>
                    </div>
                    <div class="login-container">
                        <div class="login-form">
                            <h2>📝 Register for ChatFlow</h2>
                            <div class="form-group">
                                <label for="email">📧 Email:</label>
                                <input id="email" type="email" placeholder="Enter your email" />
                            </div>
                            <div class="form-group">
                                <label for="displayName">👤 Display Name:</label>
                                <input id="displayName" type="text" placeholder="Enter your display name" />
                            </div>
                            <div class="form-group">
                                <label for="password">🔒 Password:</label>
                                <input id="password" type="password" placeholder="Enter your password" />
                            </div>
                            <button id="registerBtn" class="login-btn">✨ Register</button>
                            <div id="registerError" class="error-message" style="display: none;"></div>
                            <div class="form-footer">
                                <p>Already have an account? <a id="showLoginLink" href="#" class="register-link">Login here</a></p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        this.bindEvents();
    }

    private showRegisterForm() {
        this.currentForm = 'register';
        this.showLoginForm();
    }

    private showLoginFormView() {
        this.currentForm = 'login';
        this.showLoginForm();
    }

    private async handleRegister() {
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const displayNameInput = document.getElementById('displayName') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        const registerBtn = document.getElementById('registerBtn') as HTMLButtonElement;
        const errorDiv = document.getElementById('registerError') as HTMLDivElement;

        const email = emailInput.value.trim();
        const displayName = displayNameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !displayName || !password) {
            this.showRegisterError('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            this.showRegisterError('Password must be at least 6 characters long');
            return;
        }

        if (registerBtn.disabled) {
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = 'Registering...';
        errorDiv.style.display = 'none';

        try {
            const response = await apiService.register({ email, password, displayName });

            if (response.success && response.data) {
                // Registration successful, proceed with automatic login
                console.log('Registration successful, logging in automatically...');
                
                // Don't set currentUser from registration response, wait for login response
                const loginResponse = await apiService.login({ email, password });
                if (loginResponse.success && loginResponse.data) {
                    // Set currentUser from login response which has complete user data
                    this.currentUser = loginResponse.data.user;
                    this.isLoggedIn = true;
                    apiService.setToken(loginResponse.data.token);
                    
                    // Initialize encryption system after authentication
                    try {
                        await apiService.initializeEncryption();
                        console.log('🔐 Encryption system ready');
                    } catch (error) {
                        console.warn('🔐 Encryption initialization failed, continuing without encryption:', error);
                    }
                    
                    await this.initializeWebSocket(loginResponse.data.token);
                    this.showMainInterface();
                } else {
                    this.showRegisterError('Registration successful but login failed. Please try logging in manually.');
                }
            } else {
                this.showRegisterError(response.error?.message || 'Registration failed');
            }
        } catch (error) {
            this.showRegisterError('Network error. Please try again.');
            console.error('Registration error:', error);
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = '✨ Register';
        }
    }

    private showMainInterface() {
        const app = document.getElementById('app');
        if (!app) return;

        app.innerHTML = `
            <!-- Conversation Sidebar -->
            <div id="conversationSidebarContainer"></div>
            
            <div class="chat-app main-content">
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
                            <div class="conversation-participants">
                                <div class="participants-header">
                                    <span class="participants-icon">👥</span>
                                    <span class="participants-label">Conversation:</span>
                                </div>
                                <div id="participantsDisplay" class="participants-display">
                                    Select a conversation from the sidebar or search
                                </div>
                            </div>
                            <div class="llm-delegation-control">
                                <label for="llmToggle" class="toggle-label">
                                    <span>🤖 Delegate to Local LLM</span>
                                    <div class="toggle-switch">
                                        <input type="checkbox" id="llmToggle" ${this.isLlmDelegationEnabled ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </div>
                                </label>
                            </div>
                            <div class="connection-status">
                                <span class="${this.getConnectionStatusClass()}">🔗 ${this.connectionStatus}</span>
                            </div>
                        </div>
                        <div class="messages-container">
                            <div id="messagesList" class="messages-list">
                                <!-- Messages will be inserted here -->
                            </div>
                        </div>
                        <div class="message-input-container">
                            <div class="message-input">
                                <input id="messageInput" type="text" placeholder="Type a message..." />
                                <div class="send-button-container">
                                    <button id="sendBtn">📤 Send</button>
                                    <div id="llmSpinner" class="llm-spinner" style="display: none;">
                                        <div class="spinner"></div>
                                        <span class="spinner-text">🤖 AI thinking...</span>
                                    </div>
                                </div>
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
            this.initializeConversationSidebar();
            this.bindSidebarEvents();
            this.updateMessagesDisplay('none'); // Don't auto-scroll on interface load
            
            // Set default view and expose the app globally
            this.switchView(this.currentView);
            (window as any).chatApp = this;
        }, 0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ChatFlowApp();
}); 