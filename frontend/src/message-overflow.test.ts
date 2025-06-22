// Test for message overflow and text wrapping behavior
describe('Message Overflow and Text Wrapping', () => {
    let mockMessagesList: HTMLElement;
    let mockApp: any;

    beforeEach(() => {
        // Create mock messages list element
        mockMessagesList = document.createElement('div');
        mockMessagesList.id = 'messagesList';
        mockMessagesList.className = 'messages-list';
        
        // Set up container dimensions
        Object.defineProperty(mockMessagesList, 'clientWidth', {
            value: 400,
            writable: true
        });
        Object.defineProperty(mockMessagesList, 'scrollWidth', {
            value: 400,
            writable: true
        });
        
        document.body.appendChild(mockMessagesList);

        // Add CSS styles for testing
        const style = document.createElement('style');
        style.textContent = `
            .messages-list {
                width: 400px;
                overflow-x: hidden;
                padding: 20px;
            }
            .message {
                margin-bottom: 1.5rem;
                padding: 1rem 1.5rem;
                border-radius: 16px;
                max-width: 75%;
                position: relative;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                min-width: 0;
            }
            .message-sent {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin-left: auto;
                text-align: right;
            }
            .message-received {
                background: #f8fafc;
                color: #374151;
                margin-right: auto;
                border: 1px solid #e5e7eb;
            }
            .message-content {
                font-size: 1rem;
                line-height: 1.6;
                margin: 0;
                word-wrap: break-word;
                word-break: break-word;
                overflow-wrap: break-word;
                white-space: pre-wrap;
            }
            .message-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.75rem;
                font-size: 0.75rem;
                opacity: 0.8;
            }
        `;
        document.head.appendChild(style);

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
                            <span class="sender">${message.senderDisplayName || 'Unknown'}</span>
                            <span class="timestamp">${message.formattedTime}</span>
                        </div>
                        <div class="message-content">${this.escapeHtml(message.content || '')}</div>
                    </div>
                `).join('');
            },
            getMessageCssClass: function(message: any) {
                const baseClass = 'message';
                const typeClass = message.senderId === this.currentUser?.email ? 'message-sent' : 'message-received';
                return `${baseClass} ${typeClass}`;
            },
            formatTime: function(timestamp: string) {
                return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            },
            escapeHtml: function(text: string) {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            },
            addMessage: function(message: any) {
                const messageDisplay = {
                    ...message,
                    cssClass: this.getMessageCssClass(message),
                    formattedTime: this.formatTime(message.createdAt || new Date().toISOString())
                };

                this.messages = [messageDisplay, ...this.messages];
                this.updateMessagesDisplay('top');
            },
            loadConversationMessages: function(messages: any[]) {
                this.messages = messages.map(msg => ({
                    ...msg,
                    cssClass: this.getMessageCssClass(msg),
                    formattedTime: this.formatTime(msg.createdAt || new Date().toISOString())
                }));
                this.updateMessagesDisplay('top');
            },
            // Mock the navigateToConversation method
            navigateToConversation: async function(conversationId: string, messageId?: string) {
                // Simulate the actual navigation behavior
                this.conversationId = conversationId;
                
                // Mock API response with problematic messages
                const mockApiResponse = {
                    success: true,
                    data: {
                        data: [
                            {
                                id: 'msg_1',
                                conversationId: conversationId,
                                senderId: 'bobber@gmail.com',
                                senderDisplayName: 'Bobber',
                                content: 'Yes, I need more sleep. How to enjoy more sleep?',
                                createdAt: '2025-01-01T12:00:00Z'
                            },
                            {
                                id: 'msg_2',
                                conversationId: conversationId,
                                senderId: 'system@chatflow.com',
                                senderDisplayName: 'System',
                                content: '{ "success": false, "error": { "message": "9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project_create_composite=CmFwcm9qZWN0SWQyOYWN0LWNibnRlci1pbnNWaOdaXBibnRZZh0y1wbGUvZGF0YWJhc2UvZGVmYXVsdC5zdWJjb2xlY3Rpb25zL2ljb25zL2RvY3MvY29tcG9zaXRlSW5kZXhlcw==", "code": 9 } }',
                                createdAt: '2025-01-01T12:01:00Z'
                            },
                            {
                                id: 'msg_3',
                                conversationId: conversationId,
                                senderId: 'bobber@gmail.com',
                                senderDisplayName: 'Bobber',
                                content: 'I got backend api error with request curl -X \'GET\' \'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1/conversations?page=1&limit=20\' -H \'accept: application/json\' -H \'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJvYmJlckBnbWFpbC5jb20iLCJzdWIiOiJmYWZhZmFmYWZhZmFmYWZhZiIsImlhdCI6MTczNDc3NjQ2NCwiZXhwIjoxNzM0NzgwMDY0fQ.zrZXQ0QGYVY1wbGUuY29tZGFWMjMtNTc5YTQKQRWENGAiGJVEOA5LCJIeHAiOjE3MzE0TKMTI5.TKKET2CMqN13 issue when I deploy backend to cloud run with terraform and did sanity test yesterday. Please investigate and explain why this issue happy today.',
                                createdAt: '2025-01-01T12:02:00Z'
                            }
                        ]
                    }
                };
                
                // Process messages as in the actual app
                this.messages = mockApiResponse.data.data.map((message: any) => {
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
                this.messages.sort((a: any, b: any) => {
                    const dateA = new Date(a.createdAt || new Date().toISOString()).getTime();
                    const dateB = new Date(b.createdAt || new Date().toISOString()).getTime();
                    return dateB - dateA;
                });
                
                this.updateMessagesDisplay('top');
            }
        };
    });

    afterEach(() => {
        document.body.removeChild(mockMessagesList);
        // Clean up styles
        const styles = document.querySelectorAll('style');
        styles.forEach(style => {
            if (style.textContent?.includes('.messages-list')) {
                document.head.removeChild(style);
            }
        });
    });

    test('should wrap long URLs without overflowing container', () => {
        const longUrlMessage = {
            id: 'msg_1',
            conversationId: 'conv_1',
            senderId: 'other@example.com',
            senderDisplayName: 'Other User',
            content: 'Check out this really long URL: https://example.com/very/long/path/with/many/segments/that/could/potentially/overflow/the/container/if/not/properly/handled/with/word-wrapping/css/properties',
            createdAt: '2025-01-01T12:00:00Z'
        };

        mockApp.addMessage(longUrlMessage);

        // Verify message was added
        expect(mockApp.messages).toHaveLength(1);
        
        // Get the rendered message element
        const messageElement = mockMessagesList.querySelector('.message') as HTMLElement;
        expect(messageElement).toBeTruthy();
        
        // Check that the message doesn't overflow the container
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = mockMessagesList.getBoundingClientRect();
        
        // Message should not exceed container width
        expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
        
        // Verify word-wrap CSS is applied
        const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
        expect(messageContent).toBeTruthy();
        
        const computedStyle = window.getComputedStyle(messageContent);
        expect(computedStyle.wordWrap).toBe('break-word');
        expect(computedStyle.wordBreak).toBe('break-word');
        expect(computedStyle.overflowWrap).toBe('break-word');
    });

    test('should wrap long JSON error messages without overflowing', () => {
        const jsonErrorMessage = {
            id: 'msg_2',
            conversationId: 'conv_1',
            senderId: 'system@example.com',
            senderDisplayName: 'System',
            content: '{ "success": false, "error": { "message": "9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project_id/firestore/database/default/create_composite=CmFwcm9qZWN0SWQyOYWN0LWNibnRlci1pbnNWaOdaXBibnRZZh0y1wbGUvZGF0YWJhc2UvZGVmYXVsdC5zdWJjb2xlY3Rpb25zL2ljb25zL2RvY3MvY29tcG9zaXRlSW5kZXhlcw==", "code": 9 } }',
            createdAt: '2025-01-01T12:01:00Z'
        };

        mockApp.addMessage(jsonErrorMessage);

        // Verify message was added
        expect(mockApp.messages).toHaveLength(1);
        
        // Get the rendered message element
        const messageElement = mockMessagesList.querySelector('.message') as HTMLElement;
        expect(messageElement).toBeTruthy();
        
        // Check that the message doesn't overflow the container
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = mockMessagesList.getBoundingClientRect();
        
        // Message should not exceed container width
        expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
        
        // Verify content is properly escaped and wrapped
        const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
        expect(messageContent).toBeTruthy();
        expect(messageContent.textContent).toContain('FAILED_PRECONDITION');
        expect(messageContent.textContent).toContain('https://console.firebase.google.com');
    });

    test('should wrap very long single words without overflowing', () => {
        const longWordMessage = {
            id: 'msg_3',
            conversationId: 'conv_1',
            senderId: 'user@example.com',
            senderDisplayName: 'User',
            content: 'This is a message with a supercalifragilisticexpialidociouslyverylongwordthatcouldpotentiallyoverflowthecontainerifnotproperlyhandled',
            createdAt: '2025-01-01T12:02:00Z'
        };

        mockApp.addMessage(longWordMessage);

        // Verify message was added
        expect(mockApp.messages).toHaveLength(1);
        
        // Get the rendered message element
        const messageElement = mockMessagesList.querySelector('.message') as HTMLElement;
        expect(messageElement).toBeTruthy();
        
        // Check that the message doesn't overflow the container
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = mockMessagesList.getBoundingClientRect();
        
        // Message should not exceed container width
        expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
        
        // Verify content is properly wrapped
        const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
        expect(messageContent).toBeTruthy();
        expect(messageContent.textContent).toContain('supercalifragilisticexpialidociouslyverylongword');
    });

    test('should handle messages with mixed content types (URLs, text, special characters)', () => {
        const mixedContentMessage = {
            id: 'msg_4',
            conversationId: 'conv_1',
            senderId: 'other@example.com',
            senderDisplayName: 'Other User',
            content: 'Here is some text with a URL: https://verylongdomainname.com/path/to/resource?param1=value1&param2=verylongvalue2&param3=anotherlongvalue3 and some more text after it. Also some special characters: ñáéíóú@#$%^&*()[]{}|\\:";\'<>?,./`~',
            createdAt: '2025-01-01T12:03:00Z'
        };

        mockApp.addMessage(mixedContentMessage);

        // Verify message was added
        expect(mockApp.messages).toHaveLength(1);
        
        // Get the rendered message element
        const messageElement = mockMessagesList.querySelector('.message') as HTMLElement;
        expect(messageElement).toBeTruthy();
        
        // Check that the message doesn't overflow the container
        const messageRect = messageElement.getBoundingClientRect();
        const containerRect = mockMessagesList.getBoundingClientRect();
        
        // Message should not exceed container width
        expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
        
        // Verify content is properly handled
        const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
        expect(messageContent).toBeTruthy();
        expect(messageContent.textContent).toContain('verylongdomainname.com');
        expect(messageContent.textContent).toContain('special characters');
    });

    test('should handle messages loaded from search results without overflow', () => {
        // Simulate loading messages from search results (as in navigateToConversation)
        const searchResultMessages = [
            {
                id: 'msg_1',
                conversationId: 'conv_1',
                senderId: 'user@example.com',
                senderDisplayName: 'User',
                content: 'I got backend api error with request curl -X \'GET\' \'https://chatflow-backend-3w6u4kmniq-ue.a.run.app/v1/conversations?page=1&limit=20\' -H \'accept: application/json\' -H \'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJvYmJlckBnbWFpbC5jb20iLCJzdWIiOiJmYWZhZmFmYWZhZmFmYWZhZiIsImlhdCI6MTczNDc3NjQ2NCwiZXhwIjoxNzM0NzgwMDY0fQ.zrZXQ0QGYVY1wbGUuY29tZGFWMjMtNTc5YTQKQRWENGAiGJVEOA5LCJIeHAiOjE3MzE0TKMTI5.TKKET2CMqN13',
                createdAt: '2025-01-01T12:00:00Z'
            },
            {
                id: 'msg_2',
                conversationId: 'conv_1',
                senderId: 'system@example.com',
                senderDisplayName: 'System',
                content: '{ "success": false, "error": { "message": "9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project_create_composite=CmFwcm9qZWN0SWQyOYWN0LWNibnZlci1pbnNpZ2h0cy1wb2MtY2hhdGZsb3ctZnJvbnRlbmQvcHJvamVjdHMvY29udGFjdC1jZW50ZXItaW5zaWdodHMtcG9jLWNoYXRmbG93LWZyb250ZW5kL2RhdGFiYXNlcy8oZGVmYXVsdCkvaW5kZXhlcw==", "code": 9 } }',
                createdAt: '2025-01-01T12:01:00Z'
            }
        ];

        mockApp.loadConversationMessages(searchResultMessages);

        // Verify messages were loaded
        expect(mockApp.messages).toHaveLength(2);
        
        // Check each message for proper containment
        const messageElements = mockMessagesList.querySelectorAll('.message');
        expect(messageElements).toHaveLength(2);
        
        messageElements.forEach((messageElement, index) => {
            const messageRect = messageElement.getBoundingClientRect();
            const containerRect = mockMessagesList.getBoundingClientRect();
            
            // Each message should not exceed container width
            expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
            
            // Verify message content is properly wrapped
            const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
            expect(messageContent).toBeTruthy();
            
            const computedStyle = window.getComputedStyle(messageContent);
            expect(computedStyle.wordWrap).toBe('break-word');
            expect(computedStyle.overflowWrap).toBe('break-word');
        });
    });

    test('should maintain message alignment after text wrapping', () => {
        const longSentMessage = {
            id: 'msg_sent',
            conversationId: 'conv_1',
            senderId: 'test@example.com', // Same as currentUser
            senderDisplayName: 'Test User',
            content: 'This is a very long message that I am sending to test the alignment behavior when the message content wraps to multiple lines and should maintain right alignment for sent messages',
            createdAt: '2025-01-01T12:00:00Z'
        };

        const longReceivedMessage = {
            id: 'msg_received',
            conversationId: 'conv_1',
            senderId: 'other@example.com',
            senderDisplayName: 'Other User',
            content: 'This is a very long message that I am receiving to test the alignment behavior when the message content wraps to multiple lines and should maintain left alignment for received messages',
            createdAt: '2025-01-01T12:01:00Z'
        };

        mockApp.addMessage(longSentMessage);
        mockApp.addMessage(longReceivedMessage);

        // Verify messages were added
        expect(mockApp.messages).toHaveLength(2);
        
        // Check sent message (should be right-aligned)
        const sentMessageElement = mockMessagesList.querySelector('[data-message-id="msg_sent"]') as HTMLElement;
        expect(sentMessageElement).toBeTruthy();
        expect(sentMessageElement.classList.contains('message-sent')).toBe(true);
        
        // Check received message (should be left-aligned)
        const receivedMessageElement = mockMessagesList.querySelector('[data-message-id="msg_received"]') as HTMLElement;
        expect(receivedMessageElement).toBeTruthy();
        expect(receivedMessageElement.classList.contains('message-received')).toBe(true);
        
        // Both messages should be properly contained
        [sentMessageElement, receivedMessageElement].forEach(messageElement => {
            const messageRect = messageElement.getBoundingClientRect();
            const containerRect = mockMessagesList.getBoundingClientRect();
            expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
        });
    });

    test('should handle navigation from search results with problematic long messages', async () => {
        // This test simulates the exact scenario from the user's bug report
        const conversationId = 'conv_1750398104117_';
        
        // Simulate clicking on a search result that navigates to a conversation
        await mockApp.navigateToConversation(conversationId);
        
        // Verify messages were loaded
        expect(mockApp.messages).toHaveLength(3);
        expect(mockApp.conversationId).toBe(conversationId);
        
        // Check that all messages are properly contained
        const messageElements = mockMessagesList.querySelectorAll('.message');
        expect(messageElements).toHaveLength(3);
        
        // Verify each message doesn't overflow
        messageElements.forEach((messageElement, index) => {
            const messageRect = messageElement.getBoundingClientRect();
            const containerRect = mockMessagesList.getBoundingClientRect();
            
            // Each message should not exceed container width
            expect(messageRect.width).toBeLessThanOrEqual(containerRect.width);
            
            // Verify message content is properly wrapped
            const messageContent = messageElement.querySelector('.message-content') as HTMLElement;
            expect(messageContent).toBeTruthy();
            
            const computedStyle = window.getComputedStyle(messageContent);
            expect(computedStyle.wordWrap).toBe('break-word');
            expect(computedStyle.overflowWrap).toBe('break-word');
        });
        
        // Verify the specific problematic messages are handled correctly
        const curlMessageElement = mockMessagesList.querySelector('[data-message-id="msg_3"]') as HTMLElement;
        expect(curlMessageElement).toBeTruthy();
        expect(curlMessageElement.textContent).toContain('curl -X');
        expect(curlMessageElement.textContent).toContain('chatflow-backend-3w6u4kmniq-ue.a.run.app');
        
        const jsonErrorElement = mockMessagesList.querySelector('[data-message-id="msg_2"]') as HTMLElement;
        expect(jsonErrorElement).toBeTruthy();
        expect(jsonErrorElement.textContent).toContain('FAILED_PRECONDITION');
        expect(jsonErrorElement.textContent).toContain('console.firebase.google.com');
        
        // Verify that long URLs and tokens are wrapped and don't overflow
        const longUrlsAndTokens = ['chatflow-backend-3w6u4kmniq-ue.a.run.app', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'console.firebase.google.com'];
        longUrlsAndTokens.forEach(longContent => {
            const elementWithContent = Array.from(messageElements).find(el => el.textContent?.includes(longContent));
            if (elementWithContent) {
                const rect = elementWithContent.getBoundingClientRect();
                const containerRect = mockMessagesList.getBoundingClientRect();
                expect(rect.width).toBeLessThanOrEqual(containerRect.width);
            }
        });
    });
}); 