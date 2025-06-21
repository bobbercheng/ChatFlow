import { apiService } from '../../../../services/apiService.js';

export interface SearchResult {
  messageId: string;
  conversationId: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  createdAt: string;
  relevanceScore: number;
  highlightedContent?: string;
  conversationContext?: {
    participantEmails: string[];
    conversationType: string;
    summary?: string;
  };
}

export interface SearchSuggestion {
  suggestion: string;
  type: 'topic' | 'person' | 'recent' | 'conversation';
  count: number;
}

export class SearchComponent {
  private container: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchButton!: HTMLButtonElement;
  private suggestionsContainer!: HTMLElement;
  private resultsContainer!: HTMLElement;
  private loadingIndicator!: HTMLElement;
  private currentQuery: string = '';
  private debounceTimeout: number | null = null;
  private isSearching: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
    this.attachEventListeners();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="search-container">
        <!-- Search Header -->
        <div class="search-header">
          <h2 class="search-title">
            <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Smart Search
          </h2>
          <p class="search-subtitle">Find conversations, messages, and information using natural language</p>
        </div>

        <!-- Search Input -->
        <div class="search-input-container">
          <div class="search-input-wrapper">
            <svg class="search-input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              class="search-input"
              placeholder="Search conversations... (e.g., 'lunch plans with Sarah')"
              maxlength="500"
            />
            <button class="search-button" type="button">
              <span class="search-button-text">Search</span>
              <svg class="search-button-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
          
          <!-- Suggestions Dropdown -->
          <div class="suggestions-container" style="display: none;">
            <div class="suggestions-header">
              <span class="suggestions-title">Suggestions</span>
            </div>
            <div class="suggestions-list"></div>
          </div>
        </div>

        <!-- Search Status -->
        <div class="search-status">
          <div class="loading-indicator" style="display: none;">
            <div class="loading-spinner"></div>
            <span class="loading-text">Searching conversations...</span>
          </div>
          <div class="search-stats" style="display: none;">
            <span class="stats-text"></span>
          </div>
        </div>

        <!-- Search Results -->
        <div class="search-results">
          <div class="results-container" style="display: none;">
            <div class="results-header">
              <h3 class="results-title">Search Results</h3>
              <div class="results-meta"></div>
            </div>
            <div class="results-list"></div>
          </div>

          <!-- Empty State -->
          <div class="empty-state">
            <div class="empty-state-content">
              <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h3 class="empty-state-title">Start Searching</h3>
              <p class="empty-state-description">
                Use natural language to find conversations and messages.<br>
                Try searches like "meeting notes", "project updates", or "messages from John".
              </p>
              <div class="empty-state-examples">
                <p class="examples-title">Example searches:</p>
                <div class="examples-list">
                  <button class="example-button" data-query="lunch plans">🍽️ lunch plans</button>
                  <button class="example-button" data-query="project deadline">📅 project deadline</button>
                  <button class="example-button" data-query="meeting today">📅 meeting today</button>
                  <button class="example-button" data-query="document shared">📄 document shared</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Get DOM references
    this.searchInput = this.container.querySelector('.search-input') as HTMLInputElement;
    this.searchButton = this.container.querySelector('.search-button') as HTMLButtonElement;
    this.suggestionsContainer = this.container.querySelector('.suggestions-container') as HTMLElement;
    this.resultsContainer = this.container.querySelector('.results-container') as HTMLElement;
    this.loadingIndicator = this.container.querySelector('.loading-indicator') as HTMLElement;
  }

  private attachEventListeners(): void {
    // Search input events
    this.searchInput.addEventListener('input', this.handleInputChange.bind(this));
    this.searchInput.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.searchInput.addEventListener('focus', this.handleInputFocus.bind(this));
    this.searchInput.addEventListener('blur', this.handleInputBlur.bind(this));

    // Search button
    this.searchButton.addEventListener('click', this.handleSearch.bind(this));

    // Example query buttons
    const exampleButtons = this.container.querySelectorAll('.example-button');
    exampleButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const query = (e.target as HTMLElement).dataset.query;
        if (query) {
          this.searchInput.value = query;
          this.handleSearch();
        }
      });
    });

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.hideSuggestions();
      }
    });
  }

  private handleInputChange(): void {
    const query = this.searchInput.value.trim();
    this.currentQuery = query;

    // Clear previous debounce
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    if (query.length >= 2) {
      // Debounce suggestions
      this.debounceTimeout = window.setTimeout(() => {
        this.fetchSuggestions(query);
      }, 300);
    } else {
      this.hideSuggestions();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.handleSearch();
    } else if (e.key === 'Escape') {
      this.hideSuggestions();
    }
  }

  private handleInputFocus(): void {
    if (this.currentQuery.length >= 2) {
      this.showSuggestions();
    }
  }

  private handleInputBlur(): void {
    // Delay hiding suggestions to allow clicks
    setTimeout(() => {
      this.hideSuggestions();
    }, 200);
  }

  private async handleSearch(): Promise<void> {
    const query = this.searchInput.value.trim();
    
    if (!query) {
      this.showError('Please enter a search query');
      return;
    }

    if (this.isSearching) {
      return; // Prevent multiple simultaneous searches
    }

    this.isSearching = true;
    this.showLoading();
    this.hideSuggestions();
    this.hideEmptyState();

    try {
      const response = await apiService.searchConversations(query, { limit: 20 });
      
      if (response.success) {
        this.displayResults(response.data.results, response.data);
      } else {
        this.showError('Search failed. Please try again.');
      }
    } catch (error) {
      console.error('Search error:', error);
      this.showError('Search failed. Please check your connection and try again.');
    } finally {
      this.isSearching = false;
      this.hideLoading();
    }
  }

  private async fetchSuggestions(query: string): Promise<void> {
    try {
      const response = await apiService.getSearchSuggestions(query, 5);
      
      if (response.success && response.data.length > 0) {
        this.displaySuggestions(response.data);
        this.showSuggestions();
      } else {
        this.hideSuggestions();
      }
    } catch (error) {
      console.error('Suggestions error:', error);
      this.hideSuggestions();
    }
  }

  private displaySuggestions(suggestions: SearchSuggestion[]): void {
    const suggestionsList = this.suggestionsContainer.querySelector('.suggestions-list') as HTMLElement;
    
    suggestionsList.innerHTML = suggestions.map(suggestion => `
      <div class="suggestion-item" data-suggestion="${suggestion.suggestion}">
        <div class="suggestion-content">
          <span class="suggestion-text">${this.escapeHtml(suggestion.suggestion)}</span>
          <span class="suggestion-type ${suggestion.type}">${suggestion.type}</span>
        </div>
        <span class="suggestion-count">${suggestion.count}</span>
      </div>
    `).join('');

    // Add click handlers to suggestions
    suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', async () => {
        const suggestion = item.getAttribute('data-suggestion');
        const suggestionType = item.querySelector('.suggestion-type')?.textContent;
        
        if (suggestion) {
          // Track suggestion click for analytics
          try {
            await apiService.trackSuggestionClick(this.currentQuery, suggestion, suggestionType || 'unknown');
            console.log('✅ Suggestion click tracked:', { query: this.currentQuery, suggestion, type: suggestionType });
          } catch (error) {
            console.error('Failed to track suggestion click:', error);
            // Continue with search even if tracking fails
          }
          
          this.searchInput.value = suggestion;
          this.handleSearch();
        }
      });
    });
  }

  private displayResults(results: SearchResult[], metadata: any): void {
    const resultsList = this.resultsContainer.querySelector('.results-list') as HTMLElement;
    const resultsMeta = this.resultsContainer.querySelector('.results-meta') as HTMLElement;

    // Update metadata
    const searchTime = metadata.searchTime ? `${metadata.searchTime}ms` : '';
    resultsMeta.innerHTML = `
      <span class="results-count">${results.length} results</span>
      ${searchTime ? `<span class="search-time">in ${searchTime}</span>` : ''}
    `;

    if (results.length === 0) {
      resultsList.innerHTML = `
        <div class="no-results">
          <div class="no-results-content">
            <svg class="no-results-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h4 class="no-results-title">No results found</h4>
            <p class="no-results-description">
              Try different keywords or check for typos.<br>
              Search looks through your conversation history.
            </p>
          </div>
        </div>
      `;
    } else {
      resultsList.innerHTML = results.map(result => this.renderSearchResult(result)).join('');
      
      // Add click handlers to results
      resultsList.querySelectorAll('.search-result').forEach(item => {
        item.addEventListener('click', () => {
          const conversationId = item.getAttribute('data-conversation-id');
          const messageId = item.getAttribute('data-message-id');
          if (conversationId) {
            this.navigateToConversation(conversationId, messageId);
          }
        });
      });
    }

    this.showResults();
  }

  private renderSearchResult(result: SearchResult): string {
    const createdAt = new Date(result.createdAt);
    const timeAgo = this.getTimeAgo(createdAt);
    const relevancePercentage = Math.round(result.relevanceScore * 100);
    
    const content = result.highlightedContent || result.content;
    const truncatedContent = content.length > 200 
      ? content.substring(0, 200) + '...' 
      : content;

    return `
      <div class="search-result" data-conversation-id="${result.conversationId}" data-message-id="${result.messageId}">
        <div class="result-header">
          <div class="result-sender">
            <div class="sender-avatar">
              ${result.senderDisplayName.charAt(0).toUpperCase()}
            </div>
            <span class="sender-name">${this.escapeHtml(result.senderDisplayName)}</span>
          </div>
          <div class="result-meta">
            <span class="result-time" title="${createdAt.toLocaleString()}">${timeAgo}</span>
            <span class="result-relevance">${relevancePercentage}% match</span>
          </div>
        </div>
        <div class="result-content">
          <p class="result-text">${this.highlightSearchTerms(truncatedContent)}</p>
        </div>
        <div class="result-footer">
          <span class="result-conversation">
            ${result.conversationContext?.conversationType === 'GROUP' ? '👥' : '💬'} 
            Conversation
          </span>
          <svg class="result-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    `;
  }

  private highlightSearchTerms(content: string): string {
    // Replace **term** with highlighted spans
    return content.replace(/\*\*(.*?)\*\*/g, '<mark class="search-highlight">$1</mark>');
  }

  private navigateToConversation(conversationId: string, messageId?: string | null): void {
    // This would integrate with your app's routing
    console.log('Navigate to conversation:', conversationId, 'message:', messageId);
    
    // Emit event with both conversationId and messageId
    const event = new CustomEvent('navigateToConversation', {
      detail: { conversationId, messageId }
    });
    window.dispatchEvent(event);
  }

  private showSuggestions(): void {
    this.suggestionsContainer.style.display = 'block';
  }

  private hideSuggestions(): void {
    this.suggestionsContainer.style.display = 'none';
  }

  private showLoading(): void {
    this.loadingIndicator.style.display = 'flex';
    this.searchButton.disabled = true;
    this.searchButton.querySelector('.search-button-text')!.textContent = 'Searching...';
  }

  private hideLoading(): void {
    this.loadingIndicator.style.display = 'none';
    this.searchButton.disabled = false;
    this.searchButton.querySelector('.search-button-text')!.textContent = 'Search';
  }

  private showResults(): void {
    this.resultsContainer.style.display = 'block';
    this.hideEmptyState();
  }

  private hideResults(): void {
    this.resultsContainer.style.display = 'none';
  }

  private hideEmptyState(): void {
    const emptyState = this.container.querySelector('.empty-state') as HTMLElement;
    emptyState.style.display = 'none';
  }

  private showEmptyState(): void {
    const emptyState = this.container.querySelector('.empty-state') as HTMLElement;
    emptyState.style.display = 'block';
    this.hideResults();
  }

  private showError(message: string): void {
    // Simple error display - could be enhanced with a proper error component
    alert(message);
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public methods
  public clear(): void {
    this.searchInput.value = '';
    this.currentQuery = '';
    this.hideSuggestions();
    this.hideResults();
    this.showEmptyState();
  }

  public setQuery(query: string): void {
    this.searchInput.value = query;
    this.currentQuery = query;
  }

  public focus(): void {
    this.searchInput.focus();
  }
} 