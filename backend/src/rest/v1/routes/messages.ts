import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { asyncHandler } from '../../../middleware/error';
import { validate } from '../../../middleware/validation';
import { messageService } from '../../../services/message.service';

const router = Router();

// GET /v1/conversations/:conversationId/messages
router.get('/:conversationId/messages',
  authenticateToken,
  param('conversationId')
    .isUUID()
    .withMessage('Conversation ID must be a valid UUID'),
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

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// POST /v1/conversations/:conversationId/messages
router.post('/:conversationId/messages',
  authenticateToken,
  param('conversationId')
    .isUUID()
    .withMessage('Conversation ID must be a valid UUID'),
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message content must be between 1 and 10000 characters'),
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

    res.status(201).json({
      success: true,
      data: message,
    });
  })
);

// GET /v1/messages/:messageId
router.get('/message/:messageId',
  authenticateToken,
  param('messageId')
    .isUUID()
    .withMessage('Message ID must be a valid UUID'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const messageId = req.params['messageId']!;

    const message = await messageService.getMessageById(messageId, userEmail);

    res.status(200).json({
      success: true,
      data: message,
    });
  })
);

// PUT /v1/messages/:messageId
router.put('/message/:messageId',
  authenticateToken,
  param('messageId')
    .isUUID()
    .withMessage('Message ID must be a valid UUID'),
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message content must be between 1 and 10000 characters'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const messageId = req.params['messageId']!;
    const { content } = req.body;

    const message = await messageService.updateMessage(messageId, userEmail, content);

    res.status(200).json({
      success: true,
      data: message,
    });
  })
);

// DELETE /v1/messages/:messageId
router.delete('/message/:messageId',
  authenticateToken,
  param('messageId')
    .isUUID()
    .withMessage('Message ID must be a valid UUID'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const messageId = req.params['messageId']!;

    await messageService.deleteMessage(messageId, userEmail);

    res.status(204).send();
  })
);

export { router as messageRoutes }; 