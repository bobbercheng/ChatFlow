import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { searchService, SearchQuery } from '../../../services/search.service';
import { Response } from 'express';

const router = express.Router();

/**
 * @swagger
 * /v1/search/conversations:
 *   get:
 *     summary: Search conversations with semantic understanding
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (supports natural language)
 *         example: "lunch plans with Sarah"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *         description: Maximum number of results
 *     responses:
 *       200:
 *         description: Search results with semantic relevance
 *   post:
 *     summary: Search conversations (POST version for web clients)
 *     description: Same functionality as GET but via POST to potentially reduce OPTIONS preflight overhead in some scenarios
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - q
 *             properties:
 *               q:
 *                 type: string
 *                 description: Search query (supports natural language)
 *                 example: "lunch plans with Sarah"
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 20
 *                 description: Maximum number of results
 *     responses:
 *       200:
 *         description: Search results with semantic relevance
 */
router.get('/conversations', 
  authenticateToken,
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 500 })
      .withMessage('Query must be between 1 and 500 characters'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const startTime = Date.now();
      const userId = req.user!.email;
      
      // Build search query
      const searchQuery: SearchQuery = {
        query: req.query['q'] as string,
        userId,
        limit: parseInt(req.query['limit'] as string) || 20,
      };

      // Execute semantic search
      const results = await searchService.semanticSearch(searchQuery);
      
      const searchTime = Date.now() - startTime;

      // Ensure results is an array
      const searchResults = Array.isArray(results) ? results : [];

      return res.json({
        success: true,
        data: {
          results: searchResults,
          query: searchQuery.query,
          totalResults: searchResults.length,
          searchTime,
        },
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Search error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Search failed',
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/conversations:
 *   post:
 *     summary: Search conversations (POST version for web clients)
 *     description: Same functionality as GET but via POST to potentially reduce OPTIONS preflight overhead in some scenarios
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - q
 *             properties:
 *               q:
 *                 type: string
 *                 description: Search query (supports natural language)
 *                 example: "lunch plans with Sarah"
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 20
 *                 description: Maximum number of results
 *     responses:
 *       200:
 *         description: Search results with semantic relevance
 */
// POST version of conversations search endpoint for web clients
router.post('/conversations', 
  authenticateToken,
  [
    body('q')
      .notEmpty()
      .isLength({ min: 1, max: 500 })
      .withMessage('Query must be between 1 and 500 characters'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const startTime = Date.now();
      const userId = req.user!.email;
      
      // Build search query
      const searchQuery: SearchQuery = {
        query: req.body.q,
        userId,
        limit: req.body.limit || 20,
      };

      // Execute semantic search
      const results = await searchService.semanticSearch(searchQuery);
      
      const searchTime = Date.now() - startTime;

      // Ensure results is an array
      const searchResults = Array.isArray(results) ? results : [];

      return res.json({
        success: true,
        data: {
          results: searchResults,
          query: searchQuery.query,
          totalResults: searchResults.length,
          searchTime,
        },
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Search error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Search failed',
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/suggestions:
 *   get:
 *     summary: Get search suggestions based on user input or default suggestions
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *         description: Partial search query (optional - returns default suggestions if empty)
 *         example: "lunch"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *         description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Search suggestions
 *   post:
 *     summary: Get search suggestions (POST version for web clients)
 *     description: Same functionality as GET but via POST to potentially reduce OPTIONS preflight overhead in some scenarios
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               q:
 *                 type: string
 *                 description: Partial search query (optional)
 *                 example: "lunch"
 *               limit:
 *                 type: integer
 *                 default: 5
 *                 description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Search suggestions
 */
router.get('/suggestions',
  authenticateToken,
  [
    query('q')
      .optional()
      .isLength({ min: 0, max: 100 })
      .withMessage('Query must be between 1 and 100 characters'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Limit must be between 1 and 10'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const query = (req.query['q'] as string) || '';
      const limit = parseInt(req.query['limit'] as string) || 5;
      const userId = req.user!.email;

      // Get intelligent suggestions using the search service
      const suggestions = await searchService.getSuggestions(query, userId, limit);

      return res.json({
        success: true,
        data: suggestions.map(s => ({
          suggestion: s.text,
          type: s.type,
          count: s.frequency || 1,
          category: s.category,
        })),
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Suggestions error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate suggestions'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/suggestions:
 *   post:
 *     summary: Get search suggestions (POST version for web clients)
 *     description: Same functionality as GET but via POST to potentially reduce OPTIONS preflight overhead in some scenarios
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               q:
 *                 type: string
 *                 description: Partial search query (optional)
 *                 example: "lunch"
 *               limit:
 *                 type: integer
 *                 default: 5
 *                 description: Maximum number of suggestions
 *     responses:
 *       200:
 *         description: Search suggestions
 */
// POST version of suggestions endpoint for web clients
router.post('/suggestions',
  authenticateToken,
  [
    body('q')
      .optional()
      .isLength({ min: 0, max: 100 })
      .withMessage('Query must be between 1 and 100 characters'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Limit must be between 1 and 10'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const query = req.body.q || '';
      const limit = req.body.limit || 5;
      const userId = req.user!.email;

      // Get intelligent suggestions using the search service
      const suggestions = await searchService.getSuggestions(query, userId, limit);

      return res.json({
        success: true,
        data: suggestions.map(s => ({
          suggestion: s.text,
          type: s.type,
          count: s.frequency || 1,
          category: s.category,
        })),
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Suggestions error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate suggestions'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/index-all:
 *   post:
 *     summary: Bulk index all existing messages for search
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userOnly
 *         schema:
 *           type: boolean
 *           default: true
 *         description: If true, only index messages from user's conversations
 *     responses:
 *       200:
 *         description: Bulk indexing completed
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
 *                     totalConversations:
 *                       type: integer
 *                     totalMessages:
 *                       type: integer
 *                     indexedMessages:
 *                       type: integer
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     duration:
 *                       type: integer
 */
router.post('/index-all',
  authenticateToken,
  [
    query('userOnly')
      .optional()
      .isBoolean()
      .withMessage('userOnly must be a boolean'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const startTime = Date.now();
      const userEmail = req.user!.email;
      const userOnly = req.query['userOnly'] !== 'false'; // Default to true
      
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.log(`Starting bulk indexing for ${userOnly ? userEmail : 'all users'}`);
      }

      // Execute bulk indexing
      const result = await searchService.indexAllMessages(userOnly ? userEmail : undefined);
      
      const duration = Date.now() - startTime;

      return res.json({
        success: true,
        data: {
          ...result,
          duration,
          message: `Successfully indexed ${result.indexedMessages}/${result.totalMessages} messages across ${result.totalConversations} conversations`,
        },
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Bulk indexing error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Bulk indexing failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/suggestions/click:
 *   post:
 *     summary: Track when a user clicks on a search suggestion
 *     description: Record user interaction with search suggestions for analytics and improving suggestion quality
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClickTrackingRequest'
 *     responses:
 *       200:
 *         description: Suggestion click tracked successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "Suggestion click tracked successfully"
 *       400:
 *         description: Invalid click tracking parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Click tracking service error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/suggestions/click',
  authenticateToken,
  [
    body('query')
      .notEmpty()
      .withMessage('Query is required'),
    body('suggestionText')
      .notEmpty()
      .withMessage('Suggestion text is required'),
    body('suggestionType')
      .notEmpty()
      .withMessage('Suggestion type is required'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const { query, suggestionText, suggestionType } = req.body;
      const userId = req.user!.email;

      // Track the suggestion click
      await searchService.trackSuggestionClick(query, suggestionText, suggestionType, userId);

      return res.json({
        success: true,
        data: {
          message: 'Suggestion click tracked successfully'
        }
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Suggestion click tracking error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to track suggestion click'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/index:
 *   post:
 *     summary: Manually trigger indexing of a message
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 */
router.post('/index',
  authenticateToken,
  [
    body('conversationId')
      .notEmpty()
      .withMessage('Conversation ID is required'),
    body('messageId')
      .notEmpty()
      .withMessage('Message ID is required'),
  ],
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            details: errors.array()
          }
        });
      }

      const { conversationId, messageId } = req.body;
      
      // Get message data
      const admin = require('firebase-admin');
      const messageDoc = await admin.firestore()
        .doc(`conversations/${conversationId}/messages/${messageId}`)
        .get();
      
      if (!messageDoc.exists) {
        return res.status(404).json({
          success: false,
          error: { message: 'Message not found' }
        });
      }

      const messageData = { id: messageDoc.id, ...messageDoc.data() };
      
      // Index the message
      await searchService.indexMessage(messageData, conversationId);

      return res.json({
        success: true,
        data: {
          message: 'Message indexed successfully',
          messageId,
          conversationId,
        }
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Manual indexing error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to index message'
        }
      });
    }
  }
);

/**
 * @swagger
 * /v1/search/performance:
 *   get:
 *     summary: Get search performance statistics
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance statistics
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
 *                     avgResponseTime:
 *                       type: number
 *                       description: Average response time in milliseconds
 *                     cacheHitRate:
 *                       type: number
 *                       description: Cache hit rate percentage
 *                     totalRequests:
 *                       type: integer
 *                       description: Total number of requests processed
 *                     cacheHits:
 *                       type: integer
 *                       description: Number of cache hits
 */
router.get('/performance',
  authenticateToken,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      // Get performance stats from the search service
      const stats = searchService.getPerformanceStats();
      
      return res.json({
        success: true,
        data: {
          ...stats,
          target: '10ms',
          status: stats.avgResponseTime <= 10 ? 'OPTIMAL' : stats.avgResponseTime <= 50 ? 'ACCEPTABLE' : 'NEEDS_OPTIMIZATION'
        }
      });

    } catch (error) {
      // Only log in non-test environments to reduce test output verbosity
      if (process.env['NODE_ENV'] !== 'test') {
        console.error('Performance stats error:', error);
      }
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to get performance statistics'
        }
      });
    }
  }
);

export default router; 