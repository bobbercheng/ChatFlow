import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { rateLimitService } from '../services/rate-limit.service';

// Performance optimization: In-memory caches with TTL
interface CacheItem<T> {
  data: T;
  expiry: number;
}

class TTLCache<T> {
  private cache = new Map<string, CacheItem<T>>();
  private ttl: number;

  constructor(ttlMs: number) {
    this.ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }
    
    return item.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttl
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// Caches for performance optimization
const userRateLimitCache = new TTLCache<any>(5 * 60 * 1000); // 5 minutes
const punishmentCache = new TTLCache<boolean>(60 * 1000); // 1 minute
const configCache = new TTLCache<any>(10 * 60 * 1000); // 10 minutes

// Enhanced request interface to include rate limit data and caches
interface RateLimitRequest extends Request {
  rateLimitInfo?: {
    tier: string;
    limit: number;
    remaining: number;
    resetTime: Date;
    userEmail?: string | undefined;
  };
  _jwtCache?: { email: string; isValid: boolean } | null;
  _ipCache?: string;
}

// Get client IP address (proxy-aware) - cached per request
const getClientIP = (req: RateLimitRequest): string => {
  if (req._ipCache) return req._ipCache;
  
  const forwarded = req.get('x-forwarded-for');
  const realIP = req.get('x-real-ip');
  const connectionIP = req.connection?.remoteAddress;
  const socketIP = req.socket?.remoteAddress;

  // Priority: x-forwarded-for (first IP) > x-real-ip > connection addresses
  let ip: string;
  if (forwarded) {
    ip = forwarded.split(',')[0]?.trim() || 'unknown';
  } else if (realIP) {
    ip = realIP;
  } else {
    ip = connectionIP || socketIP || 'unknown';
  }
  
  req._ipCache = ip;
  return ip;
};

// Extract user email from JWT token - optimized with request-level caching
const extractUserFromToken = (req: RateLimitRequest): { email: string; isValid: boolean } | null => {
  // Check request-level cache first
  if (req._jwtCache !== undefined) {
    return req._jwtCache;
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      req._jwtCache = null;
      return null;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env['JWT_SECRET'] || 'fallback-secret-key';
    
    const decoded = jwt.verify(token, jwtSecret) as { email: string };
    req._jwtCache = { email: decoded.email, isValid: true };
    return req._jwtCache;
  } catch (error) {
    // Invalid token - return email if we can decode it (for punishment tracking)
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        req._jwtCache = null;
        return null;
      }
      const token = authHeader.substring(7);
      const decoded = jwt.decode(token) as { email: string } | null;
      const result = decoded?.email ? { email: decoded.email, isValid: false } : null;
      req._jwtCache = result;
      return result;
    } catch {
      req._jwtCache = null;
      return null;
    }
  }
};

// Get cached config or fetch if needed
const getCachedConfig = () => {
  const cached = configCache.get('main');
  if (cached) return cached;
  
  const config = rateLimitService.getConfig();
  configCache.set('main', config);
  return config;
};

// Custom key generator for rate limiting
const generateRateLimitKey = (req: RateLimitRequest, tier: string): string => {
  const ip = getClientIP(req);
  const userInfo = extractUserFromToken(req);
  
  if (userInfo?.isValid) {
    return `${tier}:user:${userInfo.email}`;
  }
  return `${tier}:ip:${ip}`;
};

// Optimized function to get user rate limit with caching
const getCachedUserRateLimit = async (email: string) => {
  const cached = userRateLimitCache.get(email);
  if (cached !== undefined) return cached;
  
  try {
    const userRateLimit = await rateLimitService.getUserRateLimit(email);
    userRateLimitCache.set(email, userRateLimit);
    return userRateLimit;
  } catch (error) {
    // Cache null result briefly to prevent repeated failed queries
    userRateLimitCache.set(email, null);
    return null;
  }
};

// Optimized function to check punishment status with caching
const getCachedPunishmentStatus = async (ip: string, email?: string) => {
  const key = email ? `${ip}:${email}` : ip;
  const cached = punishmentCache.get(key);
  if (cached !== undefined) return cached;
  
  try {
    const isPunished = await rateLimitService.isPunished(ip, email);
    punishmentCache.set(key, isPunished);
    return isPunished;
  } catch (error) {
    // Default to not punished if check fails
    punishmentCache.set(key, false);
    return false;
  }
};

// Create base rate limiter with optimized custom logic
const createRateLimiter = (tier: string, defaultConfig: { windowMs: number; max: number }) => {
  return rateLimit({
    windowMs: defaultConfig.windowMs,
    max: async (req: RateLimitRequest) => {
      const userInfo = extractUserFromToken(req);
      const config = getCachedConfig();
      
      // Fast path: Valid user without custom rate limits (most common case)
      if (userInfo?.isValid) {
        // Check for user-specific rate limits (cached)
        const userRateLimit = await getCachedUserRateLimit(userInfo.email);
        if (userRateLimit && (!userRateLimit.expiresAt || userRateLimit.expiresAt > new Date())) {
          return userRateLimit.requestsPerHour;
        }
        
        // Fast path: Use tier-based limits without punishment check for valid users
        if (userRateLimit?.tier === 'premium') {
          return config.premium.max;
        } else if (userRateLimit?.tier === 'admin') {
          return config.admin.max;
        }
        
        // Only check punishment for valid users if they don't have special tiers
        const ip = getClientIP(req);
        const isPunished = await getCachedPunishmentStatus(ip, userInfo.email);
        if (isPunished) {
          return config.punishment.max;
        }
        
        return config.authorized.max;
      } else if (userInfo && !userInfo.isValid) {
        // Invalid token - apply punishment immediately
        const ip = getClientIP(req);
        // Don't await this - let it happen in background
        rateLimitService.escalatePunishment(ip, userInfo.email).catch(() => {});
        return config.punishment.max;
      }
      
      // Unauthorized - IP-based limiting with punishment check
      const ip = getClientIP(req);
      const isPunished = await getCachedPunishmentStatus(ip);
      if (isPunished) {
        return config.punishment.max;
      }
      
      return defaultConfig.max;
    },
    keyGenerator: (req: Request) => generateRateLimitKey(req as RateLimitRequest, tier),
    handler: async (req: RateLimitRequest, res: Response) => {
      const ip = getClientIP(req);
      const userInfo = extractUserFromToken(req);
      const endpoint = req.originalUrl || req.url;
      
      // Log the violation asynchronously (don't block response)
      rateLimitService.logViolation({
        ipAddress: ip,
        userEmail: userInfo?.email,
        violationType: userInfo?.isValid === false ? 'invalid_token' : 
                      userInfo?.isValid === true ? 'user_limit' : 'ip_limit',
        endpoint,
        userAgent: req.get('User-Agent'),
        requestCount: parseInt(req.get('X-RateLimit-Remaining') || '0'),
        limit: parseInt(req.get('X-RateLimit-Limit') || '0')
      }).catch(() => {});
      
      // Escalate punishment for repeat offenders asynchronously
      if (userInfo?.isValid === false) {
        rateLimitService.escalatePunishment(ip, userInfo?.email).catch(() => {});
      }
      
      const retryAfter = Math.ceil(defaultConfig.windowMs / 1000);
      
      res.status(429).json({
        success: false,
        error: {
          message: 'Too many requests. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter
        },
        rateLimitInfo: {
          tier: userInfo?.isValid ? 'authorized' : 'unauthorized',
          resetTime: new Date(Date.now() + defaultConfig.windowMs)
        }
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// IP-based rate limiter (first layer of defense)
export const ipRateLimit = (() => {
  const config = getCachedConfig();
  return createRateLimiter('ip', config.unauthorized);
})();

// Authentication-aware rate limiter (second layer)
export const authRateLimit = (() => {
  const config = getCachedConfig();
  return createRateLimiter('auth', config.authorized);
})();

// Admin endpoints protection
export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: (req: Request) => {
    const rateLimitReq = req as RateLimitRequest;
    const userInfo = extractUserFromToken(rateLimitReq);
    return userInfo?.email || getClientIP(rateLimitReq);
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many admin requests. Please try again later.',
        code: 'ADMIN_RATE_LIMIT_EXCEEDED',
        retryAfter: 900 // 15 minutes
      }
    });
  }
});

// Optimized middleware to add rate limit info to successful requests
export const rateLimitInfo = async (req: RateLimitRequest, res: Response, next: NextFunction) => {
  try {
    const userInfo = extractUserFromToken(req);
    const config = getCachedConfig();
    
    let tier = 'unauthorized';
    let limit = config.unauthorized.max;
    
    if (userInfo?.isValid) {
      // Use cached user rate limit
      const userRateLimit = await getCachedUserRateLimit(userInfo.email);
      if (userRateLimit) {
        tier = userRateLimit.tier;
        limit = userRateLimit.requestsPerHour;
      } else {
        tier = 'authorized';
        limit = config.authorized.max;
      }
    }
    
    req.rateLimitInfo = {
      tier,
      limit,
      remaining: parseInt(res.get('X-RateLimit-Remaining') || limit.toString()),
      resetTime: new Date(Date.now() + config.authorized.windowMs),
      userEmail: userInfo?.email
    };
    
    next();
  } catch (error) {
    // Don't block the request if rate limit info fails
    console.error('Error getting rate limit info:', error);
    next();
  }
};

// Combined rate limiting middleware (apply both IP and auth limits)
export const combinedRateLimit = [ipRateLimit, authRateLimit, rateLimitInfo];

// Export the service for use in admin endpoints
export { rateLimitService };

// Export cache clearing function for testing
export const clearRateLimitCaches = () => {
  userRateLimitCache.clear();
  punishmentCache.clear();
  configCache.clear();
}; 