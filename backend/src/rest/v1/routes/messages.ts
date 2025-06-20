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
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
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

// GET /v1/conversations/:conversationId/messages/:messageId
router.get('/:conversationId/messages/:messageId',
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

    res.status(200).json({
      success: true,
      data: message,
    });
  })
);

// PUT /v1/conversations/:conversationId/messages/:messageId  
router.put('/:conversationId/messages/:messageId',
  authenticateToken,
  param('conversationId')
    .matches(/^conv_[0-9]+_[a-z0-9]+$/)
    .withMessage('Conversation ID must be in format: conv_{timestamp}_{randomString}'),
  param('messageId')
    .matches(/^msg_[0-9]+_[a-z0-9]+$/)
    .withMessage('Message ID must be in format: msg_{timestamp}_{randomString}'),
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ min: 1, max: 10000 })
    .withMessage('Message content must be between 1 and 10000 characters'),
  validate,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user!.email;
    const conversationId = req.params['conversationId']!;
    const messageId = req.params['messageId']!;
    const { content } = req.body;

    const message = await messageService.updateMessage(messageId, userEmail, conversationId, content);

    res.status(200).json({
      success: true,
      data: message,
    });
  })
);

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