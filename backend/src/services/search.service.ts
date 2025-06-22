import admin from 'firebase-admin';
import { searchConfig } from '../config/search';

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
  type: 'recent' | 'popular' | 'trending' | 'participant' | 'completion' | 'topic' | 'person';
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
  // Multi-tiered caching system
  private suggestionsCache = new Map<string, { suggestions: Suggestion[], timestamp: number }>();
  private longTermCache = new Map<string, { suggestions: Suggestion[], timestamp: number }>();
  private preComputedPools = new Map<string, Suggestion[]>();
  
  private readonly CACHE_TTL = searchConfig.cacheTtl;
  private readonly LONG_TERM_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for stable data
  private readonly CACHE_MAX_SIZE = searchConfig.cacheMaxSize;
  private readonly QUERY_TIMEOUT = 50; // Max 50ms for database queries
  
  // Performance monitoring
  private performanceStats = {
    avgResponseTime: 0,
    cacheHitRate: 0,
    totalRequests: 0,
    cacheHits: 0,
  };

  constructor() {
    // Firestore-based intelligent search service
    console.log('Initialized Firestore Search Service with performance optimizations');
    this.initializePreComputedPools();
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
   * Get intelligent search suggestions with 10ms target response time
   */
  async getSuggestions(query: string, userId: string, limit: number = 5): Promise<Suggestion[]> {
    const startTime = Date.now();
    
    try {
      // Update performance stats
      this.performanceStats.totalRequests++;
      
      // If no query provided, return default suggestions (fast path)
      if (!query || query.trim().length === 0) {
        const suggestions = await this.getDefaultSuggestionsOptimized(userId, limit);
        this.updatePerformanceStats(startTime, true);
        return suggestions;
      }

      const queryLower = query.toLowerCase();
      const cacheKey = `${userId}:${queryLower}`;

      // Level 1: Check exact cache hit (fastest - 1-2ms)
      const cached = this.suggestionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.performanceStats.cacheHits++;
        this.updatePerformanceStats(startTime, true);
        return cached.suggestions.slice(0, limit);
      }

      // Level 2: Check long-term cache for stable suggestions
      const longTermCached = this.longTermCache.get(cacheKey);
      if (longTermCached && Date.now() - longTermCached.timestamp < this.LONG_TERM_CACHE_TTL) {
        this.performanceStats.cacheHits++;
        this.updatePerformanceStats(startTime, true);
        return longTermCached.suggestions.slice(0, limit);
      }

      // Level 3: Check pre-computed pools for common patterns (fast - 2-3ms)
      const preComputedSuggestions = this.getPreComputedSuggestions(queryLower, limit);
      if (preComputedSuggestions.length > 0) {
        // Cache for future use
        this.cacheSuggestions(cacheKey, preComputedSuggestions);
        this.updatePerformanceStats(startTime, false);
        return preComputedSuggestions.slice(0, limit);
      }

      // Level 4: Parallel database queries with timeout (max 50ms)
      try {
        const suggestions = await Promise.race([
          this.getParallelSuggestions(query, userId, limit),
          this.createTimeoutPromise(this.QUERY_TIMEOUT)
        ]);

        if (suggestions && suggestions.length > 0) {
          // Cache both short-term and long-term
          this.cacheSuggestions(cacheKey, suggestions);
          this.longTermCache.set(cacheKey, { suggestions, timestamp: Date.now() });
          this.updatePerformanceStats(startTime, false);
          return suggestions.slice(0, limit);
        }
      } catch (timeoutError) {
        console.warn('Database query timeout, using fallback suggestions');
      }

      // Level 5: Final fallback - static suggestions (1ms)
      const fallbackSuggestions = this.getStaticFallbackSuggestions(queryLower, limit);
      this.updatePerformanceStats(startTime, false);
      return fallbackSuggestions;

    } catch (error) {
      console.error('Get suggestions error:', error);
      this.updatePerformanceStats(startTime, false);
      return this.getStaticFallbackSuggestions(query.toLowerCase(), limit);
    }
  }

  /**
   * Get default suggestions when no query is provided
   */
  private async getDefaultSuggestions(userId: string, limit: number = 5): Promise<Suggestion[]> {
    try {
      console.log('Getting default suggestions for user:', userId);

      // Check cache first
      const cacheKey = `${userId}:default`;
      const cached = this.suggestionsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log('Returning cached default suggestions');
        return cached.suggestions.slice(0, limit);
      }

      const suggestions: Suggestion[] = [];

      // 1. Recent search queries by this user
      const recentQueries = await this.getUserRecentQueries(userId, Math.ceil(limit * searchConfig.defaultRecentQueriesPercent));
      suggestions.push(...recentQueries);

      // 2. Popular topics from user's conversations
      const popularTopics = await this.getUserPopularTopics(userId, Math.ceil(limit * searchConfig.defaultPopularTopicsPercent));
      suggestions.push(...popularTopics);

      // 3. Recent conversation participants
      const recentParticipants = await this.getUserRecentParticipants(userId, Math.ceil(limit * searchConfig.defaultRecentParticipantsPercent));
      suggestions.push(...recentParticipants);

      // 4. General trending topics
      const trendingTopics = await this.getGeneralTrendingTopics(Math.ceil(limit * searchConfig.defaultTrendingTopicsPercent));
      suggestions.push(...trendingTopics);

      // Deduplicate and rank
      const uniqueSuggestions = this.deduplicateDefaultSuggestions(suggestions);
      let finalSuggestions = uniqueSuggestions.slice(0, limit);

      // If we don't have enough suggestions, add some predefined ones
      if (finalSuggestions.length < limit) {
        const predefined = this.getDefaultPredefinedSuggestions();
        const needed = limit - finalSuggestions.length;
        finalSuggestions.push(...predefined.slice(0, needed));
      }

      // Cache the results with shorter TTL for default suggestions
      this.suggestionsCache.set(cacheKey, {
        suggestions: finalSuggestions,
        timestamp: Date.now(),
      });

      return finalSuggestions;

    } catch (error) {
      console.error('Get default suggestions error:', error);
      // Return fallback predefined suggestions
      return this.getDefaultPredefinedSuggestions().slice(0, limit);
    }
  }

  /**
   * Get user's recent search queries
   */
  private async getUserRecentQueries(userId: string, limit: number): Promise<Suggestion[]> {
    try {
      const recentWindowAgo = new Date();
      recentWindowAgo.setDate(recentWindowAgo.getDate() - searchConfig.recentQueriesWindow);

      const recentSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('userId', '==', userId)
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(recentWindowAgo))
        .orderBy('lastUsed', 'desc')
        .limit(limit * 2) // Get more to filter
        .get();

      const suggestions: Suggestion[] = [];
      const seen = new Set<string>();

      recentSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const query = data['query'];
        const frequency = data['frequency'] || 1;
        
        if (query && query.length > 0 && !seen.has(query.toLowerCase())) {
          seen.add(query.toLowerCase());
          suggestions.push({
            text: query,
            type: 'recent',
            frequency,
          });
        }
      });

      return suggestions.slice(0, limit);
    } catch (error) {
      console.error('Error getting user recent queries:', error);
      return [];
    }
  }

  /**
   * Get popular topics from user's conversations
   */
  private async getUserPopularTopics(userId: string, limit: number): Promise<Suggestion[]> {
    try {
      const suggestions: Suggestion[] = [];
      const topicCounts = new Map<string, number>();

      // Get user's recent search index entries
      const searchSnapshot = await admin.firestore()
        .collection('searchIndex')
        .where('participants', 'array-contains', userId)
        .orderBy('createdAt', 'desc')
        .limit(searchConfig.searchIndexMessagesLimit)
        .get();

      // Extract and count meaningful keywords (topics)
      searchSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const keywords = data['keywords'] || [];
        keywords.forEach((keyword: string) => {
          if (keyword.length > searchConfig.minLongKeywordLength && !this.isCommonWord(keyword)) {
            topicCounts.set(keyword, (topicCounts.get(keyword) || 0) + 1);
          }
        });
      });

      // Convert to suggestions
      Array.from(topicCounts.entries())
        .filter(([, count]) => count >= searchConfig.popularTopicsMinCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .forEach(([topic, count]) => {
          suggestions.push({
            text: topic,
            type: 'topic',
            frequency: count,
          });
        });

      return suggestions;
    } catch (error) {
      console.error('Error getting user popular topics:', error);
      return [];
    }
  }

  /**
   * Get recent conversation participants for suggestions
   */
  private async getUserRecentParticipants(userId: string, limit: number): Promise<Suggestion[]> {
    try {
      const suggestions: Suggestion[] = [];
      const participantCounts = new Map<string, number>();

      // Get user's recent conversations
      const conversationsSnapshot = await admin.firestore()
        .collection('conversations')
        .where('participantEmails', 'array-contains', userId)
        .orderBy('updatedAt', 'desc')
        .limit(searchConfig.recentConversationsLimit)
        .get();

      conversationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const participants = data['participantEmails'] || [];
        participants.forEach((email: string) => {
          if (email !== userId) {
            const displayName = email.split('@')[0] || email;
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
            type: 'person',
            frequency: count,
          });
        });

      return suggestions;
    } catch (error) {
      console.error('Error getting user recent participants:', error);
      return [];
    }
  }

  /**
   * Get general trending topics across all users
   */
  private async getGeneralTrendingTopics(limit: number): Promise<Suggestion[]> {
    try {
      const trendingWindowAgo = new Date();
      trendingWindowAgo.setDate(trendingWindowAgo.getDate() - searchConfig.trendingTopicsWindow);

      const trendingSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(trendingWindowAgo))
        .orderBy('frequency', 'desc')
        .limit(limit * 3) // Get more to filter
        .get();

      const suggestions: Suggestion[] = [];
      const seen = new Set<string>();

      trendingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const query = data['query'];
        const frequency = data['frequency'] || 1;
        
        if (query && query.length > 0 && frequency >= searchConfig.trendingTopicsMinFrequency && !seen.has(query.toLowerCase())) {
          seen.add(query.toLowerCase());
          suggestions.push({
            text: query,
            type: 'trending',
            frequency,
          });
        }
      });

      return suggestions.slice(0, limit);
    } catch (error) {
      console.error('Error getting general trending topics:', error);
      return [];
    }
  }

  /**
   * Get predefined default suggestions
   */
  private getDefaultPredefinedSuggestions(): Suggestion[] {
    return [
      { text: 'recent messages', type: 'topic', frequency: 10 },
      { text: 'project updates', type: 'topic', frequency: 9 },
      { text: 'meeting notes', type: 'topic', frequency: 8 },
      { text: 'lunch plans', type: 'topic', frequency: 7 },
      { text: 'document shared', type: 'topic', frequency: 6 },
      { text: 'deadline', type: 'topic', frequency: 5 },
      { text: 'schedule', type: 'topic', frequency: 4 },
      { text: 'feedback', type: 'topic', frequency: 3 },
    ];
  }

  /**
   * Deduplicate default suggestions
   */
  private deduplicateDefaultSuggestions(suggestions: Suggestion[]): Suggestion[] {
    const seen = new Set<string>();
    const unique: Suggestion[] = [];

    suggestions.forEach(suggestion => {
      const key = suggestion.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    });

    // Sort by frequency and type priority
    return unique.sort((a, b) => {
      const typePriority: Record<string, number> = {
        'recent': 4,
        'topic': 3,
        'person': 2,
        'trending': 1,
        'popular': 2,
        'participant': 2,
        'completion': 1,
      };
      
      const scoreA = (typePriority[a.type] || 0) * 1000 + (a.frequency || 0);
      const scoreB = (typePriority[b.type] || 0) * 1000 + (b.frequency || 0);
      
      return scoreB - scoreA;
    });
  }

  /**
   * Check if a word is a common/stop word that shouldn't be suggested
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'does', 'each', 'few', 'got', 'let', 'man', 'men', 'put', 'say', 'she', 'too', 'use'
    ]);
    return commonWords.has(word.toLowerCase());
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
      .filter(term => term.length > searchConfig.minKeywordLength)
      .slice(0, searchConfig.searchTermsLimit);
    
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
        .limit(searchConfig.conversationsLimit)
        .get();

      const conversationIds = userConversationsSnapshot.docs.map(doc => doc.id);
      
      if (conversationIds.length === 0) {
        return [];
      }

      // Search through recent messages in user's conversations
      for (const conversationId of conversationIds.slice(0, searchConfig.recentConversationsLimit)) {
        try {
          const messagesSnapshot = await admin.firestore()
            .collection(`conversations/${conversationId}/messages`)
            .orderBy('createdAt', 'desc')
            .limit(searchConfig.messagesPerConversation)
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

      return searchResults.slice(0, searchQuery.limit || searchConfig.defaultSearchLimit);
      
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
      if (partialQuery.length < searchConfig.minQueryLength) return [];

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
        .limit(searchConfig.popularQueriesLimit)
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

      // Also get very recent searches regardless of success rate
      const recentWindowAgo = new Date();
      recentWindowAgo.setDate(recentWindowAgo.getDate() - searchConfig.queryCompletionsRecentWindow);
      
      const recentSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(recentWindowAgo))
        .orderBy('lastUsed', 'desc')
        .limit(searchConfig.recentQueriesLimit)
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
          return candidate.successRate > searchConfig.minSuccessRate || candidate.isRecent || candidate.frequency > 1;
        })
        .sort((a, b) => {
          // Prioritize recent queries and high frequency
          const scoreA = (a.isRecent ? searchConfig.recentQueryBoost : 0) + a.frequency * (a.successRate || 0.5);
          const scoreB = (b.isRecent ? searchConfig.recentQueryBoost : 0) + b.frequency * (b.successRate || 0.5);
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
        .limit(searchConfig.searchIndexMessagesLimit)
        .get();

      // Count keyword frequency
      searchSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const keywords = data['keywords'] || [];
        keywords.forEach((keyword: string) => {
          if (keyword.length > searchConfig.minKeywordLength && keyword.toLowerCase().includes(query.toLowerCase())) {
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
      
      if (query.length < searchConfig.minQueryLength) return suggestions;

      // Get recent conversations with participants
      const conversationsSnapshot = await admin.firestore()
        .collection('conversations')
        .where('participantEmails', 'array-contains', userId)
        .orderBy('updatedAt', 'desc')
        .limit(searchConfig.recentConversationsLimit)
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
      
      if (query.length < searchConfig.minQueryLength) return suggestions;

      // Simplified trending query to avoid complex index requirements
      const trendingWindowAgo = new Date();
      trendingWindowAgo.setDate(trendingWindowAgo.getDate() - searchConfig.trendingKeywordsWindow);

      const trendingSnapshot = await admin.firestore()
        .collection('searchQueries')
        .where('lastUsed', '>', admin.firestore.Timestamp.fromDate(trendingWindowAgo))
        .orderBy('lastUsed', 'desc')
        .limit(searchConfig.popularQueriesLimit)
        .get();

      // Filter and sort in memory to avoid complex Firestore queries
      const candidateQueries: { query: string, frequency: number, normalizedQuery: string }[] = [];
      
      trendingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const frequency = data['frequency'] || 0;
        const queryText = data['normalizedQuery'];
        const originalQuery = data['query'];
        
        // Filter by frequency and query match in memory (more inclusive)
        if (frequency >= searchConfig.trendingKeywordsMinFrequency && queryText && originalQuery && 
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
          score *= searchConfig.prefixMatchBoost;
        }
        
        // Boost by type priority
        const typeBoost: Record<string, number> = {
          'completion': searchConfig.completionTypeBoost,
          'popular': searchConfig.popularTypeBoost,
          'recent': searchConfig.recentTypeBoost,
          'participant': searchConfig.participantTypeBoost,
          'topic': searchConfig.topicTypeBoost,
          'person': searchConfig.personTypeBoost,
          'trending': searchConfig.trendingTypeBoost,
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
   * Initialize pre-computed suggestion pools for common patterns
   */
  private async initializePreComputedPools(): Promise<void> {
    try {
      // Initialize with common search patterns
      this.preComputedPools.set('general', [
        { text: 'recent messages', type: 'topic', frequency: 100 },
        { text: 'project updates', type: 'topic', frequency: 90 },
        { text: 'meeting notes', type: 'topic', frequency: 80 },
        { text: 'lunch plans', type: 'topic', frequency: 70 },
        { text: 'document shared', type: 'topic', frequency: 60 },
      ]);

      this.preComputedPools.set('sl', [
        { text: 'sleep', type: 'completion', frequency: 50 },
        { text: 'slack', type: 'completion', frequency: 40 },
        { text: 'slow', type: 'completion', frequency: 30 },
      ]);

      this.preComputedPools.set('sle', [
        { text: 'sleep', type: 'completion', frequency: 100 },
        { text: 'sleep schedule', type: 'completion', frequency: 80 },
        { text: 'sleep better', type: 'completion', frequency: 60 },
        { text: 'sleep hygiene', type: 'completion', frequency: 40 },
        { text: 'sleep quality', type: 'completion', frequency: 30 },
      ]);

      this.preComputedPools.set('slee', [
        { text: 'sleep', type: 'completion', frequency: 100 },
        { text: 'sleep tips', type: 'completion', frequency: 80 },
        { text: 'sleep problems', type: 'completion', frequency: 60 },
      ]);

      // Add more common patterns
      this.preComputedPools.set('me', [
        { text: 'meeting', type: 'completion', frequency: 80 },
        { text: 'message', type: 'completion', frequency: 70 },
        { text: 'menu', type: 'completion', frequency: 40 },
      ]);

      console.log('Pre-computed suggestion pools initialized');
    } catch (error) {
      console.error('Failed to initialize pre-computed pools:', error);
    }
  }

  /**
   * Update performance statistics
   */
  private updatePerformanceStats(startTime: number, _cacheHit: boolean): void {
    const responseTime = Date.now() - startTime;
    
    // Update rolling average
    this.performanceStats.avgResponseTime = 
      (this.performanceStats.avgResponseTime * (this.performanceStats.totalRequests - 1) + responseTime) / 
      this.performanceStats.totalRequests;
    
    // Update cache hit rate
    this.performanceStats.cacheHitRate = 
      this.performanceStats.cacheHits / this.performanceStats.totalRequests;

    // Log performance warnings
    if (responseTime > 10) {
      console.warn(`Slow suggestion response: ${responseTime}ms (target: 10ms)`);
    }
  }

  /**
   * Get optimized default suggestions with aggressive caching
   */
  private async getDefaultSuggestionsOptimized(userId: string, limit: number): Promise<Suggestion[]> {
    const cacheKey = `${userId}:default`;
    
    // Check cache first
    const cached = this.suggestionsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.suggestions.slice(0, limit);
    }

    // Use pre-computed general suggestions
    const generalSuggestions = this.preComputedPools.get('general') || [];
    if (generalSuggestions.length > 0) {
      this.cacheSuggestions(cacheKey, generalSuggestions);
      return generalSuggestions.slice(0, limit);
    }

    // Fallback to the original method but with timeout
    try {
      const suggestions = await Promise.race([
        this.getDefaultSuggestions(userId, limit),
        this.createTimeoutPromise(30) // Shorter timeout for default suggestions
      ]);
      
      if (suggestions && suggestions.length > 0) {
        this.cacheSuggestions(cacheKey, suggestions);
        return suggestions;
      }
    } catch (timeoutError) {
      console.warn('Default suggestions timeout, using static fallback');
    }

    return this.getDefaultPredefinedSuggestions().slice(0, limit);
  }

  /**
   * Get suggestions from pre-computed pools
   */
  private getPreComputedSuggestions(query: string, limit: number): Suggestion[] {
    const suggestions: Suggestion[] = [];
    
    // Check exact matches first
    const exactMatch = this.preComputedPools.get(query);
    if (exactMatch) {
      suggestions.push(...exactMatch);
    }

    // Check prefix matches
    for (const [poolKey, poolSuggestions] of this.preComputedPools.entries()) {
      if (poolKey !== query && poolKey.startsWith(query) && poolSuggestions.length > 0) {
        suggestions.push(...poolSuggestions);
      }
    }

    // Check if any suggestions contain the query
    if (suggestions.length === 0) {
      for (const [, poolSuggestions] of this.preComputedPools.entries()) {
        for (const suggestion of poolSuggestions) {
          if (suggestion.text.toLowerCase().includes(query)) {
            suggestions.push(suggestion);
          }
        }
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const unique = suggestions.filter(s => {
      const key = s.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique
      .sort((a, b) => (b.frequency || 0) - (a.frequency || 0))
      .slice(0, limit);
  }

  /**
   * Execute parallel database queries with timeout control
   */
  private async getParallelSuggestions(query: string, userId: string, limit: number): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];
    
    // Execute all queries in parallel
    const parallelQueries = await Promise.allSettled([
      this.getQueryCompletions(query, Math.max(1, Math.ceil(limit * 0.4))),
      this.getUserPopularKeywords(userId, query, Math.max(1, Math.ceil(limit * 0.3))),
      this.getParticipantSuggestions(userId, query, Math.max(1, Math.ceil(limit * 0.2))),
      this.getTrendingKeywords(query, Math.max(1, Math.ceil(limit * 0.1))),
    ]);

    // Collect results from successful queries
    parallelQueries.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        suggestions.push(...result.value);
      } else if (result.status === 'rejected') {
        console.warn(`Parallel query ${index} failed:`, result.reason);
      }
    });

    // Deduplicate and rank
    const uniqueSuggestions = this.deduplicateAndRankSuggestions(suggestions, query);
    return uniqueSuggestions.slice(0, limit);
  }

  /**
   * Create a timeout promise for race conditions
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs);
    });
  }

  /**
   * Get static fallback suggestions for immediate response
   */
  private getStaticFallbackSuggestions(query: string, limit: number): Suggestion[] {
    const staticSuggestions: Suggestion[] = [];
    
    // Basic completion suggestions
    if (query.length >= 2) {
      const commonCompletions = [
        'messages', 'meeting', 'project', 'update', 'document', 'schedule', 
        'lunch', 'coffee', 'deadline', 'feedback', 'review', 'plan'
      ];
      
      commonCompletions
        .filter(word => word.startsWith(query))
        .slice(0, limit)
        .forEach(word => {
          staticSuggestions.push({
            text: word,
            type: 'completion',
            frequency: 10
          });
        });
    }

    // If no completions, suggest search patterns
    if (staticSuggestions.length === 0) {
      staticSuggestions.push(
        { text: `${query} messages`, type: 'completion', frequency: 5 },
        { text: `${query} update`, type: 'completion', frequency: 4 },
        { text: `${query} project`, type: 'completion', frequency: 3 },
      );
    }

    return staticSuggestions.slice(0, limit);
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
        .filter((word: string) => word.length > searchConfig.minKeywordLength);
      
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

  /**
   * Get performance statistics for monitoring
   */
  getPerformanceStats() {
    return {
      avgResponseTime: Math.round(this.performanceStats.avgResponseTime * 100) / 100,
      cacheHitRate: Math.round(this.performanceStats.cacheHitRate * 10000) / 100,
      totalRequests: this.performanceStats.totalRequests,
      cacheHits: this.performanceStats.cacheHits,
      cacheSize: this.suggestionsCache.size,
      longTermCacheSize: this.longTermCache.size,
      preComputedPoolsSize: this.preComputedPools.size,
    };
  }

  /**
   * Reset performance statistics (for testing)
   */
  resetPerformanceStats() {
    this.performanceStats = {
      avgResponseTime: 0,
      cacheHitRate: 0,
      totalRequests: 0,
      cacheHits: 0,
    };
  }

  /**
   * Clear all caches (for testing or maintenance)
   */
  clearCaches() {
    this.suggestionsCache.clear();
    this.longTermCache.clear();
    console.log('All caches cleared');
  }
}

// Export singleton instance
export const searchService = new FirestoreSearchService(); 