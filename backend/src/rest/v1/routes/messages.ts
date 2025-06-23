import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { messageEncryptionMiddleware } from '../../../middleware/encryption';
import { asyncHandler } from '../../../middleware/error';
import { validate } from '../../../middleware/validation';
import { messageService } from '../../../services/message.service';
import { MESSAGE_LIMITS } from '../../../config/constants';

const router = Router();

/**
 * @swagger
 * /v1/conversations/{conversationId}/messages:
 *   get:
 *     summary: Get messages in a conversation
 *     tags: [Messages]
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
 *         description: Messages retrieved
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
 *                                 $ref: '#/components/schemas/Message'
 */
// GET /v1/conversations/:conversationId/messages
router.get('/:conversationId/messages',
  authenticateToken,
  messageEncryptionMiddleware,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
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
    const conversationId = req.params['conversationId']!;
    const page = parseInt(String(req.query['page'] || '1'), 10);
    const limit = parseInt(String(req.query['limit'] || '20'), 10);

    const result = await messageService.getMessages(conversationId, userEmail, { page, limit });

    // Use encrypted response helper if available
    if (res.encryptedJson) {
      await res.encryptedJson({
        success: true,
        data: result,
      });
    } else {
      res.status(200).json({
        success: true,
        data: result,
      });
    }
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send a message to a conversation
 *     tags: [Messages]
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
 *             $ref: '#/components/schemas/CreateMessageRequest'
 *     responses:
 *       201:
 *         description: Message sent
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Message'
 */
// POST /v1/conversations/:conversationId/messages
router.post('/:conversationId/messages',
  authenticateToken,
  messageEncryptionMiddleware,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ min: MESSAGE_LIMITS.MIN_CONTENT_LENGTH, max: MESSAGE_LIMITS.MAX_CONTENT_LENGTH })
    .withMessage(`Message content must be between ${MESSAGE_LIMITS.MIN_CONTENT_LENGTH} and ${MESSAGE_LIMITS.MAX_CONTENT_LENGTH.toLocaleString()} characters`),
  body('messageType')
    .optional()
    .isIn(['TEXT', 'IMAGE', 'FILE'])
    .withMessage('Message type must be TEXT, IMAGE, or FILE'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const { content, messageType } = req.body;

    const message = await messageService.createMessage({
      conversationId,
      senderId: userEmail,
      content,
      messageType,
    });

    // Use encrypted response helper if available
    if (res.encryptedJson) {
      await res.encryptedJson({
        success: true,
        data: message,
      });
    } else {
      res.status(201).json({
        success: true,
        data: message,
      });
    }
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}/messages/{messageId}:
 *   get:
 *     summary: Get a specific message in a conversation
 *     tags: [Messages]
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
 *       - name: messageId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^msg_[0-9]+_[a-z0-9]+$'
 *           description: 'Message ID in format: msg_{timestamp}_{randomString}'
 *           example: 'msg_1750386041311_abc123def'
 *     responses:
 *       200:
 *         description: Message retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Message'
 *       404:
 *         description: Message not found
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
 */
// GET /v1/conversations/:conversationId/messages/:messageId
router.get('/:conversationId/messages/:messageId',
  authenticateToken,
  messageEncryptionMiddleware,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  param('messageId')
    .matches(/^msg_[0-9]+_[a-z0-9]+$/)
    .withMessage('Message ID must be in format: msg_{timestamp}_{randomString}'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const messageId = req.params['messageId']!;

    // For Firestore, we can get the message directly from the subcollection
    const messages = await messageService.getMessages(conversationId, userEmail, { page: 1, limit: 100 });
    const message = messages.data.find(m => m.id === messageId);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found'
        }
      });
    }

    // Use encrypted response helper if available
    if (res.encryptedJson) {
      await res.encryptedJson({
        success: true,
        data: message,
      });
    } else {
      res.status(200).json({
        success: true,
        data: message,
      });
    }
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}/messages/{messageId}:
 *   put:
 *     summary: Update a specific message in a conversation
 *     tags: [Messages]
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
 *       - name: messageId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^msg_[0-9]+_[a-z0-9]+$'
 *           description: 'Message ID in format: msg_{timestamp}_{randomString}'
 *           example: 'msg_1750386041311_abc123def'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMessageRequest'
 *     responses:
 *       200:
 *         description: Message updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Message'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Message not found
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
 */
// PUT /v1/conversations/:conversationId/messages/:messageId  
router.put('/:conversationId/messages/:messageId',
  authenticateToken,
  messageEncryptionMiddleware,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  param('messageId')
    .matches(/^msg_[0-9]+_[a-z0-9]+$/)
    .withMessage('Message ID must be in format: msg_{timestamp}_{randomString}'),
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ min: MESSAGE_LIMITS.MIN_CONTENT_LENGTH, max: MESSAGE_LIMITS.MAX_CONTENT_LENGTH })
    .withMessage(`Message content must be between ${MESSAGE_LIMITS.MIN_CONTENT_LENGTH} and ${MESSAGE_LIMITS.MAX_CONTENT_LENGTH.toLocaleString()} characters`),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const messageId = req.params['messageId']!;
    const { content } = req.body;

    const message = await messageService.updateMessage(messageId, userEmail, conversationId, content);

    // Use encrypted response helper if available
    if (res.encryptedJson) {
      await res.encryptedJson({
        success: true,
        data: message,
      });
    } else {
      res.status(200).json({
        success: true,
        data: message,
      });
    }
  })
);

/**
 * @swagger
 * /v1/conversations/{conversationId}/messages/{messageId}:
 *   delete:
 *     summary: Delete a specific message in a conversation
 *     tags: [Messages]
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
 *       - name: messageId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^msg_[0-9]+_[a-z0-9]+$'
 *           description: 'Message ID in format: msg_{timestamp}_{randomString}'
 *           example: 'msg_1750386041311_abc123def'
 *     responses:
 *       204:
 *         description: Message deleted successfully
 *       404:
 *         description: Message not found
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
 */
// DELETE /v1/conversations/:conversationId/messages/:messageId
router.delete('/:conversationId/messages/:messageId',
  authenticateToken,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  param('messageId')
    .matches(/^msg_[0-9]+_[a-z0-9]+$/)
    .withMessage('Message ID must be in format: msg_{timestamp}_{randomString}'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const messageId = req.params['messageId']!;

    await messageService.deleteMessage(messageId, userEmail, conversationId);

    res.status(204).send();
  })
);

export { router as messageRoutes }; 