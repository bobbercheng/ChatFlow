import { Router, Request, Response } from 'express';
import { keyManagementService } from '../../../services/key-management.service';

const router = Router();

/**
 * @swagger
 * /v1/keys/current:
 *   get:
 *     summary: Get current keyIds for encryption (no actual keys)
 *     tags: [Key Coordination]
 *     responses:
 *       200:
 *         description: Current keyIds for client-side encryption
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyIds:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           description: KeyId for message encryption
 *                         search:
 *                           type: string
 *                           description: KeyId for search query encryption
 *                         suggestion:
 *                           type: string
 *                           description: KeyId for suggestion encryption
 *                     version:
 *                       type: string
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 */
router.get('/current', async (_req: Request, res: Response) => {
  try {
    // Get the most recent active keys for each purpose
    const purposes = ['message', 'search', 'suggestion'] as const;
    const keyIds: Record<string, string> = {};
    
    for (const purpose of purposes) {
      const keys = await keyManagementService.listKeys({ 
        purpose, 
        isActive: true 
      });
      
      // Get the most recent key (highest version)
      const latestKey = keys
        .sort((a, b) => b.version - a.version)
        .find(key => key.isActive);
      
      if (latestKey) {
        keyIds[purpose] = latestKey.keyId;
      } else {
        // Fallback to default keyId pattern
        keyIds[purpose] = `${purpose}_key`;
      }
    }
    
    return res.json({
      success: true,
      data: {
        keyIds,
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        instructions: {
          usage: 'Use these keyIds with client-side key derivation',
          derivation: 'Derive actual keys using: scrypt(keyId + userEmail, salt, 32)',
          security: 'Never transmit actual encryption keys over the network'
        }
      }
    });
  } catch (error) {
    console.error('Error getting current keyIds:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get current keyIds',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/keys/algorithms:
 *   get:
 *     summary: Get supported encryption algorithms and parameters
 *     tags: [Key Coordination]
 *     responses:
 *       200:
 *         description: Supported encryption algorithms
 */
router.get('/algorithms', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      supported: {
        symmetric: [
          {
            algorithm: 'AES-256-CBC',
            keySize: 256,
            ivSize: 128,
            recommended: true,
            description: 'AES with 256-bit key in CBC mode'
          },
          {
            algorithm: 'AES-256-GCM',
            keySize: 256,
            ivSize: 96,
            recommended: false,
            description: 'AES with 256-bit key in GCM mode (future support)'
          }
        ]
      },
      keyDerivation: {
        algorithm: 'scrypt',
        parameters: {
          N: 16384,
          r: 8,
          p: 1,
          keyLength: 32
        },
        saltSource: 'static',
        description: 'Key derived from keyId + userEmail using scrypt'
      },
      authentication: {
        method: 'HMAC-SHA256',
        tagLength: 22,
        description: 'Simplified authentication tag for compatibility'
      }
    }
  });
});

/**
 * @swagger
 * /v1/keys/version:
 *   get:
 *     summary: Get key system version information
 *     tags: [Key Coordination]
 *     responses:
 *       200:
 *         description: Key system version and capabilities
 */
router.get('/version', async (_req: Request, res: Response) => {
  try {
    const health = await keyManagementService.getKeySystemHealth();
    
    return res.json({
      success: true,
      data: {
        version: '1.0.0',
        apiVersion: 'v1',
        features: [
          'field-level-encryption',
          'key-derivation',
          'automatic-rotation',
          'multi-purpose-keys'
        ],
        status: {
          healthy: health.totalKeys > 0 && health.activeKeys > 0,
          totalKeys: health.totalKeys,
          activeKeys: health.activeKeys
        },
        compatibility: {
          clientLibraries: ['encryption-client.ts', 'browser-encryption'],
          minimumClientVersion: '1.0.0'
        }
      }
    });
  } catch (error) {
    console.error('Error getting key system version:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get key system version',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/keys/health:
 *   get:
 *     summary: Get public key system health (basic info only)
 *     tags: [Key Coordination]
 *     responses:
 *       200:
 *         description: Basic key system health information
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await keyManagementService.getKeySystemHealth();
    
    return res.json({
      success: true,
      data: {
        status: health.activeKeys > 0 ? 'healthy' : 'degraded',
        encryption: health.activeKeys > 0 ? 'available' : 'limited',
        lastUpdate: new Date().toISOString(),
        message: health.activeKeys > 0 
          ? 'Encryption services are fully operational'
          : 'Encryption services may be degraded'
      }
    });
  } catch (error) {
    console.error('Error getting public key health:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Key system temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      }
    });
  }
});

export { router as keyRoutes }; 