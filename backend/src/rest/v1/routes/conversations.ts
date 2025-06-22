import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { asyncHandler } from '../../../middleware/error';
import { validate } from '../../../middleware/validation';
import { conversationService } from '../../../services/conversation.service';

const router = Router();

/**
 * @swagger
 * /v1/conversations:
 *   get:
 *     summary: Get user's conversations
 *     tags: [Conversations]
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
 *     responses:
 *       200:
 *         description: Conversations retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/PaginationResult'
 *                         - type: object
 *                           properties:
 *                             data:
 *                               type: array
 *                               items:
 *                                 $ref: '#/components/schemas/Conversation'
 */
// GET /v1/conversations
router.get('/',
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const page = parseInt(String(req.query['page'] || '1'), 10);
    const limit = parseInt(String(req.query['limit'] || '20'), 10);

    const result = await conversationService.getUserConversations(userEmail, { page, limit });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

/**
 * @swagger
 * /v1/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateConversationRequest'
 *     responses:
 *       201:
 *         description: Conversation created
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Conversation'
 */
// POST /v1/conversations
router.post('/',
  authenticateToken,
  body('participantEmails')
    .isArray({ min: 1 })
    .withMessage('participantEmails must be a non-empty array'),
  body('participantEmails.*')
    .isEmail()
    .withMessage('Each participant email must be a valid email address'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const { participantEmails } = req.body;

    const conversation = await conversationService.createConversation({
      participantEmails,
      createdBy: userEmail,
    });

    res.status(201).json({
      success: true,
      data: conversation,
    });
  })
);

export { router as conversationRoutes }; 