import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../../../services/auth.service';
import { asyncHandler } from '../../../middleware/error';
import { HttpError } from '../../../middleware/error';

const router = Router();

// Validation middleware
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('displayName').trim().isLength({ min: 1, max: 255 }).withMessage('Display name is required'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const handleValidationErrors = (req: any, _res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError(400, 'Validation failed', 'VALIDATION_ERROR', errors.array());
  }
  next();
};

// POST /v1/auth/register
router.post('/register', 
  registerValidation,
  handleValidationErrors,
  asyncHandler(async (req: any, res: any) => {
    const { email, password, displayName } = req.body;
    
    const result = await authService.register({
      email,
      password,
      displayName,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  })
);

// POST /v1/auth/login
router.post('/login',
  loginValidation,
  handleValidationErrors,
  asyncHandler(async (req: any, res: any) => {
    const { email, password } = req.body;
    
    const result = await authService.login({
      email,
      password,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  })
);

export { router as authRoutes }; 