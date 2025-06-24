import { LocalLlmService } from './services/localLlmService.js';
import { MessageDisplay } from './app.js';

describe('Local LLM Integration', () => {
    let llmService: LocalLlmService;
    
    beforeEach(() => {
        llmService = new LocalLlmService();
    });

    test('should initialize with correct default configuration', () => {
        expect(llmService.isLlmEnabled()).toBe(false);
    });

    test('should enable/disable LLM delegation', () => {
        llmService.setEnabled(true);
        expect(llmService.isLlmEnabled()).toBe(true);
        
        llmService.setEnabled(false);
        expect(llmService.isLlmEnabled()).toBe(false);
    });

    test('should throw error when trying to generate response while disabled', async () => {
        const messages: MessageDisplay[] = [
            {
                id: 'msg_1',
                conversationId: 'conv_1',
                senderId: 'user1@example.com',
                senderDisplayName: 'User 1',
                messageType: 'TEXT',
                content: 'Hello',
                createdAt: new Date().toISOString(),
                cssClass: 'message message-received',
                formattedTime: '10:00 AM'
            }
        ];
        
        await expect(
            llmService.generateResponse(messages, 'user2@example.com')
        ).rejects.toThrow('Local LLM is not enabled');
    });

    test('should build correct LLM request format', () => {
        const messages: MessageDisplay[] = [
            {
                id: 'msg_1750650773913_f8pyjydjv',
                conversationId: 'conv_1750602947952_ooi4lpapu',
                senderId: 'user2@example.com',
                senderDisplayName: 'Rohit',
                messageType: 'TEXT',
                content: 'ready for LLM?',
                createdAt: '2025-06-23T03:52:53.913Z',
                cssClass: 'message message-received',
                formattedTime: '11:52 PM'
            },
            {
                id: 'msg_1750646196365_kucqca22b',
                conversationId: 'conv_1750602947952_ooi4lpapu',
                senderId: 'bobbercheng@hotmail.com',
                senderDisplayName: 'Bobber Cheng',
                messageType: 'TEXT',
                content: 'Let check search suggestion click again',
                createdAt: '2025-06-23T02:36:36.373Z',
                cssClass: 'message message-sent',
                formattedTime: '10:36 PM'
            }
        ];

        llmService.setEnabled(true);
        
        // Access private method for testing
        const buildLlmRequest = (llmService as any).buildLlmRequest.bind(llmService);
        const request = buildLlmRequest(messages, 'bobbercheng@hotmail.com');
        
        expect(request.model).toBe('qwen3-4b');
        expect(request.temperature).toBe(0.7);
        expect(request.max_tokens).toBe(-1);
        expect(request.stream).toBe(false);
        expect(request.messages).toHaveLength(2);
        
        expect(request.messages[0].role).toBe('system');
        expect(request.messages[0].content).toContain('bobbercheng@hotmail.com');
        expect(request.messages[0].content).toContain('sender bobbercheng@hotmail.com in a conversation');
        
        expect(request.messages[1].role).toBe('user');
        
        // Parse the JSON string to verify it contains the messages
        const userContent = JSON.parse(request.messages[1].content);
        expect(userContent).toHaveLength(2);
        expect(userContent[0].content).toBe('ready for LLM?');
        expect(userContent[1].content).toBe('Let check search suggestion click again');
    });

    test('should update configuration correctly', () => {
        const newConfig = {
            baseURL: 'http://localhost:8080/v1',
            model: 'llama-2-7b',
            temperature: 0.5,
            maxTokens: 1000
        };
        
        llmService.updateConfig(newConfig);
        
        // Verify config was updated by checking if it affects the request building
        llmService.setEnabled(true);
        const buildLlmRequest = (llmService as any).buildLlmRequest.bind(llmService);
        const request = buildLlmRequest([], 'test@example.com');
        
        expect(request.model).toBe('llama-2-7b');
        expect(request.temperature).toBe(0.5);
        expect(request.max_tokens).toBe(1000);
    });

    test('should handle template-based message generation correctly', () => {
        const messages: MessageDisplay[] = [
            {
                id: 'msg_1',
                conversationId: 'conv_1',
                senderId: 'alice@example.com',
                senderDisplayName: 'Alice',
                messageType: 'TEXT',
                content: 'How are you doing?',
                createdAt: '2025-06-23T12:00:00.000Z',
                cssClass: 'message message-received',
                formattedTime: '12:00 PM'
            }
        ];

        llmService.setEnabled(true);
        const buildLlmRequest = (llmService as any).buildLlmRequest.bind(llmService);
        const request = buildLlmRequest(messages, 'bob@example.com');
        
        // Verify system prompt uses template substitution
        expect(request.messages[0].content).toBe(
            'You are sender bob@example.com in a conversation. Here is all conversation messages in JSON array you get so far. Please reply it just in text message for content you send to the conversation.'
        );
        
        // Verify user content is properly JSON stringified
        const parsedContent = JSON.parse(request.messages[1].content);
        expect(parsedContent[0]).toEqual({
            id: 'msg_1',
            conversationId: 'conv_1',
            senderId: 'alice@example.com',
            senderDisplayName: 'Alice',
            messageType: 'TEXT',
            content: 'How are you doing?',
            createdAt: '2025-06-23T12:00:00.000Z',
            updatedAt: undefined
        });
    });
});

describe('LLM Integration Workflow', () => {
    test('should demonstrate complete workflow from requirements', () => {
        const llmService = new LocalLlmService();
        
        // Test the example messages from the requirements
        const messages: MessageDisplay[] = [
            {
                id: "msg_1750650773913_f8pyjydjv",
                conversationId: "conv_1750602947952_ooi4lpapu",
                senderId: "user2@example.com",
                senderDisplayName: "Rohit",
                messageType: "TEXT",
                content: "ready for LLM?",
                createdAt: "2025-06-23T03:52:53.913Z",
                updatedAt: "2025-06-23T03:52:53.913Z",
                cssClass: "message message-received",
                formattedTime: "11:52 PM"
            },
            {
                id: "msg_1750646196365_kucqca22b",
                conversationId: "conv_1750602947952_ooi4lpapu", 
                senderId: "bobbercheng@hotmail.com",
                senderDisplayName: "Bobber Cheng",
                messageType: "TEXT",
                content: "Let check search suggestion click again",
                createdAt: "2025-06-23T02:36:36.373Z",
                updatedAt: "2025-06-23T02:36:36.373Z",
                cssClass: "message message-sent",
                formattedTime: "10:36 PM"
            }
        ];

        llmService.setEnabled(true);
        const buildLlmRequest = (llmService as any).buildLlmRequest.bind(llmService);
        const request = buildLlmRequest(messages, 'bobbercheng@hotmail.com');
        
        // Verify the request matches the expected format from requirements
        const expectedRequest = {
            model: "qwen3-4b",
            messages: [
                { 
                    role: "system", 
                    content: "You are sender bobbercheng@hotmail.com in a conversation. Here is all conversation messages in JSON array you get so far. Please reply it just in text message for content you send to the conversation." 
                },
                { 
                    role: "user", 
                    content: JSON.stringify([
                        {
                            id: "msg_1750650773913_f8pyjydjv",
                            conversationId: "conv_1750602947952_ooi4lpapu",
                            senderId: "user2@example.com",
                            senderDisplayName: "Rohit",
                            messageType: "TEXT",
                            content: "ready for LLM?",
                            createdAt: "2025-06-23T03:52:53.913Z",
                            updatedAt: "2025-06-23T03:52:53.913Z"
                        },
                        {
                            id: "msg_1750646196365_kucqca22b",
                            conversationId: "conv_1750602947952_ooi4lpapu",
                            senderId: "bobbercheng@hotmail.com",
                            senderDisplayName: "Bobber Cheng",
                            messageType: "TEXT",
                            content: "Let check search suggestion click again",
                            createdAt: "2025-06-23T02:36:36.373Z",
                            updatedAt: "2025-06-23T02:36:36.373Z"
                        }
                    ])
                }
            ],
            temperature: 0.7,
            max_tokens: -1,
            stream: false
        };
        
        expect(request.model).toBe(expectedRequest.model);
        expect(request.temperature).toBe(expectedRequest.temperature);
        expect(request.max_tokens).toBe(expectedRequest.max_tokens);
        expect(request.stream).toBe(expectedRequest.stream);
        expect(request.messages[0].role).toBe(expectedRequest.messages[0].role);
        expect(request.messages[0].content).toBe(expectedRequest.messages[0].content);
        expect(request.messages[1].role).toBe(expectedRequest.messages[1].role);
        
        // Parse and verify the JSON content
        const parsedContent = JSON.parse(request.messages[1].content);
        const expectedContent = JSON.parse(expectedRequest.messages[1].content);
        expect(parsedContent).toEqual(expectedContent);
    });
}); 