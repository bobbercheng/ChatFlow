# 🔍 Search Service Configuration System

## Overview

The ChatFlow search service has been fully refactored to use **environment-based configuration** instead of hardcoded values. This enables fine-tuning of search behavior, suggestion algorithms, and performance characteristics without code changes.

## 🏗️ Architecture

### Configuration Flow
```
Environment Variables → Config Module → Search Service
```

1. **Environment Variables**: Set via Terraform or environment files
2. **Config Module** (`backend/src/config/search.ts`): Loads and validates settings
3. **Search Service** (`backend/src/services/search.service.ts`): Uses config throughout

## 📁 Files Modified

### Backend Configuration
- **`backend/src/config/search.ts`** - New configuration module
- **`backend/src/services/search.service.ts`** - Updated to use config values

### Terraform Infrastructure
- **`terraform/variables.tf`** - Added 28 search configuration variables
- **`terraform/main.tf`** - Added environment variables to Cloud Run
- **`terraform/search-config.tfvars.example`** - Configuration examples

## ⚙️ Configuration Categories

### 🗄️ Cache Settings
```typescript
SEARCH_CACHE_TTL=300000                # 5 minutes in milliseconds
SEARCH_CACHE_MAX_SIZE=1000             # Maximum cached suggestion sets
```

### ⏰ Time Windows (in days)
```typescript
SEARCH_RECENT_QUERIES_WINDOW=7         # Recent queries lookback
SEARCH_TRENDING_TOPICS_WINDOW=7        # Trending topics analysis
SEARCH_TRENDING_KEYWORDS_WINDOW=30     # Extended trending window
SEARCH_COMPLETIONS_RECENT_WINDOW=1     # Recent completions boost
```

### 🎯 Query Limits
```typescript
SEARCH_INDEX_MESSAGES_LIMIT=100        # Messages per search index query
SEARCH_CONVERSATIONS_LIMIT=50          # Total conversations to consider
SEARCH_RECENT_CONVERSATIONS_LIMIT=20   # Recent conversations to search
SEARCH_POPULAR_QUERIES_LIMIT=100       # Popular queries to analyze
SEARCH_RECENT_QUERIES_LIMIT=50         # Recent queries to fetch
SEARCH_TERMS_LIMIT=10                  # Max search terms per query
```

### 📊 Suggestion Allocation (must sum to 1.0)
```typescript
# Primary suggestions (when user types)
SEARCH_SUGGESTIONS_COMPLETIONS_PERCENT=0.3    # 30% query completions
SEARCH_SUGGESTIONS_USER_KEYWORDS_PERCENT=0.3  # 30% user's keywords
SEARCH_SUGGESTIONS_PARTICIPANTS_PERCENT=0.2   # 20% participants
SEARCH_SUGGESTIONS_TRENDING_PERCENT=0.2       # 20% trending

# Default suggestions (empty query)
SEARCH_DEFAULT_RECENT_QUERIES_PERCENT=0.25    # 25% recent queries
SEARCH_DEFAULT_POPULAR_TOPICS_PERCENT=0.35    # 35% popular topics
SEARCH_DEFAULT_RECENT_PARTICIPANTS_PERCENT=0.25 # 25% participants
SEARCH_DEFAULT_TRENDING_TOPICS_PERCENT=0.15   # 15% trending
```

### 🎚️ Quality Thresholds
```typescript
SEARCH_POPULAR_TOPICS_MIN_COUNT=2      # Min mentions for "popular"
SEARCH_TRENDING_TOPICS_MIN_FREQUENCY=2 # Min frequency for trending
SEARCH_TRENDING_KEYWORDS_MIN_FREQUENCY=1 # Min frequency for keywords
SEARCH_MIN_QUERY_LENGTH=2              # Min chars for processing
SEARCH_MIN_KEYWORD_LENGTH=2            # Min chars for indexing
SEARCH_MIN_LONG_KEYWORD_LENGTH=3       # Min chars for "long" keywords
SEARCH_MIN_SUCCESS_RATE=0.01           # Min success rate threshold
```

### 📏 Result Limits
```typescript
SEARCH_DEFAULT_LIMIT=20                # Default results when none specified
SEARCH_MAX_RESULTS=50                  # Maximum results ever returned
SEARCH_MESSAGES_PER_CONVERSATION=50    # Max messages per conversation
```

### 🚀 Suggestion Ranking Boosts
```typescript
# Type-based multipliers (higher = more likely)
SEARCH_COMPLETION_TYPE_BOOST=1.5       # Query completions
SEARCH_POPULAR_TYPE_BOOST=1.2          # User's popular terms
SEARCH_RECENT_TYPE_BOOST=1.1           # Recent searches
SEARCH_PARTICIPANT_TYPE_BOOST=1.0      # Participants
SEARCH_TOPIC_TYPE_BOOST=1.0            # Topics
SEARCH_PERSON_TYPE_BOOST=1.0           # People
SEARCH_TRENDING_TYPE_BOOST=0.8         # Trending (lower priority)

# Scoring multipliers
SEARCH_PREFIX_MATCH_BOOST=2.0          # Exact prefix matches
SEARCH_RECENT_QUERY_BOOST=100          # Very recent query bonus
```

## 🚀 Deployment

### Using Terraform

1. **Default Deployment** (uses sensible defaults):
   ```bash
   terraform apply
   ```

2. **Custom Configuration**:
   ```bash
   # Copy example configuration
   cp terraform/search-config.tfvars.example terraform/search-config.tfvars
   
   # Edit values as needed
   nano terraform/search-config.tfvars
   
   # Apply with custom config
   terraform apply -var-file="search-config.tfvars"
   ```

### Environment Variables

Set any of these environment variables to override defaults:

```bash
export SEARCH_CACHE_TTL=600000  # 10 minutes
export SEARCH_TRENDING_TYPE_BOOST=1.2  # Boost trending suggestions
terraform apply
```

## 🎨 Configuration Examples

### High-Performance Setup
```hcl
# More aggressive caching and larger limits
search_cache_ttl = 600000                    # 10 minutes
search_cache_max_size = 2000
search_recent_queries_limit = 100
search_index_messages_limit = 200
```

### Memory-Optimized Setup
```hcl
# Reduced caching and smaller limits
search_cache_ttl = 60000                     # 1 minute
search_cache_max_size = 500
search_index_messages_limit = 50
search_conversations_limit = 25
```

### Trending-Focused Setup
```hcl
# Emphasize trending content
search_suggestions_trending_percent = 0.4    # 40% trending
search_suggestions_completions_percent = 0.2 # 20% completions
search_trending_type_boost = 1.2
search_trending_keywords_window = 14         # 2 weeks
```

### Quality-Focused Setup
```hcl
# Higher quality thresholds
search_min_success_rate = 0.1
search_popular_topics_min_count = 3
search_trending_topics_min_frequency = 5
search_min_long_keyword_length = 4
```

## 🔧 Monitoring & Tuning

### Key Metrics to Monitor

1. **Cache Performance**:
   - Cache hit rate
   - Memory usage
   - Response times

2. **Suggestion Quality**:
   - Click-through rates by type
   - User satisfaction scores
   - Query completion rates

3. **System Performance**:
   - Database query times
   - Memory consumption
   - API response times

### Tuning Guidelines

#### For High Traffic
- Increase `search_cache_ttl` (5-10 minutes)
- Increase `search_cache_max_size` (1500-2000)
- Decrease query limits to reduce database load

#### For Better Suggestions
- Increase `search_trending_keywords_window` (45-60 days)
- Adjust type boost multipliers based on user behavior
- Increase quality thresholds for cleaner results

#### For Faster Response
- Decrease `search_index_messages_limit` (50-75)
- Reduce `search_conversations_limit` (25-35)
- Optimize cache settings for your usage patterns

## 🧪 Testing Configuration

The search service includes comprehensive tests that validate configuration behavior:

```bash
# Run all search service tests
cd backend
npm test

# Specific search service tests
npm test src/services/search.service.test.ts
```

All tests pass with the new configuration system (170/170 tests).

## 🔄 Configuration Validation

The system includes built-in validation:

- **Type Safety**: TypeScript ensures correct types
- **Default Values**: Sensible defaults for all parameters
- **Range Validation**: Logical constraints on values
- **Percentage Validation**: Suggestion percentages should sum to 1.0

## 📈 Performance Impact

### Before Configuration
- Fixed 5-minute cache TTL
- Hardcoded query limits
- Static suggestion allocation
- No tuning capability

### After Configuration
- ✅ Configurable cache behavior
- ✅ Adjustable performance limits
- ✅ Dynamic suggestion weighting
- ✅ Environment-specific optimization
- ✅ No code changes for tuning

## 🎯 Benefits

1. **Production Tuning**: Optimize for actual usage patterns
2. **A/B Testing**: Test different configurations easily
3. **Environment Isolation**: Different settings per environment
4. **Performance Scaling**: Adjust limits based on infrastructure
5. **User Experience**: Fine-tune suggestion quality
6. **Operational Excellence**: Monitor and optimize continuously

## 🚨 Important Notes

1. **Percentage Validation**: Suggestion percentages must sum to 1.0
2. **Cache Memory**: Monitor memory usage when increasing cache size
3. **Database Load**: Higher limits = more database queries
4. **Response Times**: Balance quality vs speed with appropriate limits
5. **Backward Compatibility**: All defaults maintain existing behavior

---

**Last Updated**: June 2025  
**Version**: 1.0.0  
**Status**: Production Ready ✅ 