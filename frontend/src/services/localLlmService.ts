// Import web shims for browser environment
import 'openai/shims/web';
import OpenAI from 'openai';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import { MessageDisplay } from '../app.js';

interface LlmConfig {
    baseURL: string;
    model: string;
    temperature: number;
    maxTokens: number;
    stream: boolean;
}

interface LlmRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    temperature: number;
    max_tokens: number;
    stream: boolean;
}

export class LocalLlmService {
    private client: OpenAI;
    private config: LlmConfig;
    private isEnabled: boolean = false;

    constructor() {
        this.config = {
            baseURL: 'http://127.0.0.1:1234/v1',
            model: 'qwen3-4b',
            temperature: 0.7,
            maxTokens: -1,
            stream: false
        };

        this.client = new OpenAI({
            baseURL: this.config.baseURL,
            apiKey: 'local-llm', // Local LLM endpoints often don't require real API keys
            dangerouslyAllowBrowser: true, // Required for client-side usage
        });
    }

    /**
     * Enable or disable local LLM delegation
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        console.log(`🤖 Local LLM delegation ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if local LLM is enabled
     */
    isLlmEnabled(): boolean {
        return this.isEnabled;
    }

    /**
     * Generate response using local LLM
     */
    async generateResponse(messages: MessageDisplay[], currentUserEmail: string): Promise<string> {
        if (!this.isEnabled) {
            throw new Error('Local LLM is not enabled');
        }

        try {
            const llmRequest = this.buildLlmRequest(messages, currentUserEmail);
            
            console.log('🤖 Sending request to local LLM:', {
                model: llmRequest.model,
                messagesCount: llmRequest.messages.length,
                temperature: llmRequest.temperature
            });

            const response = await this.client.chat.completions.create({
                model: llmRequest.model,
                messages: llmRequest.messages,
                temperature: llmRequest.temperature,
                max_tokens: llmRequest.max_tokens === -1 ? undefined : llmRequest.max_tokens,
                stream: llmRequest.stream
            });

            // Since we're using stream: false, we can safely cast to ChatCompletion
            const chatCompletion = response as ChatCompletion;
            const content = chatCompletion.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error('No response content from local LLM');
            }

            console.log('🤖 Received response from local LLM');
            return content.trim();

        } catch (error) {
            console.error('🤖 Local LLM request failed:', error);
            throw new Error(`Local LLM request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Build LLM request using template-based approach
     */
    private buildLlmRequest(messages: MessageDisplay[], currentUserEmail: string): LlmRequest {
        // Build the system prompt using template approach
        const systemPrompt = `You are sender ${currentUserEmail} in a conversation. Here is all conversation messages in JSON array you get so far. Please reply it just in text message for content you send to the conversation.`;

        // Convert messages to a clean format for LLM
        const messagesForLlm = messages.map(msg => ({
            id: msg.id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            senderDisplayName: msg.senderDisplayName,
            messageType: msg.messageType,
            content: msg.content,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt
        }));

        // Use template-based message generation
        const userContent = JSON.stringify(messagesForLlm);

        return {
            model: this.config.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent }
            ],
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            stream: false
        };
    }

    /**
     * Update LLM configuration
     */
    updateConfig(newConfig: Partial<LlmConfig>): void {
        this.config = { ...this.config, ...newConfig };
        
        // Recreate client if baseURL changed
        if (newConfig.baseURL) {
            this.client = new OpenAI({
                baseURL: this.config.baseURL,
                apiKey: 'local-llm',
                dangerouslyAllowBrowser: true
            });
        }
        
        console.log('🤖 Local LLM config updated:', this.config);
    }

    /**
     * Test connection to local LLM
     */
    async testConnection(): Promise<boolean> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: 'user', content: 'Hello, this is a connection test.' }
                ],
                temperature: 0.1,
                max_tokens: -1,
                stream: false,
            });

            // Since we're not streaming, we can safely cast to ChatCompletion
            const chatCompletion = response as ChatCompletion;
            return !!chatCompletion.choices?.[0]?.message?.content;
        } catch (error) {
            console.error('🤖 Local LLM connection test failed:', error);
            return false;
        }
    }
}

export const localLlmService = new LocalLlmService(); 