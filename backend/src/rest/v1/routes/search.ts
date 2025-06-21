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

      return res.json({
        success: true,
        data: {
          results,
          query: searchQuery.query,
          totalResults: results.length,
          searchTime,
        },
      });

    } catch (error) {
      console.error('Search error:', error);
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
 *     summary: Get search suggestions based on user input
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Partial search query
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
 */
router.get('/suggestions',
  authenticateToken,
  [
    query('q')
      .notEmpty()
      .isLength({ min: 1, max: 100 })
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

      const query = req.query['q'] as string;
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
      console.error('Suggestions error:', error);
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
      
      console.log(`Starting bulk indexing for ${userOnly ? userEmail : 'all users'}`);

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
      console.error('Bulk indexing error:', error);
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
 *     summary: Track when a user clicks on a suggestion
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *                 description: Original search query
 *               suggestionText:
 *                 type: string
 *                 description: The suggestion that was clicked
 *               suggestionType:
 *                 type: string
 *                 description: Type of suggestion (completion, popular, trending, etc.)
 *     responses:
 *       200:
 *         description: Click tracked successfully
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
      console.error('Suggestion click tracking error:', error);
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
      console.error('Manual indexing error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to index message'
        }
      });
    }
  }
);

export default router; 