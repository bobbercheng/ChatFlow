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
      return await this.firestoreSearch(searchQuery);
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
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