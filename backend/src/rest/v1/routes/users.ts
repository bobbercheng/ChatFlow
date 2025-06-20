import { Router } from 'express';
import { authenticateToken, AuthenticatedRequest } from '../../../middleware/auth';
import { asyncHandler } from '../../../middleware/error';
import { authService } from '../../../services/auth.service';

const router = Router();

// GET /v1/users/me
router.get('/me',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const userEmail = req.user?.email;
    if (!userEmail) {
      throw new Error('User email not found in request');
    }

    const user = await authService.getUserProfile(userEmail);

    res.status(200).json({
      success: true,
      data: user,
    });
  })
);

export { router as userRoutes }; 