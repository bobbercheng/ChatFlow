import { apiService } from '../services/apiService.js';
import { Conversation, Message } from '../types/index.js';

// Extended conversation type with additional UI properties
interface ConversationWithMetadata extends Conversation {
    lastMessage?: Message;
    unreadCount?: number;
    participantDisplayNames?: string[];
}

export interface ConversationSidebarState {
    isCollapsed: boolean;
    conversations: ConversationWithMetadata[];
    selectedConversationId: string;
    isNewModalOpen: boolean;
    isLoading: boolean;
    isRefreshing: boolean;
}

export class ConversationSidebar {
    private container: HTMLElement;
    private state: ConversationSidebarState;
    private onConversationSelect: (conversationId: string) => void;
    private currentUserEmail: string;

    constructor(
        container: HTMLElement, 
        currentUserEmail: string,
        onConversationSelect: (conversationId: string) => void
    ) {
        this.container = container;
        this.currentUserEmail = currentUserEmail;
        this.onConversationSelect = onConversationSelect;
        
        this.state = {
            isCollapsed: this.loadCollapsedState(),
            conversations: [],
            selectedConversationId: '',
            isNewModalOpen: false,
            isLoading: false,
            isRefreshing: false
        };

        this.init();
    }

    private loadCollapsedState(): boolean {
        const stored = localStorage.getItem('chatflow_sidebar_collapsed');
        return stored === 'true';
    }

    private saveCollapsedState(): void {
        localStorage.setItem('chatflow_sidebar_collapsed', this.state.isCollapsed.toString());
    }

    private init(): void {
        this.render();
        this.bindEvents();
        this.loadConversations();
    }

    private render(): void {
        const collapsedClass = this.state.isCollapsed ? 'collapsed' : '';
        
        this.container.innerHTML = `
            <nav class="conversation-sidebar ${collapsedClass}" id="conversationSidebar">
                <div class="sidebar-header">
                    <button class="sidebar-toggle" id="sidebarToggle" title="${this.state.isCollapsed ? 'Expand' : 'Collapse'} Sidebar">
                        <span class="toggle-icon">☰</span>
                        <span class="toggle-text">Conversations</span>
                    </button>
                </div>
                
                <div class="sidebar-content">
                    <div class="sidebar-actions">
                        <button class="action-btn new-conversation-btn" id="newConversationBtn" title="New Conversation">
                            <span class="action-icon">➕</span>
                            <span class="action-text">New Conversation</span>
                        </button>
                        
                        <button class="action-btn refresh-btn" id="refreshBtn" title="Refresh Conversations">
                            <span class="action-icon ${this.state.isRefreshing ? 'spinning' : ''}">🔄</span>
                            <span class="action-text">Refresh</span>
                        </button>
                    </div>
                    
                    <div class="conversation-list" id="conversationList">
                        ${this.renderConversationList()}
                    </div>
                </div>
            </nav>
            
            <!-- New Conversation Modal -->
            <div class="modal-overlay ${this.state.isNewModalOpen ? 'active' : ''}" id="newConversationModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>🆕 Create New Conversation</h3>
                        <button class="modal-close" id="modalCloseBtn">✕</button>
                    </div>
                    <div class="modal-body">
                        <label for="participantEmails">Participant Emails (comma-separated):</label>
                        <input 
                            type="text" 
                            id="participantEmails" 
                            placeholder="alice@example.com, bob@example.com"
                            class="participant-input"
                        />
                        <div class="input-help">Enter email addresses separated by commas</div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="modalCancelBtn">Cancel</button>
                        <button class="btn btn-primary" id="modalCreateBtn">Create Conversation</button>
                    </div>
                </div>
            </div>
        `;
    }

    private renderConversationList(): string {
        if (this.state.isLoading) {
            return `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <span class="loading-text">Loading conversations...</span>
                </div>
            `;
        }

        if (this.state.conversations.length === 0) {
            return `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <div class="empty-title">No conversations yet</div>
                    <div class="empty-subtitle">Start by creating a new conversation</div>
                </div>
            `;
        }

        return this.state.conversations.map(conversation => this.renderConversationItem(conversation)).join('');
    }

    private renderConversationItem(conversation: ConversationWithMetadata): string {
        const isActive = conversation.id === this.state.selectedConversationId;
        const participants = this.getParticipantNames(conversation);
        const lastMessage = conversation.lastMessage || null;
        // Try updatedAt first, then createdAt, then current time
        const timestamp = conversation.updatedAt || conversation.createdAt || new Date().toISOString();
        const timeAgo = this.getTimeAgo(this.parseTimestamp(timestamp));
        const unreadCount = conversation.unreadCount || 0;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" 
                 data-conversation-id="${conversation.id}"
                 title="Click to open conversation">
                <div class="conversation-content">
                    <div class="conversation-header">
                        <div class="participants">
                            <span class="participant-icon">👥</span>
                            <span class="participant-names">${participants}</span>
                        </div>
                        <div class="conversation-meta">
                            <span class="time-ago">${timeAgo}</span>
                            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                        </div>
                    </div>
                    
                    ${lastMessage ? `
                        <div class="last-message">
                            <span class="message-preview">${this.truncateText(lastMessage.content || '', 60)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    private getParticipantNames(conversation: ConversationWithMetadata): string {
        if (!conversation.participants || conversation.participants.length === 0) {
            return 'Unknown';
        }

        const participantCount = conversation.participants.length;
        
        if (participantCount === 1) {
            return 'You';
        }
        
        if (participantCount === 2) {
            return 'Direct Chat';
        }
        
        // For group chat, show member count and participant emails with creator icon
        const createdBy = conversation.createdBy;
        const participantEmails = conversation.participants.map(p => {
            const isCreator = p.userId === createdBy;
            return isCreator ? `${p.userId} 👑` : p.userId;
        }).join(', ');
        
        return `Group Chat (${participantCount} members): ${participantEmails}`;
    }

    private parseTimestamp(timestamp: any): Date {
        // Handle various timestamp formats
        if (!timestamp) {
            return new Date(); // Default to now if no timestamp
        }

        // Handle Firestore timestamp format
        if (typeof timestamp === 'object' && timestamp._seconds) {
            return new Date(timestamp._seconds * 1000 + (timestamp._nanoseconds || 0) / 1000000);
        }

        // Handle ISO string
        if (typeof timestamp === 'string') {
            const parsed = new Date(timestamp);
            if (!isNaN(parsed.getTime())) {
                return parsed;
            }
        }

        // Handle number (Unix timestamp)
        if (typeof timestamp === 'number') {
            return new Date(timestamp);
        }

        // Handle Date object
        if (timestamp instanceof Date) {
            return timestamp;
        }

        // Fallback to current time
        console.warn('Unable to parse timestamp:', timestamp);
        return new Date();
    }

    private getTimeAgo(date: Date): string {
        // Validate the date object
        if (!date || isNaN(date.getTime())) {
            return 'recently';
        }

        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMinutes < 1) return 'now';
        if (diffMinutes < 60) return `${diffMinutes}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        
        try {
            return date.toLocaleDateString();
        } catch (error) {
            console.error('Error getting time ago:', error);
            return 'recently';
        }
    }

    private truncateText(text: string, maxLength: number): string {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    private bindEvents(): void {
        // Toggle sidebar
        const toggleBtn = document.getElementById('sidebarToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleSidebar());
        }

        // New conversation button
        const newConvBtn = document.getElementById('newConversationBtn');
        if (newConvBtn) {
            newConvBtn.addEventListener('click', () => this.openNewConversationModal());
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshConversations());
        }

        // Conversation item clicks
        this.container.addEventListener('click', (e) => {
            const conversationItem = (e.target as HTMLElement).closest('.conversation-item');
            if (conversationItem) {
                const conversationId = conversationItem.getAttribute('data-conversation-id');
                if (conversationId) {
                    this.selectConversation(conversationId);
                }
            }
        });

        // Modal events
        this.bindModalEvents();
    }

    private bindModalEvents(): void {
        // Close modal button
        const closeBtn = document.getElementById('modalCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeNewConversationModal());
        }

        // Cancel button
        const cancelBtn = document.getElementById('modalCancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeNewConversationModal());
        }

        // Create button
        const createBtn = document.getElementById('modalCreateBtn');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreateConversation());
        }

        // Close modal on overlay click
        const modalOverlay = document.getElementById('newConversationModal');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.closeNewConversationModal();
                }
            });
        }

        // Handle Enter key in email input
        const emailInput = document.getElementById('participantEmails') as HTMLInputElement;
        if (emailInput) {
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleCreateConversation();
                }
            });
        }
    }

    private toggleSidebar(): void {
        this.state.isCollapsed = !this.state.isCollapsed;
        this.saveCollapsedState();
        
        const sidebar = document.getElementById('conversationSidebar');
        const toggleBtn = document.getElementById('sidebarToggle');
        
        if (sidebar) {
            sidebar.classList.toggle('collapsed', this.state.isCollapsed);
        }
        
        if (toggleBtn) {
            toggleBtn.title = this.state.isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
        }

        // Notify parent about layout change
        this.notifyLayoutChange();
    }

    private notifyLayoutChange(): void {
        window.dispatchEvent(new CustomEvent('sidebarToggle', {
            detail: { isCollapsed: this.state.isCollapsed }
        }));
    }

    private async loadConversations(): Promise<void> {
        this.state.isLoading = true;
        this.updateConversationList();

        try {
            const response = await apiService.getConversations(1, 50);
            
            if (response.success && response.data) {
                // Transform conversations to include metadata
                this.state.conversations = (response.data.data || []).map(conv => ({
                    ...conv,
                    lastMessage: undefined, // Will be populated when needed
                    unreadCount: 0,
                    participantDisplayNames: []
                }));
                console.info(`📱 Loaded ${this.state.conversations.length} conversations`);
            } else {
                console.error('Failed to load conversations:', response.error);
                this.state.conversations = [];
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.state.conversations = [];
        } finally {
            this.state.isLoading = false;
            this.updateConversationList();
        }
    }

    private async refreshConversations(): Promise<void> {
        this.state.isRefreshing = true;
        this.updateRefreshButton();

        try {
            await this.loadConversations();
            console.info('🔄 Conversations refreshed');
        } finally {
            this.state.isRefreshing = false;
            this.updateRefreshButton();
        }
    }

    private updateRefreshButton(): void {
        const refreshIcon = document.querySelector('.refresh-btn .action-icon');
        if (refreshIcon) {
            refreshIcon.classList.toggle('spinning', this.state.isRefreshing);
        }
    }

    private updateConversationList(): void {
        const listContainer = document.getElementById('conversationList');
        if (listContainer) {
            listContainer.innerHTML = this.renderConversationList();
        }
    }

    private selectConversation(conversationId: string): void {
        // Update UI state
        const previousActive = document.querySelector('.conversation-item.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }

        const newActive = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (newActive) {
            newActive.classList.add('active');
        }

        this.state.selectedConversationId = conversationId;
        
        // Notify parent component
        this.onConversationSelect(conversationId);
        
        console.info(`📱 Selected conversation: ${conversationId}`);
    }

    private openNewConversationModal(): void {
        this.state.isNewModalOpen = true;
        const modal = document.getElementById('newConversationModal');
        if (modal) {
            modal.classList.add('active');
            
            // Focus email input
            const emailInput = document.getElementById('participantEmails') as HTMLInputElement;
            if (emailInput) {
                setTimeout(() => emailInput.focus(), 100);
            }
        }
    }

    private closeNewConversationModal(): void {
        this.state.isNewModalOpen = false;
        const modal = document.getElementById('newConversationModal');
        if (modal) {
            modal.classList.remove('active');
            
            // Clear input
            const emailInput = document.getElementById('participantEmails') as HTMLInputElement;
            if (emailInput) {
                emailInput.value = '';
            }
        }
    }

    private async handleCreateConversation(): Promise<void> {
        const emailInput = document.getElementById('participantEmails') as HTMLInputElement;
        const createBtn = document.getElementById('modalCreateBtn') as HTMLButtonElement;
        
        if (!emailInput || !createBtn) return;

        const emailsText = emailInput.value.trim();
        if (!emailsText) {
            alert('Please enter at least one participant email');
            return;
        }

        // Parse and validate emails
        const participantEmails = emailsText
            .split(',')
            .map(email => email.trim())
            .filter(email => email.length > 0);

        if (participantEmails.length === 0) {
            alert('Please enter valid email addresses');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = participantEmails.filter(email => !emailRegex.test(email));
        
        if (invalidEmails.length > 0) {
            alert(`Invalid email addresses: ${invalidEmails.join(', ')}`);
            return;
        }

        // Create conversation
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';

        try {
            const response = await apiService.createConversation({
                participantEmails
            });

            if (response.success && response.data) {
                console.info('✅ Created new conversation:', response.data.id);
                
                // Add to local state with metadata
                const newConversation: ConversationWithMetadata = {
                    ...response.data,
                    lastMessage: undefined,
                    unreadCount: 0,
                    participantDisplayNames: []
                };
                this.state.conversations.unshift(newConversation);
                this.updateConversationList();
                
                // Select the new conversation
                if (response.data.id) {
                    this.selectConversation(response.data.id);
                }
                
                // Close modal
                this.closeNewConversationModal();
            } else {
                throw new Error(response.error?.message || 'Failed to create conversation');
            }
        } catch (error) {
            console.error('❌ Error creating conversation:', error);
            alert('Failed to create conversation. Please try again.');
        } finally {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Conversation';
        }
    }

    // Public methods
    public setSelectedConversation(conversationId: string): void {
        this.selectConversation(conversationId);
    }

    public refresh(): void {
        this.refreshConversations();
    }

    public getSelectedConversationId(): string {
        return this.state.selectedConversationId;
    }

    public isCollapsed(): boolean {
        return this.state.isCollapsed;
    }
} 