export interface UserRateLimit {
  email: string;
  requestsPerHour: number;
  requestsPerDay?: number | undefined;
  tier: 'basic' | 'premium' | 'admin' | 'custom';
  expiresAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface RateLimitViolation {
  id: string;
  ipAddress: string;
  userEmail?: string | undefined;
  violationType: 'ip_limit' | 'user_limit' | 'invalid_token' | 'abuse_detected';
  endpoint: string;
  userAgent?: string | undefined;
  timestamp: Date;
  requestCount: number;
  limit: number;
}

export interface RateLimitConfig {
  unauthorized: {
    windowMs: number;
    max: number;
  };
  authorized: {
    windowMs: number;
    max: number;
  };
  punishment: {
    windowMs: number;
    max: number;
    duration: number; // punishment duration in ms
  };
  premium: {
    windowMs: number;
    max: number;
  };
  admin: {
    windowMs: number;
    max: number;
  };
}

export interface RateLimitResponse {
  success: boolean;
  data?: {
    tier: string;
    limit: number;
    remaining: number;
    resetTime: Date;
    violations?: RateLimitViolation[];
  };
  error?: {
    message: string;
    code: string;
    retryAfter?: number;
  };
}

export interface PunishmentRecord {
  ipAddress: string;
  userEmail?: string | undefined;
  violationCount: number;
  lastViolation: Date;
  punishmentUntil: Date;
  escalationLevel: number; // 1-5, higher = more severe punishment
} 