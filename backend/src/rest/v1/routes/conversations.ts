import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { asyncHandler } from '../../../middleware/error';
import { validate } from '../../../middleware/validation';
import { conversationService, UpdateConversationData } from '../../../services/conversation.service';

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
 *     description: Creates a new conversation and automatically adds the creator as a participant
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

/**
 * @swagger
 * /v1/conversations/{conversationId}:
 *   get:
 *     summary: Get a specific conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: conversationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^conv_[0-9]+_[a-z0-9]+$'
 *           description: 'Conversation ID in format: conv_{timestamp}_{randomString}'
 *           example: 'conv_1750386041311_fpmswok2p'
 *     responses:
 *       200:
 *         description: Conversation retrieved
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Conversation'
 *       404:
 *         description: Conversation not found
 *       403:
 *         description: Access denied
 */
// GET /v1/conversations/:conversationId
router.get('/:conversationId',
  authenticateToken,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;

    const conversation = await conversationService.getConversationById(conversationId, userEmail);

    res.status(200).json({
      success: true,
      data: conversation,
    });
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}:
 *   put:
 *     summary: Update a conversation
 *     description: Only the conversation creator can modify the conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: conversationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^conv_[0-9]+_[a-z0-9]+$'
 *           description: 'Conversation ID in format: conv_{timestamp}_{randomString}'
 *           example: 'conv_1750386041311_fpmswok2p'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateConversationRequest'
 *     responses:
 *       200:
 *         description: Conversation updated
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Conversation'
 *       403:
 *         description: Only the conversation creator can modify this conversation
 *       404:
 *         description: Conversation not found
 */
// PUT /v1/conversations/:conversationId
router.put('/:conversationId',
  authenticateToken,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  body('participantEmails')
    .optional()
    .isArray({ min: 1 })
    .withMessage('participantEmails must be a non-empty array'),
  body('participantEmails.*')
    .optional()
    .isEmail()
    .withMessage('Each participant email must be a valid email address'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const updateData: UpdateConversationData = req.body;

    const conversation = await conversationService.updateConversation(conversationId, userEmail, updateData);

    res.status(200).json({
      success: true,
      data: conversation,
    });
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}:
 *   delete:
 *     summary: Delete a conversation
 *     description: Only administrators can delete conversations
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: conversationId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^conv_[0-9]+_[a-z0-9]+$'
 *           description: 'Conversation ID in format: conv_{timestamp}_{randomString}'
 *           example: 'conv_1750386041311_fpmswok2p'
 *     responses:
 *       204:
 *         description: Conversation deleted
 *       403:
 *         description: Only administrators can delete conversations
 *       404:
 *         description: Conversation not found
 */
// DELETE /v1/conversations/:conversationId
router.delete('/:conversationId',
  authenticateToken,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;

    await conversationService.deleteConversation(conversationId, userEmail);

    res.status(204).send();
  })
);

export { router as conversationRoutes }; 