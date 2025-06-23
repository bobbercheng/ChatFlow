import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { asyncHandler } from '../../../middleware/error';
import { authService } from '../../../services/auth.service';
import { keyManagementService } from '../../../services/key-management.service';
import { clientEncryption } from '../../../utils/encryption-client';

const router = Router();

/**
 * @swagger
 * /v1/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// GET /v1/users/me
router.get('/me',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new Error('User email not found in request');
    }

    const user = await authService.getUserProfile(userEmail);

    res.status(200).json({
      success: true,
      data: user,
    });
  })
);

/**
 * @swagger
 * /v1/users/me/keys/context:
 *   get:
 *     summary: Get user's encryption key context
 *     tags: [Users - Key Context]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's key context for encryption
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
 *                     userEmail:
 *                       type: string
 *                     keyIds:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                         search:
 *                           type: string
 *                         suggestion:
 *                           type: string
 *                     instructions:
 *                       type: object
 */
router.get('/me/keys/context',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new Error('User email not found in request');
    }

    try {
      // Get current active keys for each purpose
      const purposes = ['message', 'search', 'suggestion'] as const;
      const keyIds: Record<string, string> = {};
      
      for (const purpose of purposes) {
        const keys = await keyManagementService.listKeys({ 
          purpose, 
          isActive: true 
        });
        
        // Get the most recent key
        const latestKey = keys
          .sort((a, b) => b.version - a.version)
          .find(key => key.isActive);
        
        keyIds[purpose] = latestKey?.keyId || `${purpose}_key`;
      }

      res.status(200).json({
        success: true,
        data: {
          userEmail,
          keyIds,
          derivationMethod: 'scrypt',
          instructions: {
            usage: 'Use these keyIds with your userEmail for client-side key derivation',
            derivation: `scrypt(keyId + '${userEmail}', 'salt', 32)`,
            security: 'Keys are derived locally - never transmitted over network'
          }
        }
      });
    } catch (error) {
      console.error('Error getting user key context:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get key context',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  })
);

/**
 * @swagger
 * /v1/users/me/keys/verify:
 *   post:
 *     summary: Verify client encryption/decryption capability
 *     tags: [Users - Key Context]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - testData
 *             properties:
 *               testData:
 *                 type: string
 *                 description: Plain text to encrypt and verify
 *               purpose:
 *                 type: string
 *                 enum: [message, search, suggestion]
 *                 default: message
 *     responses:
 *       200:
 *         description: Encryption verification results
 */
router.post('/me/keys/verify',
  authenticateToken,
  [
    body('testData').isString().isLength({ min: 1 }).withMessage('Test data is required'),
    body('purpose').optional().isIn(['message', 'search', 'suggestion'])
  ],
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new Error('User email not found in request');
    }

    try {
      const { testData, purpose = 'message' } = req.body;
      
      // Encrypt using client encryption
      const encrypted = clientEncryption.encryptField(testData, {
        keyId: `${purpose}_key`,
        userEmail
      });
      
      // Decrypt to verify
      const decrypted = clientEncryption.decryptField(encrypted, {
        userEmail
      });
      
      const isValid = decrypted === testData;

      res.status(200).json({
        success: true,
        data: {
          verified: isValid,
          originalData: testData,
          encryptedData: encrypted,
          decryptedData: decrypted,
          match: isValid,
          message: isValid 
            ? 'Encryption/decryption working correctly'
            : 'Encryption/decryption verification failed'
        }
      });
    } catch (error) {
      console.error('Error verifying encryption:', error);
      res.status(500).json({
        success: false,
        error: {
          message: 'Encryption verification failed',
          code: 'VERIFICATION_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  })
);

export { router as userRoutes }; 