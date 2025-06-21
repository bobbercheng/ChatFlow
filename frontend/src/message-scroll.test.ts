// Test for message scrolling behavior
describe('Message Scrolling Behavior', () => {
    let mockMessagesList: HTMLElement;
    let mockApp: any;

    beforeEach(() => {
        // Create mock messages list element
        mockMessagesList = document.createElement('div');
        mockMessagesList.id = 'messagesList';
        mockMessagesList.className = 'messages-list';
        
        // Mock scrollHeight and scrollTop properties
        Object.defineProperty(mockMessagesList, 'scrollHeight', {
            value: 1000,
            writable: true
        });
        Object.defineProperty(mockMessagesList, 'scrollTop', {
            value: 0,
            writable: true
        });
        
        document.body.appendChild(mockMessagesList);

        // Mock ChatFlowApp with minimal implementation
        mockApp = {
            messages: [],
            currentUser: { email: 'test@example.com' },
            updateMessagesDisplay: function(scrollBehavior: 'top' | 'bottom' | 'none' = 'top') {
                const messagesList = document.getElementById('messagesList');
                if (!messagesList) return;

                messagesList.innerHTML = this.messages.map((message: any) => `
                    <div class="${message.cssClass}" data-message-id="${message.id}">
                        <div class="message-header">
                            <span class="sender">${message.senderDisplayName}</span>
                            <span class="timestamp">${message.formattedTime}</span>
                        </div>
                        <div class="message-content">${message.content}</div>
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
            },
            getMessageCssClass: function(message: any) {
                const baseClass = 'message';
                const typeClass = message.senderId === this.currentUser?.email ? 'message-sent' : 'message-received';
                return `${baseClass} ${typeClass}`;
            },
            formatTime: function(timestamp: string) {
                return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            },
            addMessage: function(message: any) {
                const messageDisplay = {
                    ...message,
                    cssClass: this.getMessageCssClass(message),
                    formattedTime: this.formatTime(message.createdAt)
                };

                this.messages = [messageDisplay, ...this.messages];
                this.updateMessagesDisplay('top'); // Scroll to top for new messages
            }
        };
    });

    afterEach(() => {
        document.body.removeChild(mockMessagesList);
    });

    test('should scroll to top when new messages arrive (newest-first ordering)', () => {
        // Initially no messages
        expect(mockApp.messages).toHaveLength(0);
        
        // Add a new message
        const newMessage = {
            id: 'msg_1',
            conversationId: 'conv_1',
            senderId: 'other@example.com',
            senderDisplayName: 'Other User',
            content: 'Hello world!',
            createdAt: '2025-01-01T12:00:00Z'
        };

        mockApp.addMessage(newMessage);

        // Verify message was added to the beginning (newest first)
        expect(mockApp.messages).toHaveLength(1);
        expect(mockApp.messages[0].content).toBe('Hello world!');
        
        // Verify scroll went to top
        expect(mockMessagesList.scrollTop).toBe(0);
    });

    test('should scroll to top for loaded conversations with newest-first ordering', () => {
        // Simulate loading messages from API (newest first)
        const messages = [
            {
                id: 'msg_3',
                conversationId: 'conv_1',
                senderId: 'user@example.com',
                senderDisplayName: 'User',
                content: 'Latest message',
                createdAt: '2025-01-01T14:00:00Z'
            },
            {
                id: 'msg_2',
                conversationId: 'conv_1',
                senderId: 'other@example.com',
                senderDisplayName: 'Other',
                content: 'Middle message',
                createdAt: '2025-01-01T13:00:00Z'
            },
            {
                id: 'msg_1',
                conversationId: 'conv_1',
                senderId: 'user@example.com',
                senderDisplayName: 'User',
                content: 'Oldest message',
                createdAt: '2025-01-01T12:00:00Z'
            }
        ];

        // Sort newest first (as done in loadConversationMessages)
        messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        mockApp.messages = messages.map(msg => ({
            ...msg,
            cssClass: mockApp.getMessageCssClass(msg),
            formattedTime: mockApp.formatTime(msg.createdAt)
        }));

        // Update display with top scroll
        mockApp.updateMessagesDisplay('top');

        // Verify scroll went to top to show newest messages
        expect(mockMessagesList.scrollTop).toBe(0);
        
        // Verify newest message is first
        expect(mockApp.messages[0].content).toBe('Latest message');
        expect(mockApp.messages[2].content).toBe('Oldest message');
    });

    test('should not scroll when scrollBehavior is none', () => {
        // Set initial scroll position
        mockMessagesList.scrollTop = 500;

        mockApp.messages = [{
            id: 'msg_1',
            content: 'Test message',
            cssClass: 'message message-received',
            formattedTime: '12:00'
        }];

        // Update with 'none' scroll behavior
        mockApp.updateMessagesDisplay('none');

        // Verify scroll position unchanged
        expect(mockMessagesList.scrollTop).toBe(500);
    });

    test('should scroll to bottom when explicitly requested', () => {
        mockApp.messages = [{
            id: 'msg_1',
            content: 'Test message',
            cssClass: 'message message-received',
            formattedTime: '12:00'
        }];

        // Update with 'bottom' scroll behavior
        mockApp.updateMessagesDisplay('bottom');

        // Verify scroll went to bottom
        expect(mockMessagesList.scrollTop).toBe(1000); // scrollHeight
    });

    test('should handle multiple new messages correctly', () => {
        // Add first message
        const message1 = {
            id: 'msg_1',
            conversationId: 'conv_1',
            senderId: 'user@example.com',
            senderDisplayName: 'User',
            content: 'First message',
            createdAt: '2025-01-01T12:00:00Z'
        };

        mockApp.addMessage(message1);
        expect(mockApp.messages).toHaveLength(1);
        expect(mockMessagesList.scrollTop).toBe(0);

        // Add second message (newer)
        const message2 = {
            id: 'msg_2',
            conversationId: 'conv_1',
            senderId: 'other@example.com',
            senderDisplayName: 'Other',
            content: 'Second message',
            createdAt: '2025-01-01T12:01:00Z'
        };

        mockApp.addMessage(message2);
        
        // Verify newest message is at index 0
        expect(mockApp.messages).toHaveLength(2);
        expect(mockApp.messages[0].content).toBe('Second message');
        expect(mockApp.messages[1].content).toBe('First message');
        
        // Verify still scrolled to top
        expect(mockMessagesList.scrollTop).toBe(0);
    });

    test('should render messages in correct DOM order (newest first)', () => {
        const messages = [
            {
                id: 'msg_1',
                content: 'Oldest',
                createdAt: '2025-01-01T12:00:00Z'
            },
            {
                id: 'msg_2',
                content: 'Newest',
                createdAt: '2025-01-01T12:02:00Z'
            }
        ];

        // Add messages (newest should go to index 0)
        messages.forEach(msg => {
            mockApp.addMessage({
                ...msg,
                conversationId: 'conv_1',
                senderId: 'user@example.com',
                senderDisplayName: 'User'
            });
        });

        // Check DOM order
        const messageElements = mockMessagesList.querySelectorAll('[data-message-id]');
        expect(messageElements).toHaveLength(2);
        
        // First element should be newest message
        expect(messageElements[0].getAttribute('data-message-id')).toBe('msg_2');
        expect(messageElements[0].textContent).toContain('Newest');
        
        // Second element should be oldest message
        expect(messageElements[1].getAttribute('data-message-id')).toBe('msg_1');
        expect(messageElements[1].textContent).toContain('Oldest');
    });
}); 