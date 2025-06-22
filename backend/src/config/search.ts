export interface SearchServiceConfig {
  // Cache settings
  cacheTtl: number;
  cacheMaxSize: number;
  
  // Time windows (in days)
  recentQueriesWindow: number;
  trendingTopicsWindow: number;
  trendingKeywordsWindow: number;
  queryCompletionsRecentWindow: number;
  
  // Query limits
  searchIndexMessagesLimit: number;
  conversationsLimit: number;
  recentConversationsLimit: number;
  popularQueriesLimit: number;
  recentQueriesLimit: number;
  searchTermsLimit: number;
  
  // Suggestion allocation percentages
  suggestionsCompletionsPercent: number;
  suggestionsUserKeywordsPercent: number;
  suggestionsParticipantsPercent: number;
  suggestionsTrendingPercent: number;
  
  // Default suggestions allocation percentages
  defaultRecentQueriesPercent: number;
  defaultPopularTopicsPercent: number;
  defaultRecentParticipantsPercent: number;
  defaultTrendingTopicsPercent: number;
  
  // Frequency thresholds
  popularTopicsMinCount: number;
  trendingTopicsMinFrequency: number;
  trendingKeywordsMinFrequency: number;
  
  // Query/keyword length thresholds
  minQueryLength: number;
  minKeywordLength: number;
  minLongKeywordLength: number;
  
  // Success rate thresholds
  minSuccessRate: number;
  
  // Search result limits
  defaultSearchLimit: number;
  maxSearchResults: number;
  messagesPerConversation: number;
  
  // Type boost multipliers
  completionTypeBoost: number;
  popularTypeBoost: number;
  recentTypeBoost: number;
  participantTypeBoost: number;
  topicTypeBoost: number;
  personTypeBoost: number;
  trendingTypeBoost: number;
  
  // Scoring multipliers
  prefixMatchBoost: number;
  recentQueryBoost: number;
}

const getSearchServiceConfig = (): SearchServiceConfig => {
  return {
    // Cache settings (default: 5 minutes TTL, 1000 max size)
    cacheTtl: parseInt(process.env['SEARCH_CACHE_TTL'] || '300000'), // 5 minutes in ms
    cacheMaxSize: parseInt(process.env['SEARCH_CACHE_MAX_SIZE'] || '1000'),
    
    // Time windows in days
    recentQueriesWindow: parseInt(process.env['SEARCH_RECENT_QUERIES_WINDOW'] || '7'),
    trendingTopicsWindow: parseInt(process.env['SEARCH_TRENDING_TOPICS_WINDOW'] || '7'),
    trendingKeywordsWindow: parseInt(process.env['SEARCH_TRENDING_KEYWORDS_WINDOW'] || '30'),
    queryCompletionsRecentWindow: parseInt(process.env['SEARCH_COMPLETIONS_RECENT_WINDOW'] || '1'),
    
    // Query limits
    searchIndexMessagesLimit: parseInt(process.env['SEARCH_INDEX_MESSAGES_LIMIT'] || '100'),
    conversationsLimit: parseInt(process.env['SEARCH_CONVERSATIONS_LIMIT'] || '50'),
    recentConversationsLimit: parseInt(process.env['SEARCH_RECENT_CONVERSATIONS_LIMIT'] || '20'),
    popularQueriesLimit: parseInt(process.env['SEARCH_POPULAR_QUERIES_LIMIT'] || '100'),
    recentQueriesLimit: parseInt(process.env['SEARCH_RECENT_QUERIES_LIMIT'] || '50'),
    searchTermsLimit: parseInt(process.env['SEARCH_TERMS_LIMIT'] || '10'),
    
    // Suggestion allocation percentages (should sum to 1.0)
    suggestionsCompletionsPercent: parseFloat(process.env['SEARCH_SUGGESTIONS_COMPLETIONS_PERCENT'] || '0.3'),
    suggestionsUserKeywordsPercent: parseFloat(process.env['SEARCH_SUGGESTIONS_USER_KEYWORDS_PERCENT'] || '0.3'),
    suggestionsParticipantsPercent: parseFloat(process.env['SEARCH_SUGGESTIONS_PARTICIPANTS_PERCENT'] || '0.2'),
    suggestionsTrendingPercent: parseFloat(process.env['SEARCH_SUGGESTIONS_TRENDING_PERCENT'] || '0.2'),
    
    // Default suggestions allocation percentages (should sum to 1.0)
    defaultRecentQueriesPercent: parseFloat(process.env['SEARCH_DEFAULT_RECENT_QUERIES_PERCENT'] || '0.25'),
    defaultPopularTopicsPercent: parseFloat(process.env['SEARCH_DEFAULT_POPULAR_TOPICS_PERCENT'] || '0.35'),
    defaultRecentParticipantsPercent: parseFloat(process.env['SEARCH_DEFAULT_RECENT_PARTICIPANTS_PERCENT'] || '0.25'),
    defaultTrendingTopicsPercent: parseFloat(process.env['SEARCH_DEFAULT_TRENDING_TOPICS_PERCENT'] || '0.15'),
    
    // Frequency thresholds
    popularTopicsMinCount: parseInt(process.env['SEARCH_POPULAR_TOPICS_MIN_COUNT'] || '2'),
    trendingTopicsMinFrequency: parseInt(process.env['SEARCH_TRENDING_TOPICS_MIN_FREQUENCY'] || '2'),
    trendingKeywordsMinFrequency: parseInt(process.env['SEARCH_TRENDING_KEYWORDS_MIN_FREQUENCY'] || '1'),
    
    // Query/keyword length thresholds
    minQueryLength: parseInt(process.env['SEARCH_MIN_QUERY_LENGTH'] || '2'),
    minKeywordLength: parseInt(process.env['SEARCH_MIN_KEYWORD_LENGTH'] || '2'),
    minLongKeywordLength: parseInt(process.env['SEARCH_MIN_LONG_KEYWORD_LENGTH'] || '3'),
    
    // Success rate thresholds
    minSuccessRate: parseFloat(process.env['SEARCH_MIN_SUCCESS_RATE'] || '0.01'),
    
    // Search result limits
    defaultSearchLimit: parseInt(process.env['SEARCH_DEFAULT_LIMIT'] || '20'),
    maxSearchResults: parseInt(process.env['SEARCH_MAX_RESULTS'] || '50'),
    messagesPerConversation: parseInt(process.env['SEARCH_MESSAGES_PER_CONVERSATION'] || '50'),
    
    // Type boost multipliers for suggestion ranking
    completionTypeBoost: parseFloat(process.env['SEARCH_COMPLETION_TYPE_BOOST'] || '1.5'),
    popularTypeBoost: parseFloat(process.env['SEARCH_POPULAR_TYPE_BOOST'] || '1.2'),
    recentTypeBoost: parseFloat(process.env['SEARCH_RECENT_TYPE_BOOST'] || '1.1'),
    participantTypeBoost: parseFloat(process.env['SEARCH_PARTICIPANT_TYPE_BOOST'] || '1.0'),
    topicTypeBoost: parseFloat(process.env['SEARCH_TOPIC_TYPE_BOOST'] || '1.0'),
    personTypeBoost: parseFloat(process.env['SEARCH_PERSON_TYPE_BOOST'] || '1.0'),
    trendingTypeBoost: parseFloat(process.env['SEARCH_TRENDING_TYPE_BOOST'] || '0.8'),
    
    // Scoring multipliers
    prefixMatchBoost: parseFloat(process.env['SEARCH_PREFIX_MATCH_BOOST'] || '2.0'),
    recentQueryBoost: parseFloat(process.env['SEARCH_RECENT_QUERY_BOOST'] || '100'),
  };
};

// Export singleton config instance
export const searchConfig = getSearchServiceConfig();

// Export a function to reload config (useful for testing)
export const reloadSearchConfig = (): SearchServiceConfig => {
  return getSearchServiceConfig();
}; 