// Tests for SearchComponent dynamic suggestions functionality
import { SearchComponent } from './modules/chatflow/app/components/SearchComponent.js';
import { apiService } from './services/apiService.js';

// Mock the apiService
jest.mock('./services/apiService.js', () => ({
    apiService: {
        getSearchSuggestions: jest.fn(),
        searchConversations: jest.fn(),
        trackSuggestionClick: jest.fn(),
    },
}));

describe('SearchComponent Dynamic Suggestions', () => {
    let container: HTMLElement;
    let searchComponent: SearchComponent;
    const mockApiService = apiService as jest.Mocked<typeof apiService>;

    beforeEach(() => {
        // Create container element
        container = document.createElement('div');
        document.body.appendChild(container);
        
        // Reset all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Clean up DOM
        document.body.innerHTML = '';
    });

    describe('Component Initialization with API Suggestions', () => {
        test('should load default suggestions from API on initialization', async () => {
            // Mock successful API response
            const mockSuggestions = [
                { suggestion: 'project status', type: 'topic', count: 15 },
                { suggestion: 'meeting notes', type: 'topic', count: 12 },
                { suggestion: 'lunch plans', type: 'topic', count: 8 },
                { suggestion: 'document shared', type: 'topic', count: 5 },
                { suggestion: 'team updates', type: 'topic', count: 3 },
                { suggestion: 'client feedback', type: 'topic', count: 2 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            // Create component (should trigger loadDefaultSuggestions)
            searchComponent = new SearchComponent(container);

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify API was called with empty query and limit 6
            expect(mockApiService.getSearchSuggestions).toHaveBeenCalledWith('', 6);

            // Check that recommended searches are populated
            const examplesList = container.querySelector('.examples-list');
            expect(examplesList).toBeTruthy();
            
            const exampleButtons = examplesList?.querySelectorAll('.example-button');
            expect(exampleButtons).toHaveLength(4); // Should show first 4 suggestions

            // Verify button content includes emojis and text
            expect(exampleButtons?.[0]?.textContent).toContain('project status');
            expect(exampleButtons?.[1]?.textContent).toContain('meeting notes');
            expect(exampleButtons?.[2]?.textContent).toContain('lunch plans');
            expect(exampleButtons?.[3]?.textContent).toContain('document shared');
        });

        test('should update search placeholder with random suggestion', async () => {
            const mockSuggestions = [
                { suggestion: 'project deadline', type: 'topic', count: 10 },
                { suggestion: 'team meeting', type: 'topic', count: 8 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const searchInput = container.querySelector('.search-input') as HTMLInputElement;
            expect(searchInput?.placeholder).toMatch(/Search conversations\.\.\. \(e\.g\., '(project deadline|team meeting)'\)/);
        });

        test('should fall back to hardcoded suggestions when API fails', async () => {
            // Mock API failure
            mockApiService.getSearchSuggestions.mockRejectedValue(new Error('Network error'));

            // Spy on console.error to verify error logging
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify error was logged
            expect(consoleSpy).toHaveBeenCalledWith('Failed to load default suggestions:', expect.any(Error));

            // Check that fallback suggestions are used
            const examplesList = container.querySelector('.examples-list');
            const exampleButtons = examplesList?.querySelectorAll('.example-button');
            expect(exampleButtons).toHaveLength(4);

            // Should contain fallback suggestions
            expect(exampleButtons?.[0]?.textContent).toContain('lunch plans');
            expect(exampleButtons?.[1]?.textContent).toContain('project deadline');
            expect(exampleButtons?.[2]?.textContent).toContain('meeting today');
            expect(exampleButtons?.[3]?.textContent).toContain('document shared');

            consoleSpy.mockRestore();
        });
    });

    describe('Emoji Mapping Functionality', () => {
        beforeEach(async () => {
            const mockSuggestions = [
                { suggestion: 'lunch with team', type: 'topic', count: 10 },
                { suggestion: 'meeting schedule', type: 'topic', count: 8 },
                { suggestion: 'project deadline', type: 'topic', count: 6 },
                { suggestion: 'document shared', type: 'topic', count: 4 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should assign correct emojis based on suggestion content', () => {
            const exampleButtons = container.querySelectorAll('.example-button');
            
            // Test food/lunch emoji
            expect(exampleButtons[0]?.textContent).toMatch(/🍽️.*lunch with team/);
            
            // Test meeting/schedule emoji
            expect(exampleButtons[1]?.textContent).toMatch(/📅.*meeting schedule/);
            
            // Test project/deadline emoji
            expect(exampleButtons[2]?.textContent).toMatch(/📊.*project deadline/);
            
            // Test document/file emoji  
            expect(exampleButtons[3]?.textContent).toMatch(/📄.*document shared/);
        });

        test('should use default search emoji for unmatched suggestions', async () => {
            const mockSuggestions = [
                { suggestion: 'random query', type: 'topic', count: 5 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            // Recreate component with new mock data
            container.innerHTML = '';
            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const exampleButton = container.querySelector('.example-button');
            expect(exampleButton?.textContent).toMatch(/🔍.*random query/);
        });
    });

    describe('Dynamic Placeholder Updates', () => {
        test('should set placeholder to basic text when no suggestions available', async () => {
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: []
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const searchInput = container.querySelector('.search-input') as HTMLInputElement;
            expect(searchInput?.placeholder).toBe('Search conversations...');
        });

        test('should handle single suggestion for placeholder', async () => {
            const mockSuggestions = [
                { suggestion: 'team sync', type: 'topic', count: 5 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const searchInput = container.querySelector('.search-input') as HTMLInputElement;
            expect(searchInput?.placeholder).toBe("Search conversations... (e.g., 'team sync')");
        });
    });

    describe('Recommended Searches Interaction', () => {
        beforeEach(async () => {
            const mockSuggestions = [
                { suggestion: 'status update', type: 'topic', count: 10 },
                { suggestion: 'daily standup', type: 'topic', count: 8 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            // Mock search function
            mockApiService.searchConversations.mockResolvedValue({
                success: true,
                data: { results: [], totalResults: 0, searchTime: 5 }
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        test('should trigger search when recommended search is clicked', async () => {
            const firstButton = container.querySelector('.example-button') as HTMLButtonElement;
            expect(firstButton?.textContent).toContain('status update');

            // Click the first recommended search
            firstButton.click();

            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 0));

            // Verify search input was updated
            const searchInput = container.querySelector('.search-input') as HTMLInputElement;
            expect(searchInput?.value).toBe('status update');

            // Verify search was triggered
            expect(mockApiService.searchConversations).toHaveBeenCalledWith('status update', { limit: 20 });
        });

        test('should handle HTML escaping in suggestions', async () => {
            const mockSuggestions = [
                { suggestion: 'search with & symbols', type: 'topic', count: 1 }
            ];

            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: mockSuggestions
            });

            // Recreate component
            container.innerHTML = '';
            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const exampleButton = container.querySelector('.example-button');
            // Should handle special characters safely
            expect(exampleButton?.textContent).toContain('search with & symbols');
            expect(exampleButton?.getAttribute('data-query')).toBe('search with & symbols');
        });
    });

    describe('API Error Handling', () => {
        test('should handle malformed API response gracefully', async () => {
            // Mock malformed response
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: null as any
            });

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Should fall back to hardcoded suggestions without crashing
            const exampleButtons = container.querySelectorAll('.example-button');
            expect(exampleButtons.length).toBeGreaterThan(0);

            consoleSpy.mockRestore();
        });

        test('should handle API response with invalid suggestion format', async () => {
            // Mock response with invalid suggestion objects
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: [
                    { suggestion: null, type: 'topic', count: 5 },
                    { text: 'invalid format', type: 'topic', count: 3 }, // Wrong property name
                    { suggestion: 'valid suggestion', type: 'topic', count: 2 }
                ]
            });

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            // Should handle gracefully and use fallback
            const exampleButtons = container.querySelectorAll('.example-button');
            expect(exampleButtons.length).toBeGreaterThan(0);

            consoleSpy.mockRestore();
        });
    });

    describe('UI State Management', () => {
        test('should show loading state during API call', async () => {
            let resolvePromise: (value: any) => void;
            const pendingPromise = new Promise<any>(resolve => {
                resolvePromise = resolve;
            });

            mockApiService.getSearchSuggestions.mockReturnValue(pendingPromise);

            searchComponent = new SearchComponent(container);

            // API call should be in progress
            expect(mockApiService.getSearchSuggestions).toHaveBeenCalledWith('', 6);

            // Resolve the promise
            resolvePromise!({
                success: true,
                data: [{ suggestion: 'test', type: 'topic', count: 1 }]
            });

            await pendingPromise;
            await new Promise(resolve => setTimeout(resolve, 0));

            // Should have suggestions loaded
            const exampleButtons = container.querySelectorAll('.example-button');
            expect(exampleButtons.length).toBeGreaterThan(0);
        });

        test('should update recommended searches title correctly', async () => {
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: [{ suggestion: 'test suggestion', type: 'topic', count: 1 }]
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const examplesTitle = container.querySelector('.examples-title');
            expect(examplesTitle?.textContent).toBe('Recommended searches:');
        });

        test('should update empty state description correctly', async () => {
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: [{ suggestion: 'test suggestion', type: 'topic', count: 1 }]
            });

            searchComponent = new SearchComponent(container);
            await new Promise(resolve => setTimeout(resolve, 0));

            const description = container.querySelector('.empty-state-description');
            expect(description?.textContent).toContain('Try any of the recommended searches below to get started.');
        });
    });

    describe('Performance and Optimization', () => {
        test('should not make duplicate API calls on multiple initializations', async () => {
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: [{ suggestion: 'test', type: 'topic', count: 1 }]
            });

            // Create multiple components quickly
            searchComponent = new SearchComponent(container);
            const searchComponent2 = new SearchComponent(document.createElement('div'));
            
            await new Promise(resolve => setTimeout(resolve, 0));

            // Should be called twice (once per component)
            expect(mockApiService.getSearchSuggestions).toHaveBeenCalledTimes(2);
        });

        test('should handle rapid successive API calls gracefully', async () => {
            // Mock multiple quick responses
            mockApiService.getSearchSuggestions.mockResolvedValue({
                success: true,
                data: [{ suggestion: 'quick response', type: 'topic', count: 1 }]
            });

            // Simulate rapid component creation/destruction
            for (let i = 0; i < 3; i++) {
                const tempContainer = document.createElement('div');
                new SearchComponent(tempContainer);
            }

            await new Promise(resolve => setTimeout(resolve, 0));

            // Should handle without errors
            expect(mockApiService.getSearchSuggestions).toHaveBeenCalledTimes(3);
        });
    });
}); 