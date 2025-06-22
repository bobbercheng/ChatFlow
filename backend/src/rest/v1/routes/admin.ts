import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticateToken } from '../../../middleware/auth';
import { adminRateLimit, rateLimitService } from '../../../middleware/rate-limit';
import { UserRateLimit } from '../../../types/rate-limit';

const router = Router();

// Middleware to check admin permissions
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.email !== process.env['ADMIN_EMAIL']) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Admin access required',
        code: 'FORBIDDEN'
      }
    });
  }
  next();
};

// Apply rate limiting and auth to all admin routes
router.use(adminRateLimit);
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @swagger
 * /v1/admin/rate-limits/users:
 *   get:
 *     summary: Get all user rate limits
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user rate limits
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       email:
 *                         type: string
 *                       requestsPerHour:
 *                         type: integer
 *                       tier:
 *                         type: string
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 */
router.get('/rate-limits/users', async (_req: Request, res: Response) => {
  try {
    const userRateLimits = await rateLimitService.getAllUserRateLimits();
    
    return res.json({
      success: true,
      data: userRateLimits
    });
  } catch (error) {
    console.error('Error getting user rate limits:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get user rate limits',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/admin/rate-limits/users/{email}:
 *   get:
 *     summary: Get rate limit for specific user
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: email
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User rate limit details
 */
router.get('/rate-limits/users/:email', 
  [param('email').isEmail().withMessage('Valid email required')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid email format',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    try {
      const email = req.params['email'];
      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Email parameter is required',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      const userRateLimit = await rateLimitService.getUserRateLimit(email);
      
      if (!userRateLimit) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'User rate limit not found',
            code: 'NOT_FOUND'
          }
        });
      }

      return res.json({
        success: true,
        data: userRateLimit
      });
    } catch (error) {
      console.error('Error getting user rate limit:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get user rate limit',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/users/{email}:
 *   put:
 *     summary: Set or update user rate limit
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: email
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestsPerHour
 *               - tier
 *             properties:
 *               requestsPerHour:
 *                 type: integer
 *                 minimum: 1
 *               requestsPerDay:
 *                 type: integer
 *                 minimum: 1
 *               tier:
 *                 type: string
 *                 enum: [basic, premium, admin, custom]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 */
router.put('/rate-limits/users/:email',
  [
    param('email').isEmail().withMessage('Valid email required'),
    body('requestsPerHour').isInt({ min: 1 }).withMessage('Requests per hour must be positive integer'),
    body('requestsPerDay').optional().isInt({ min: 1 }).withMessage('Requests per day must be positive integer'),
    body('tier').isIn(['basic', 'premium', 'admin', 'custom']).withMessage('Invalid tier'),
    body('expiresAt').optional().isISO8601().withMessage('Invalid expiration date')
  ],
  async (req: Request, res: Response) => {
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

    try {
      const email = req.params['email'];
      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Email parameter is required',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      const userRateLimit = {
        email: email,
        requestsPerHour: req.body.requestsPerHour,
        requestsPerDay: req.body.requestsPerDay || undefined,
        tier: req.body.tier,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined
      } as Omit<UserRateLimit, 'createdAt' | 'updatedAt'>;

      const success = await rateLimitService.setUserRateLimit(userRateLimit);
      
      if (!success) {
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to set user rate limit',
            code: 'INTERNAL_ERROR'
          }
        });
      }

      return res.json({
        success: true,
        data: {
          message: 'User rate limit updated successfully',
          userRateLimit
        }
      });
    } catch (error) {
      console.error('Error setting user rate limit:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to set user rate limit',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/users/{email}:
 *   delete:
 *     summary: Remove user rate limit (reverts to default)
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: email
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/rate-limits/users/:email',
  [param('email').isEmail().withMessage('Valid email required')],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid email format',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    try {
      const email = req.params['email'];
      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Email parameter is required',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      const success = await rateLimitService.deleteUserRateLimit(email);
      
      if (!success) {
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to delete user rate limit',
            code: 'INTERNAL_ERROR'
          }
        });
      }

      return res.json({
        success: true,
        data: {
          message: 'User rate limit removed successfully'
        }
      });
    } catch (error) {
      console.error('Error deleting user rate limit:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to delete user rate limit',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/violations:
 *   get:
 *     summary: Get rate limit violations with filtering
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ipAddress
 *         in: query
 *         schema:
 *           type: string
 *       - name: userEmail
 *         in: query
 *         schema:
 *           type: string
 *       - name: violationType
 *         in: query
 *         schema:
 *           type: string
 *           enum: [ip_limit, user_limit, invalid_token, abuse_detected]
 *       - name: startDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 */
router.get('/rate-limits/violations',
  [
    query('ipAddress').optional().isIP().withMessage('Invalid IP address'),
    query('userEmail').optional().isEmail().withMessage('Invalid email'),
    query('violationType').optional().isIn(['ip_limit', 'user_limit', 'invalid_token', 'abuse_detected']),
    query('startDate').optional().isISO8601().withMessage('Invalid start date'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
  ],
  async (req: Request, res: Response) => {
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

    try {
      const filters: any = {};
      if (req.query['ipAddress']) filters.ipAddress = req.query['ipAddress'] as string;
      if (req.query['userEmail']) filters.userEmail = req.query['userEmail'] as string;
      if (req.query['violationType']) filters.violationType = req.query['violationType'] as string;
      if (req.query['startDate']) filters.startDate = new Date(req.query['startDate'] as string);
      if (req.query['endDate']) filters.endDate = new Date(req.query['endDate'] as string);
      filters.limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : 50;

      const violations = await rateLimitService.getViolations(filters);
      
      return res.json({
        success: true,
        data: violations
      });
    } catch (error) {
      console.error('Error getting violations:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get violations',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/punishments/clear:
 *   post:
 *     summary: Clear punishment for IP/user
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ipAddress
 *             properties:
 *               ipAddress:
 *                 type: string
 *               userEmail:
 *                 type: string
 */
router.post('/rate-limits/punishments/clear',
  [
    body('ipAddress').isIP().withMessage('Valid IP address required'),
    body('userEmail').optional().isEmail().withMessage('Invalid email format')
  ],
  async (req: Request, res: Response) => {
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

    try {
      const success = await rateLimitService.clearPunishment(
        req.body.ipAddress,
        req.body.userEmail
      );
      
      if (!success) {
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to clear punishment',
            code: 'INTERNAL_ERROR'
          }
        });
      }

      return res.json({
        success: true,
        data: {
          message: 'Punishment cleared successfully'
        }
      });
    } catch (error) {
      console.error('Error clearing punishment:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to clear punishment',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/analytics:
 *   get:
 *     summary: Get rate limit analytics and statistics
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: startDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: endDate
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 */
router.get('/rate-limits/analytics',
  [
    query('startDate').isISO8601().withMessage('Valid start date required'),
    query('endDate').isISO8601().withMessage('Valid end date required')
  ],
  async (req: Request, res: Response) => {
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

    try {
      const startDate = new Date(req.query['startDate'] as string);
      const endDate = new Date(req.query['endDate'] as string);
      
      const stats = await rateLimitService.getViolationStats({ startDate, endDate });
      
      return res.json({
        success: true,
        data: {
          timeRange: { startDate, endDate },
          ...stats
        }
      });
    } catch (error) {
      console.error('Error getting analytics:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get analytics',
          code: 'INTERNAL_ERROR'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/admin/rate-limits/config:
 *   get:
 *     summary: Get current rate limit configuration
 *     tags: [Admin - Rate Limits]
 *     security:
 *       - bearerAuth: []
 */
router.get('/rate-limits/config', async (_req: Request, res: Response) => {
  try {
    const config = rateLimitService.getConfig();
    
    return res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting config:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get configuration',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export { router as adminRoutes }; 