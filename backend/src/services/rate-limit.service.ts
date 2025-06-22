import { db } from '../config/firestore';
import { 
  UserRateLimit, 
  RateLimitViolation, 
  PunishmentRecord,
  RateLimitConfig 
} from '../types/rate-limit';

class RateLimitService {
  private readonly userRateLimitsCollection = 'userRateLimits';
  private readonly violationsCollection = 'rateLimitViolations';
  private readonly punishmentsCollection = 'punishments';

  // Default rate limit configuration
  private readonly defaultConfig: RateLimitConfig = {
    unauthorized: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100
    },
    authorized: {
      windowMs: 60 * 60 * 1000, // 1 hour  
      max: 1000
    },
    punishment: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10,
      duration: 60 * 60 * 1000 // 1 hour punishment
    },
    premium: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10000
    },
    admin: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 100000 // Effectively unlimited
    }
  };

  getConfig(): RateLimitConfig {
    return this.defaultConfig;
  }

  // User Rate Limits Management
  async getUserRateLimit(email: string): Promise<UserRateLimit | null> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return null;
      }

      const doc = await db
        .collection(this.userRateLimitsCollection)
        .doc(email)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      return {
        email,
        requestsPerHour: data?.['requestsPerHour'] || this.defaultConfig.authorized.max,
        requestsPerDay: data?.['requestsPerDay'],
        tier: data?.['tier'] || 'basic',
        expiresAt: data?.['expiresAt']?.toDate(),
        createdAt: data?.['createdAt']?.toDate() || new Date(),
        updatedAt: data?.['updatedAt']?.toDate() || new Date()
      };
    } catch (error) {
      console.error('Error getting user rate limit:', error);
      return null;
    }
  }

  async setUserRateLimit(userRateLimit: Omit<UserRateLimit, 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return false;
      }

      const now = new Date();
      const docData = {
        requestsPerHour: userRateLimit.requestsPerHour,
        requestsPerDay: userRateLimit.requestsPerDay || null,
        tier: userRateLimit.tier,
        expiresAt: userRateLimit.expiresAt || null,
        updatedAt: now
      };

      // Check if document exists to determine if we should set createdAt
      const doc = await db
        .collection(this.userRateLimitsCollection)
        .doc(userRateLimit.email)
        .get();

      if (!doc.exists) {
        (docData as any).createdAt = now;
      }

      await db
        .collection(this.userRateLimitsCollection)
        .doc(userRateLimit.email)
        .set(docData, { merge: true });

      return true;
    } catch (error) {
      console.error('Error setting user rate limit:', error);
      return false;
    }
  }

  async deleteUserRateLimit(email: string): Promise<boolean> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return false;
      }

      await db
        .collection(this.userRateLimitsCollection)
        .doc(email)
        .delete();
      return true;
    } catch (error) {
      console.error('Error deleting user rate limit:', error);
      return false;
    }
  }

  async getAllUserRateLimits(): Promise<UserRateLimit[]> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return [];
      }

      const snapshot = await db
        .collection(this.userRateLimitsCollection)
        .get();

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          email: doc.id,
          requestsPerHour: data['requestsPerHour'],
          requestsPerDay: data['requestsPerDay'],
          tier: data['tier'],
          expiresAt: data['expiresAt']?.toDate(),
          createdAt: data['createdAt']?.toDate() || new Date(),
          updatedAt: data['updatedAt']?.toDate() || new Date()
        };
      });
    } catch (error) {
      console.error('Error getting all user rate limits:', error);
      return [];
    }
  }

  // Violation Tracking
  async logViolation(violation: Omit<RateLimitViolation, 'id' | 'timestamp'>): Promise<string | null> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return null;
      }

      const violationData = {
        ...violation,
        timestamp: new Date()
      };

      const docRef = await db
        .collection(this.violationsCollection)
        .add(violationData);

      return docRef.id;
    } catch (error) {
      console.error('Error logging violation:', error);
      return null;
    }
  }

  async getViolations(filters: {
    ipAddress?: string;
    userEmail?: string;
    violationType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}): Promise<RateLimitViolation[]> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return [];
      }

      let query = db.collection(this.violationsCollection) as any;

      if (filters.ipAddress) {
        query = query.where('ipAddress', '==', filters.ipAddress);
      }
      if (filters.userEmail) {
        query = query.where('userEmail', '==', filters.userEmail);
      }
      if (filters.violationType) {
        query = query.where('violationType', '==', filters.violationType);
      }
      if (filters.startDate) {
        query = query.where('timestamp', '>=', filters.startDate);
      }
      if (filters.endDate) {
        query = query.where('timestamp', '<=', filters.endDate);
      }

      query = query.orderBy('timestamp', 'desc');

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ipAddress: data['ipAddress'],
          userEmail: data['userEmail'],
          violationType: data['violationType'],
          endpoint: data['endpoint'],
          userAgent: data['userAgent'],
          timestamp: data['timestamp'].toDate(),
          requestCount: data['requestCount'],
          limit: data['limit']
        };
      });
    } catch (error) {
      console.error('Error getting violations:', error);
      return [];
    }
  }

  // Punishment Management
  async getPunishment(ipAddress: string, userEmail?: string): Promise<PunishmentRecord | null> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return null;
      }

      const punishmentId = userEmail ? `${ipAddress}:${userEmail}` : ipAddress;
      const doc = await db
        .collection(this.punishmentsCollection)
        .doc(punishmentId)
        .get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      return {
        ipAddress: data?.['ipAddress'] || ipAddress,
        userEmail: data?.['userEmail'],
        violationCount: data?.['violationCount'] || 0,
        lastViolation: data?.['lastViolation']?.toDate() || new Date(),
        punishmentUntil: data?.['punishmentUntil']?.toDate() || new Date(),
        escalationLevel: data?.['escalationLevel'] || 1
      };
    } catch (error) {
      console.error('Error getting punishment:', error);
      return null;
    }
  }

  async updatePunishment(punishment: PunishmentRecord): Promise<boolean> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return false;
      }

      const punishmentId = punishment.userEmail ? 
        `${punishment.ipAddress}:${punishment.userEmail}` : 
        punishment.ipAddress;

      await db
        .collection(this.punishmentsCollection)
        .doc(punishmentId)
        .set({
          ipAddress: punishment.ipAddress,
          userEmail: punishment.userEmail || null,
          violationCount: punishment.violationCount,
          lastViolation: punishment.lastViolation,
          punishmentUntil: punishment.punishmentUntil,
          escalationLevel: punishment.escalationLevel
        });

      return true;
    } catch (error) {
      console.error('Error updating punishment:', error);
      return false;
    }
  }

  async isPunished(ipAddress: string, userEmail?: string): Promise<boolean> {
    const punishment = await this.getPunishment(ipAddress, userEmail);
    if (!punishment) {
      return false;
    }

    return new Date() < punishment.punishmentUntil;
  }

  async escalatePunishment(ipAddress: string, userEmail?: string): Promise<PunishmentRecord> {
    const existing = await this.getPunishment(ipAddress, userEmail);
    const now = new Date();
    
    const escalationLevel = existing ? Math.min(existing.escalationLevel + 1, 5) : 1;
    const violationCount = existing ? existing.violationCount + 1 : 1;
    
    // Progressive punishment duration: 1h, 6h, 24h, 72h, 168h (1 week)
    const punishmentDurations = [
      1 * 60 * 60 * 1000,      // 1 hour
      6 * 60 * 60 * 1000,      // 6 hours  
      24 * 60 * 60 * 1000,     // 24 hours
      72 * 60 * 60 * 1000,     // 72 hours
      168 * 60 * 60 * 1000     // 1 week
    ];

    const punishmentDuration = punishmentDurations[Math.min(escalationLevel - 1, punishmentDurations.length - 1)] || 60 * 60 * 1000; // 1 hour fallback
    const punishmentUntil = new Date(now.getTime() + punishmentDuration);

    const punishment: PunishmentRecord = {
      ipAddress,
      userEmail: userEmail || undefined,
      violationCount,
      lastViolation: now,
      punishmentUntil,
      escalationLevel
    };

    await this.updatePunishment(punishment);
    return punishment;
  }

  async clearPunishment(ipAddress: string, userEmail?: string): Promise<boolean> {
    try {
      if (!db) {
        console.error('Firestore not initialized');
        return false;
      }

      const punishmentId = userEmail ? `${ipAddress}:${userEmail}` : ipAddress;
      await db
        .collection(this.punishmentsCollection)
        .doc(punishmentId)
        .delete();
      return true;
    } catch (error) {
      console.error('Error clearing punishment:', error);
      return false;
    }
  }

  // Analytics
  async getViolationStats(timeRange: { startDate: Date; endDate: Date }) {
    const violations = await this.getViolations({
      startDate: timeRange.startDate,
      endDate: timeRange.endDate
    });

    const stats = {
      totalViolations: violations.length,
      byType: {} as Record<string, number>,
      byEndpoint: {} as Record<string, number>,
      uniqueIPs: new Set<string>(),
      uniqueUsers: new Set<string>()
    };

    violations.forEach(violation => {
      stats.byType[violation.violationType] = (stats.byType[violation.violationType] || 0) + 1;
      stats.byEndpoint[violation.endpoint] = (stats.byEndpoint[violation.endpoint] || 0) + 1;
      stats.uniqueIPs.add(violation.ipAddress);
      if (violation.userEmail) {
        stats.uniqueUsers.add(violation.userEmail);
      }
    });

    return {
      totalViolations: stats.totalViolations,
      violationsByType: stats.byType,
      violationsByEndpoint: stats.byEndpoint,
      uniqueIPsCount: stats.uniqueIPs.size,
      uniqueUsersCount: stats.uniqueUsers.size
    };
  }
}

export const rateLimitService = new RateLimitService(); 