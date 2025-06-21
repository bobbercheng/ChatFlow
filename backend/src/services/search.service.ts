import admin from 'firebase-admin';

export interface SearchQuery {
  query: string;
  userId: string;
  limit?: number;
  filters?: {
    participants?: string[];
    timeRange?: {
      start: Date;
      end: Date;
    };
    conversationType?: 'DIRECT' | 'GROUP';
  };
}

export interface SearchResult {
  messageId: string;
  conversationId: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  createdAt: Date;
  relevanceScore: number;
  conversationContext?: {
    participantEmails: string[];
    conversationType: string;
    summary?: string;
  };
  highlightedContent?: string;
}

export interface Suggestion {
  text: string;
  type: 'recent' | 'popular' | 'trending' | 'participant' | 'completion';
  frequency?: number;
  category?: string;
}

export interface SearchAnalytics {
  query: string;
  normalizedQuery: string;
  frequency: number;
  lastUsed: Date;
  avgResultCount: number;
  successRate: number;
}

export interface SuggestionClick {
  query: string;
  suggestionText: string;
  suggestionType: string;
  userId: string;
  timestamp: Date;
}

export interface EnrichedSearchDocument {
  id: string;
  rawContent: string;
  semanticContent: string;
  entities: string[];
  topics: string[];
  intent: string;
  conversationId: string;
  participants: string[];
  createdAt: Date;
  messagePosition: number;
}

export class FirestoreSearchService {
  private suggestionsCache = new Map<string, { suggestions: Suggestion[], timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CACHE_MAX_SIZE = 1000;

  constructor() {
    // Firestore-based intelligent search service
    console.log('Initialized Firestore Search Service');
  }

  /**
   * Main semantic search function using Firestore with intelligent ranking
   */
  async semanticSearch(searchQuery: SearchQuery): Promise<SearchResult[]> {
    try {
      console.log('Performing semantic search for:', searchQuery.query);
      const results = await this.firestoreSearch(searchQuery);
      
      // Track successful search query
      await this.trackSearchQuery(searchQuery.query, searchQuery.userId, results.length);
      
      return results;
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  }

  /**
   * Get intelligent search suggestions based on multiple sources
   */
  async getSuggestions(query: string, userId: string, limit: number = 5): Promise<Suggestion[]> {
    try {
      console.log('Getting suggestions for query:', query, 'user:', userId);
      
      // Check cache first
      const cacheKey = `${userId}:${query.toLowerCase()}`;
      const cached = this.suggestionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('Returning cached suggestions');
        return cached.suggestions.slice(0, limit);
      }

      const suggestions: Suggestion[] = [];
      
      // 1. Auto-complete previous successful queries
      const completions = await this.getQueryCompletions(query, Math.ceil(limit * 0.3));
      suggestions.push(...completions);

      // 2. Popular keywords from user's conversations
      const userKeywords = await this.getUserPopularKeywords(userId, query, Math.ceil(limit * 0.3));
      suggestions.push(...userKeywords);

      // 3. Recent conversation participants
      const participants = await this.getParticipantSuggestions(userId, query, Math.ceil(limit * 0.2));
      suggestions.push(...participants);

      // 4. Trending keywords across all users (anonymized)
      const trending = await this.getTrendingKeywords(query, Math.ceil(limit * 0.2));
      suggestions.push(...trending);

      // Deduplicate and sort by relevance
      const uniqueSuggestions = this.deduplicateAndRankSuggestions(suggestions, query);
      let finalSuggestions = uniqueSuggestions.slice(0, limit);

      // Fallback: if no suggestions found and query is long enough, try broader search
      if (finalSuggestions.length === 0 && query.length >= 3) {
        finalSuggestions = await this.getFallbackSuggestions(query, limit);
      }

      // Cache the results
      this.cacheSuggestions(cacheKey, finalSuggestions);

      return finalSuggestions;

    } catch (error) {
      console.error('Get suggestions error:', error);
      return [];
    }
  }

  /**
   * Track search query analytics
   */
  async trackSearchQuery(query: string, userId: string, resultCount: number): Promise<void> {
    try {
      const normalizedQuery = query.toLowerCase().trim();
      const queryId = this.hashQuery(`${normalizedQuery}_${userId}`); // Include userId for user-specific tracking
      
      const queryDoc = admin.firestore().collection('searchQueries').doc(queryId);
      const queryData = await queryDoc.get();
      
      if (queryData.exists) {
        // Update existing query analytics
        const data = queryData.data()!;
        await queryDoc.update({
          frequency: (data['frequency'] || 0) + 1,
          lastUsed: admin.firestore.Timestamp.now(),
          avgResultCount: Math.round(((data['avgResultCount'] || 0) * (data['frequency'] || 0) + resultCount) / ((data['frequency'] || 0) + 1)),
          successRate: resultCount > 0 ? Math.min(1, (data['successRate'] || 0) * 0.9 + 0.1) : (data['successRate'] || 0) * 0.9,
        });
      } else {
        // Create new query analytics
        await queryDoc.set({
          query: query,
          normalizedQuery,
          userId,
          frequency: 1,
          lastUsed: admin.firestore.Timestamp.now(),
          avgResultCount: resultCount,
          successRate: resultCount > 0 ? 1.0 : 0.0,
          createdAt: admin.firestore.Timestamp.now(),
        });
      }

      console.log('Tracked search query:', normalizedQuery, 'results:', resultCount);
    } catch (error) {
      console.error('Failed to track search query:', error);
    }
  }

  /**
   * Track suggestion click analytics
   */
  async trackSuggestionClick(query: string, suggestionText: string, suggestionType: string, userId: string): Promise<void> {
    try {
      await admin.firestore().collection('suggestionClicks').add({
        query: query.toLowerCase().trim(),
        suggestionText,
        suggestionType,
        userId,
        timestamp: admin.firestore.Timestamp.now(),
      });

      console.log('Tracked suggestion click:', suggestionText, 'type:', suggestionType);
    } catch (error) {
      console.error('Failed to track suggestion click:', error);
    }
  }

  /**
   * Bulk index all existing messages for search
   */
  async indexAllMessages(userEmail?: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    indexedMessages: number;
    errors: string[];
  }> {
    console.log('Starting bulk indexing of all messages...');
    
    const startTime = Date.now();
    let totalConversations = 0;
    let totalMessages = 0;
    let indexedMessages = 0;
    const errors: string[] = [];

    try {
      // Query conversations - filter by user if specified
      const conversationsRef = admin.firestore().collection('conversations');
      const conversationsQuery = userEmail 
        ? conversationsRef.where('participantEmails', 'array-contains', userEmail)
        : conversationsRef;

      const conversationsSnapshot = await conversationsQuery.get();
      totalConversations = conversationsSnapshot.size;
      
      console.log(`Found ${totalConversations} conversations to process`);

      // Process each conversation
      for (const conversationDoc of conversationsSnapshot.docs) {
        const conversationId = conversationDoc.id;
        
        try {
          // Get all messages in this conversation
          const messagesSnapshot = await admin.firestore()
            .collection(`conversations/${conversationId}/messages`)
            .orderBy('createdAt', 'asc')
            .get();

          totalMessages += messagesSnapshot.size;
          
          console.log(`Processing ${messagesSnapshot.size} messages in conversation ${conversationId}`);

          // Index each message
          for (const messageDoc of messagesSnapshot.docs) {
            try {
              const messageData = { id: messageDoc.id, ...messageDoc.data() };
              await this.indexMessage(messageData, conversationId);
              indexedMessages++;
              
              // Log progress every 100 messages
              if (indexedMessages % 100 === 0) {
                console.log(`Indexed ${indexedMessages}/${totalMessages} messages...`);
              }
              
            } catch (messageError) {
              const errorMsg = `Failed to index message ${messageDoc.id} in conversation ${conversationId}: ${messageError}`;
              console.error(errorMsg);
              errors.push(errorMsg);
            }
          }
          
        } catch (conversationError) {
          const errorMsg = `Failed to process conversation ${conversationId}: ${conversationError}`;
          console.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Bulk indexing completed in ${duration}ms`);
      console.log(`Results: ${indexedMessages}/${totalMessages} messages indexed across ${totalConversations} conversations`);
      
      return {
        totalConversations,
        totalMessages,
        indexedMessages,
        errors,
      };

    } catch (error) {
      console.error('Bulk indexing failed:', error);
      throw new Error(`Bulk indexing failed: ${error}`);
    }
  }

  /**
   * Index a new message for search
   */
  async indexMessage(messageData: any, conversationId: string): Promise<void> {
    try {
      console.log('Indexing message for search:', messageData.id);
      
      // Get conversation context
      const conversationDoc = await admin.firestore()
        .doc(`conversations/${conversationId}`)
        .get();
      
      if (!conversationDoc.exists) {
        console.error('Conversation not found for indexing:', conversationId);
        return;
      }
      
      const conversationData = conversationDoc.data()!;
      
      // Store search document for indexing
      await this.storeSearchDocument(messageData, conversationId, conversationData);
      
    } catch (error) {
      console.error('Message indexing error:', error);
      // Still attempt to store search document
      try {
        await this.storeSearchDocument(messageData, conversationId);
      } catch (fallbackError) {
        console.error('Search document storage failed:', fallbackError);
      }
    }
  }

  /**
   * Firestore-based intelligent search with semantic ranking
   */
  private async firestoreSearch(searchQuery: SearchQuery): Promise<SearchResult[]> {
    console.log('Using Firestore intelligent search');
    
    const searchTerms = searchQuery.query.toLowerCase()
      .split(/\W+/)
      .filter(term => term.length > 2)
      .slice(0, 10); // Limit to 10 terms for performance
    
    if (searchTerms.length === 0) {
      return [];
    }
    
    try {
      // Search in search index collection
      const searchResults: SearchResult[] = [];
      
      // First, try to get user's conversations for context
      const userConversationsSnapshot = await admin.firestore()
        .collection('conversations')
        .where('participantEmails', 'array-contains', searchQuery.userId)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();

      const conversationIds = userConversationsSnapshot.docs.map(doc => doc.id);
      
      if (conversationIds.length === 0) {
        return [];
      }

      // Search through recent messages in user's conversations
      for (const conversationId of conversationIds.slice(0, 20)) { // Limit to recent conversations
        try {
          const messagesSnapshot = await admin.firestore()
            .collection(`conversations/${conversationId}/messages`)
            .orderBy('createdAt', 'desc')
            .limit(50) // Limit messages per conversation
            .get();

          for (const messageDoc of messagesSnapshot.docs) {
            const messageData = messageDoc.data();
            const content = (messageData['content'] as string)?.toLowerCase() || '';
            
            // Simple keyword matching
            const matchCount = searchTerms.filter(term => content.includes(term)).length;
            
            if (matchCount > 0) {
              const relevanceScore = matchCount / searchTerms.length;
              
              searchResults.push({
                messageId: messageDoc.id,
                conversationId,
                content: (messageData['content'] as string) || '',
                senderId: (messageData['senderId'] as string) || 'unknown',
                senderDisplayName: (messageData['senderDisplayName'] as string) || 'Unknown',
                createdAt: messageData['createdAt']?.toDate() || new Date(),
                relevanceScore,
                highlightedContent: this.highlightSearchTerms((messageData['content'] as string) || '', searchTerms),
              });
            }
          }
        } catch (error) {
          console.error(`Error searching conversation ${conversationId}:`, error);
          continue;
        }
      }

      // Sort by relevance and recency
      searchResults.sort((a, b) => {
        const scoreA = a.relevanceScore + (a.createdAt.getTime() / 1000000000000); // Add time factor
        const scoreB = b.relevanceScore + (b.createdAt.getTime() / 1000000000000);
        return scoreB - scoreA;
      });

      return searchResults.slice(0, searchQuery.limit || 20);
      
    } catch (error) {
      console.error('Firestore search error:', error);
      return [];
    }
  }

  /**
   * Highlight search terms in content
   */
  private highlightSearchTerms(content: string, searchTerms: string[]): string {
    let highlighted = content;
    for (const term of searchTerms) {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      highlighted = highlighted.replace(regex, '**$1**');
    }
    return highlighted;
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get query auto-completions from successful searches
   */
  private async getQueryCompletions(partialQuery: string, limit: number): Promise<Suggestion[]> {
    try {
      if (partialQuery.length < 2) return [];

      const completions: Suggestion[] = [];
      
      // Get queries that start with the partial query (prefix search)
      const querySnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('normalizedQuery', '>=', partialQuery.toLowerCase())
        .where('normalizedQuery', '<=', partialQuery.toLowerCase() + '\uf8ff')
        .orderBy('normalizedQuery')
        .orderBy('frequency', 'desc')
        .limit(limit * 3) // Get more to filter
        .get();

      // Get queries that contain the partial query (substring search)
      const containsSnapshot = await admin.firestore()
        .collection('searchQueries')
        .orderBy('frequency', 'desc')
        .limit(100) // Check recent popular queries
        .get();

      const candidateQueries: { query: string, frequency: number, successRate: number, isRecent: boolean }[] = [];

      // Process prefix matches
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const query = data['query'];
        const successRate = data['successRate'] || 0;
        const frequency = data['frequency'] || 1;
        
        if (query && query.length > partialQuery.length) { // Allow longer queries, remove exact match exclusion
          candidateQueries.push({
            query,
            frequency,
            successRate,
            isRecent: false,
          });
        }
      });

      // Process substring matches from popular queries
      containsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const query = data['query'];
        const normalizedQuery = data['normalizedQuery'] || '';
        const successRate = data['successRate'] || 0;
        const frequency = data['frequency'] || 1;
        
        if (query && 
            query.length > partialQuery.length && // Only require longer queries, not different
            normalizedQuery.includes(partialQuery.toLowerCase()) &&
            !candidateQueries.some(c => c.query === query)) {
          candidateQueries.push({
            query,
            frequency,
            successRate,
            isRecent: false,
          });
        }
      });

      // Also get very recent searches (last 24 hours) regardless of success rate
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const recentSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(oneDayAgo))
        .orderBy('lastUsed', 'desc')
        .limit(50)
        .get();

      recentSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const query = data['query'];
        const normalizedQuery = data['normalizedQuery'] || '';
        const frequency = data['frequency'] || 1;
        
        if (query && 
            query.length > partialQuery.length && // Only longer queries 
            (normalizedQuery.startsWith(partialQuery.toLowerCase()) || 
             normalizedQuery.includes(partialQuery.toLowerCase())) &&
            !candidateQueries.some(c => c.query === query)) {
          candidateQueries.push({
            query,
            frequency,
            successRate: 1, // Boost recent queries
            isRecent: true,
          });
        }
      });

      // Filter and rank suggestions
      candidateQueries
        .filter(candidate => {
          // Be more lenient with filters
          return candidate.successRate > 0.01 || candidate.isRecent || candidate.frequency > 1;
        })
        .sort((a, b) => {
          // Prioritize recent queries and high frequency
          const scoreA = (a.isRecent ? 100 : 0) + a.frequency * (a.successRate || 0.5);
          const scoreB = (b.isRecent ? 100 : 0) + b.frequency * (b.successRate || 0.5);
          return scoreB - scoreA;
        })
        .slice(0, limit)
        .forEach(candidate => {
          completions.push({
            text: candidate.query,
            type: candidate.isRecent ? 'recent' : 'completion',
            frequency: candidate.frequency,
          });
        });

      return completions;
    } catch (error) {
      console.error('Error getting query completions:', error);
      return [];
    }
  }

  /**
   * Get popular keywords from user's conversations
   */
  private async getUserPopularKeywords(userId: string, query: string, limit: number): Promise<Suggestion[]> {
    try {
      const suggestions: Suggestion[] = [];
      const keywordCounts = new Map<string, number>();

      // Get user's search index entries
      const searchSnapshot = await admin.firestore()
        .collection('searchIndex')
        .where('participants', 'array-contains', userId)
        .orderBy('createdAt', 'desc')
        .limit(100) // Recent messages for performance
        .get();

      // Count keyword frequency
      searchSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const keywords = data['keywords'] || [];
        keywords.forEach((keyword: string) => {
          if (keyword.length > 2 && keyword.toLowerCase().includes(query.toLowerCase())) {
            keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
          }
        });
      });

      // Convert to suggestions
      Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .forEach(([keyword, count]) => {
          suggestions.push({
            text: keyword,
            type: 'popular',
            frequency: count,
          });
        });

      return suggestions;
    } catch (error) {
      console.error('Error getting user popular keywords:', error);
      return [];
    }
  }

  /**
   * Get suggestions based on conversation participants
   */
  private async getParticipantSuggestions(userId: string, query: string, limit: number): Promise<Suggestion[]> {
    try {
      const suggestions: Suggestion[] = [];
      
      if (query.length < 2) return suggestions;

      // Get recent conversations with participants
      const conversationsSnapshot = await admin.firestore()
        .collection('conversations')
        .where('participantEmails', 'array-contains', userId)
        .orderBy('updatedAt', 'desc')
        .limit(20)
        .get();

      const participantCounts = new Map<string, number>();

      conversationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const participants = data['participantEmails'] || [];
        participants.forEach((email: string) => {
          if (email !== userId && email.toLowerCase().includes(query.toLowerCase())) {
            const displayName = email.split('@')[0] || email; // Simple display name with fallback
            participantCounts.set(displayName, (participantCounts.get(displayName) || 0) + 1);
          }
        });
      });

      // Convert to suggestions
      Array.from(participantCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .forEach(([name, count]) => {
          suggestions.push({
            text: `messages with ${name}`,
            type: 'participant',
            frequency: count,
          });
        });

      return suggestions;
    } catch (error) {
      console.error('Error getting participant suggestions:', error);
      return [];
    }
  }

  /**
   * Get trending keywords across all users (anonymized)
   */
  private async getTrendingKeywords(query: string, limit: number): Promise<Suggestion[]> {
    try {
      const suggestions: Suggestion[] = [];
      
      if (query.length < 2) return suggestions;

      // Simplified trending query to avoid complex index requirements
      // First, get recent queries by lastUsed only (expanded to 30 days for better suggestions)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const trendingSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
        .orderBy('lastUsed', 'desc')
        .limit(100) // Get more to filter in memory
        .get();

      // Filter and sort in memory to avoid complex Firestore queries
      const candidateQueries: { query: string, frequency: number, normalizedQuery: string }[] = [];
      
      trendingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const frequency = data['frequency'] || 0;
        const queryText = data['normalizedQuery'];
        const originalQuery = data['query'];
        
        // Filter by frequency and query match in memory (more inclusive)
        if (frequency >= 1 && queryText && originalQuery && 
            queryText.includes(query.toLowerCase()) && 
            queryText.length > query.toLowerCase().length) { // Allow longer queries, not just different ones
          candidateQueries.push({
            query: originalQuery,
            frequency,
            normalizedQuery: queryText,
          });
        }
      });

      // Sort by frequency in memory and take top results
      candidateQueries
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, limit)
        .forEach(candidate => {
          suggestions.push({
            text: candidate.query,
            type: 'trending',
            frequency: candidate.frequency,
          });
        });

      return suggestions;
    } catch (error) {
      console.error('Error getting trending keywords:', error);
      return [];
    }
  }

  /**
   * Get fallback suggestions when no results found
   */
  private async getFallbackSuggestions(query: string, limit: number): Promise<Suggestion[]> {
    try {
      const fallbackSuggestions: Suggestion[] = [];
      
      // 1. Try broader search - get any queries that contain any word from the search query
      const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
      
      if (queryWords.length > 0) {
        const broadSnapshot = await admin.firestore()
          .collection('searchQueries')
          .orderBy('frequency', 'desc')
          .limit(50)
          .get();

        broadSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const originalQuery = data['query'];
          const normalizedQuery = data['normalizedQuery'] || '';
          const frequency = data['frequency'] || 1;
          
          // Check if any query words appear in this stored query
          const hasMatch = queryWords.some(word => 
            normalizedQuery.includes(word) && normalizedQuery.length > query.length
          );
          
          if (hasMatch && originalQuery) {
            fallbackSuggestions.push({
              text: originalQuery,
              type: 'trending',
              frequency,
            });
          }
        });
      }

      // 2. If still no suggestions, add predefined contextual suggestions
      if (fallbackSuggestions.length === 0) {
        const predefinedSuggestions = this.getPredefinedSuggestions(query);
        fallbackSuggestions.push(...predefinedSuggestions);
      }

      return fallbackSuggestions
        .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error getting fallback suggestions:', error);
      // Return predefined suggestions as last resort
      return this.getPredefinedSuggestions(query).slice(0, limit);
    }
  }

  /**
   * Get predefined contextual suggestions based on query
   */
  private getPredefinedSuggestions(query: string): Suggestion[] {
    const queryLower = query.toLowerCase();
    const suggestions: Suggestion[] = [];

    // Search-related suggestions
    if (queryLower.includes('search')) {
      suggestions.push(
        { text: 'search suggestions', type: 'completion', frequency: 10 },
        { text: 'search results', type: 'completion', frequency: 9 },
        { text: 'search backend', type: 'completion', frequency: 8 },
        { text: 'search feature', type: 'completion', frequency: 7 },
        { text: 'search functionality', type: 'completion', frequency: 6 }
      );
    }
    
    // Fire-related suggestions (for firestore, etc.)
    else if (queryLower.includes('fire')) {
      suggestions.push(
        { text: 'firestore', type: 'completion', frequency: 10 },
        { text: 'firebase', type: 'completion', frequency: 9 },
        { text: 'firestore index', type: 'completion', frequency: 8 }
      );
    }
    
    // Backend-related suggestions
    else if (queryLower.includes('back')) {
      suggestions.push(
        { text: 'backend api', type: 'completion', frequency: 10 },
        { text: 'backend error', type: 'completion', frequency: 9 },
        { text: 'backend deployment', type: 'completion', frequency: 8 }
      );
    }
    
    // General conversation topics
    else if (queryLower.length >= 3) {
      suggestions.push(
        { text: `${query} suggestions`, type: 'completion', frequency: 5 },
        { text: `${query} help`, type: 'completion', frequency: 4 },
        { text: `${query} issue`, type: 'completion', frequency: 3 }
      );
    }

    return suggestions;
  }

  /**
   * Deduplicate suggestions and rank by relevance
   */
  private deduplicateAndRankSuggestions(suggestions: Suggestion[], query: string): Suggestion[] {
    const seen = new Set<string>();
    const unique: Suggestion[] = [];
    const queryLower = query.toLowerCase();

    suggestions.forEach(suggestion => {
      const key = `${suggestion.text.toLowerCase()}:${suggestion.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        // Calculate relevance score
        let score = suggestion.frequency || 1;
        
        // Boost exact matches
        if (suggestion.text.toLowerCase().startsWith(queryLower)) {
          score *= 2;
        }
        
        // Boost by type priority
        const typeBoost = {
          'completion': 1.5,
          'popular': 1.2,
          'recent': 1.1,
          'participant': 1.0,
          'trending': 0.8,
        };
        score *= typeBoost[suggestion.type] || 1.0;

        unique.push({
          ...suggestion,
          frequency: score,
        });
      }
    });

    // Sort by calculated score
    return unique.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
  }

  /**
   * Cache suggestions for performance
   */
  private cacheSuggestions(cacheKey: string, suggestions: Suggestion[]): void {
    try {
      // Implement simple LRU by clearing oldest entries when cache is full
      if (this.suggestionsCache.size >= this.CACHE_MAX_SIZE) {
        const oldestKey = Array.from(this.suggestionsCache.keys())[0];
        if (oldestKey) {
          this.suggestionsCache.delete(oldestKey);
        }
      }

      this.suggestionsCache.set(cacheKey, {
        suggestions,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error caching suggestions:', error);
    }
  }

  /**
   * Hash query for consistent document IDs
   */
  private hashQuery(query: string): string {
    // Simple hash function for query normalization
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `query_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Store search document for indexing
   */
  private async storeSearchDocument(
    messageData: any, 
    conversationId: string, 
    conversationData?: any
  ): Promise<void> {
    try {
      const keywords = ((messageData['content'] as string) || '')
        .toLowerCase()
        .split(/\W+/)
        .filter((word: string) => word.length > 2);
      
      const searchDoc = {
        id: messageData['id'],
        conversationId,
        content: (messageData['content'] as string) || '',
        senderId: (messageData['senderId'] as string) || '',
        senderDisplayName: (messageData['senderDisplayName'] as string) || '',
        createdAt: messageData['createdAt'] || admin.firestore.Timestamp.now(),
        keywords,
        participants: conversationData?.['participantEmails'] || [],
        lastUpdated: admin.firestore.Timestamp.now(),
      };

      await admin.firestore()
        .collection('searchIndex')
        .doc(`${conversationId}_${messageData['id']}`)
        .set(searchDoc);
        
      console.log('Successfully indexed message:', messageData['id']);
      
    } catch (error) {
      console.error('Failed to store search document:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const searchService = new FirestoreSearchService(); 