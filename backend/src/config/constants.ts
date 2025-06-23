/**
 * Application Constants
 * Central location for all application-wide constants
 */

// Authorization Configuration
export const AUTHORIZATION = {
  /**
   * Admin email address with elevated privileges
   * Can be overridden via ADMIN_EMAIL environment variable
   */
  ADMIN_EMAIL: process.env['ADMIN_EMAIL'] || 'admin@chatflow.app',
} as const;

// Message Configuration
export const MESSAGE_LIMITS = {
  /**
   * Maximum length for message content in characters
   * Set to 2M characters to support modern applications with rich content
   */
  MAX_CONTENT_LENGTH: 2_000_000,
  
  /**
   * Minimum length for message content in characters
   */
  MIN_CONTENT_LENGTH: 1,
} as const;

// Search Configuration  
export const SEARCH_LIMITS = {
  /**
   * Maximum number of search results to return
   */
  MAX_RESULTS: 100,
  
  /**
   * Default number of search results if not specified
   */
  DEFAULT_RESULTS: 20,
} as const;

// Rate Limiting Configuration
export const RATE_LIMITS = {
  /**
   * Window duration in milliseconds (15 minutes)
   */
  WINDOW_MS: 15 * 60 * 1000,
  
  /**
   * Maximum requests per window for different user tiers
   */
  TIERS: {
    GUEST: 100,
    AUTHORIZED: 1000,
    PREMIUM: 10000,
    ADMIN: 100000,
  }
} as const;

// WebSocket Configuration
export const WEBSOCKET_LIMITS = {
  /**
   * Maximum age for encrypted message timestamps (5 minutes)
   */
  MAX_ENCRYPTED_MESSAGE_AGE: 5 * 60 * 1000,
  
  /**
   * Maximum inactive connection time before cleanup (30 minutes)
   */
  MAX_INACTIVE_CONNECTION_TIME: 30 * 60 * 1000,
} as const;

// Export all constants as a single object for convenience
export const CONSTANTS = {
  AUTHORIZATION,
  MESSAGE_LIMITS,
  SEARCH_LIMITS,
  RATE_LIMITS,
  WEBSOCKET_LIMITS,
} as const; 