import { Router, Request, Response } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { authenticateToken } from '../../../middleware/auth';
import { adminRateLimit } from '../../../middleware/rate-limit';
import { sponsorService, SponsorError } from '../../../services/sponsor.service';
import { SponsorTargetFilter } from '../../../types/firestore';

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
 * /v1/admin/sponsors:
 *   post:
 *     summary: Create a new sponsor or reactivate existing inactive sponsor
 *     tags: [Admin - Sponsors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sponsorUserEmail
 *               - message
 *               - targetFilter
 *             properties:
 *               sponsorUserEmail:
 *                 type: string
 *                 format: email
 *                 example: "sponsor@example.com"
 *               message:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 example: "Welcome to ChatFlow! I'm here to help you get started."
 *               targetFilter:
 *                 type: string
 *                 enum: [new_user, everyone]
 *                 example: "new_user"
 *     responses:
 *       201:
 *         description: Sponsor created or reactivated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error or invalid sponsor user
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Sponsor user not found
 *       409:
 *         description: Sponsor already active
 */
router.post('/', [
  body('sponsorUserEmail').isEmail().withMessage('Valid sponsor email required'),
  body('message').isLength({ min: 1, max: 2000 }).withMessage('Message must be 1-2000 characters'),
  body('targetFilter').isIn(['new_user', 'everyone']).withMessage('Invalid target filter')
], async (req: Request, res: Response) => {
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
    const adminEmail = (req as any).user?.email;
    if (!adminEmail) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Admin email not found',
          code: 'FORBIDDEN'
        }
      });
    }

    const sponsor = await sponsorService.createSponsor({
      sponsorUserEmail: req.body.sponsorUserEmail,
      message: req.body.message,
      targetFilter: req.body.targetFilter as SponsorTargetFilter,
      createdBy: adminEmail
    });

    return res.status(201).json({
      success: true,
      data: sponsor
    });
  } catch (error) {
    console.error('Error creating sponsor:', error);
    
    if (error instanceof SponsorError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create sponsor',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/admin/sponsors/{sponsorId}:
 *   delete:
 *     summary: Deactivate sponsor (soft delete)
 *     tags: [Admin - Sponsors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sponsorId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sponsor deactivated successfully
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
 *                     message:
 *                       type: string
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Sponsor not found
 *       409:
 *         description: Sponsor already inactive
 */
router.delete('/:sponsorId', [
  param('sponsorId').notEmpty().withMessage('Sponsor ID required')
], async (req: Request, res: Response) => {
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
    const sponsorId = req.params['sponsorId'];
    const adminEmail = (req as any).user?.email;
    
    if (!sponsorId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Sponsor ID parameter is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    if (!adminEmail) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Admin email not found',
          code: 'FORBIDDEN'
        }
      });
    }

    await sponsorService.deactivateSponsor(sponsorId, adminEmail);

    return res.json({
      success: true,
      data: {
        message: 'Sponsor deactivated successfully'
      }
    });
  } catch (error) {
    console.error('Error deactivating sponsor:', error);
    
    if (error instanceof SponsorError) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.code
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to deactivate sponsor',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/admin/sponsors:
 *   get:
 *     summary: List all sponsors with pagination
 *     tags: [Admin - Sponsors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - name: sponsorUserEmail
 *         in: query
 *         schema:
 *           type: string
 *           format: email
 *       - name: includeInactive
 *         in: query
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: List of sponsors
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
 *                     sponsors:
 *                       type: array
 *                     pagination:
 *                       type: object
 *       403:
 *         description: Admin access required
 */
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sponsorUserEmail').optional().isEmail().withMessage('Invalid sponsor email'),
  query('includeInactive').optional().isBoolean().withMessage('Include inactive must be boolean')
], async (req: Request, res: Response) => {
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
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;
    const sponsorUserEmail = req.query['sponsorUserEmail'] as string;
    const includeInactive = req.query['includeInactive'] === 'true';

    // Build filters based on query parameters
    const filters: any = {};
    if (sponsorUserEmail) {
      // If filtering by sponsor email, get specific sponsors
      filters.sponsorUserEmail = sponsorUserEmail;
    }

    const result = await sponsorService.getSponsors({ 
      page, 
      limit, 
      includeInactive,
      // Note: The sponsorUserEmail filter would need to be implemented in the service
      // For now, we'll get all sponsors and filter client-side if needed
    });

    // Filter by sponsor email if specified (client-side filtering)
    let filteredSponsors = result.data;
    if (sponsorUserEmail) {
      filteredSponsors = result.data.filter(sponsor => 
        sponsor.sponsorUserEmail === sponsorUserEmail
      );
    }

    return res.json({
      success: true,
      data: {
        sponsors: filteredSponsors,
        pagination: result.pagination
      }
    });
  } catch (error) {
    console.error('Error getting sponsors:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get sponsors',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

/**
 * @swagger
 * /v1/admin/sponsors/{sponsorId}:
 *   get:
 *     summary: Get sponsor by ID
 *     tags: [Admin - Sponsors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: sponsorId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Sponsor details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Sponsor not found
 */
router.get('/:sponsorId', [
  param('sponsorId').notEmpty().withMessage('Sponsor ID required')
], async (req: Request, res: Response) => {
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
    const sponsorId = req.params['sponsorId'];
    
    if (!sponsorId) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Sponsor ID parameter is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const sponsor = await sponsorService.getSponsorById(sponsorId);

    if (!sponsor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Sponsor not found',
          code: 'SPONSOR_NOT_FOUND'
        }
      });
    }

    return res.json({
      success: true,
      data: sponsor
    });
  } catch (error) {
    console.error('Error getting sponsor:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get sponsor',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export default router; 