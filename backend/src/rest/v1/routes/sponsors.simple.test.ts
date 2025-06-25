import request from 'supertest';
import express from 'express';
import sponsorRoutes from './sponsors';
import { sponsorService } from '../../../services/sponsor.service';
import { SponsorTargetFilter } from '../../../types/firestore';

// Mock all dependencies
jest.mock('../../../services/sponsor.service');
jest.mock('../../../middleware/rate-limit', () => ({
  adminRateLimit: (_req: any, _res: any, next: any) => next()
}));

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === 'admin-token') {
        req.user = { email: 'admin@chatflow.app' };
      } else if (token === 'user-token') {
        req.user = { email: 'user@example.com' };
      }
    }
    next();
  }
}));

const mockSponsorService = sponsorService as jest.Mocked<typeof sponsorService>;

// Create minimal test app
const createTestApp = () => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use('/sponsors', sponsorRoutes);
  return testApp;
};

describe('Sponsor Routes - Core Acceptance Criteria', () => {
  let app: express.Application;
  const adminEmail = 'admin@chatflow.app';

  beforeAll(() => {
    process.env['ADMIN_EMAIL'] = adminEmail;
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Must Have Acceptance Criteria', () => {
    it('Admin can create sponsor with email, message, and filter type', async () => {
      const mockSponsor = {
        id: 'sponsor_123',
        sponsorUserEmail: 'sponsor@example.com',
        message: 'Welcome!',
        targetFilter: SponsorTargetFilter.NEW_USER,
        isActive: true,
        createdBy: adminEmail,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockSponsorService.createSponsor.mockResolvedValueOnce(mockSponsor);

      const response = await request(app)
        .post('/sponsors')
        .set('Authorization', 'Bearer admin-token')
        .send({
          sponsorUserEmail: 'sponsor@example.com',
          message: 'Welcome!',
          targetFilter: 'new_user'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockSponsorService.createSponsor).toHaveBeenCalledWith({
        sponsorUserEmail: 'sponsor@example.com',
        message: 'Welcome!',
        targetFilter: SponsorTargetFilter.NEW_USER,
        createdBy: adminEmail
      });
    });

    it('Admin can deactivate sponsor by ID (soft delete)', async () => {
      mockSponsorService.deactivateSponsor.mockResolvedValueOnce();

      const response = await request(app)
        .delete('/sponsors/sponsor_123')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Sponsor deactivated successfully');
      expect(mockSponsorService.deactivateSponsor).toHaveBeenCalledWith('sponsor_123', adminEmail);
    });

    it('Admin can list all active sponsors', async () => {
      const mockResult = {
        data: [
          {
            id: 'sponsor_1',
            sponsorUserEmail: 'sponsor1@example.com',
            message: 'Welcome message',
            targetFilter: SponsorTargetFilter.NEW_USER,
            isActive: true,
            createdBy: adminEmail,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      };

      mockSponsorService.getSponsors.mockResolvedValueOnce(mockResult);

      const response = await request(app)
        .get('/sponsors')
        .set('Authorization', 'Bearer admin-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sponsors).toHaveLength(1);
      expect(mockSponsorService.getSponsors).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        includeInactive: false
      });
    });

    it('All operations are admin-only and properly authenticated', async () => {
      // Test POST with non-admin auth (should be forbidden)
      let response = await request(app)
        .post('/sponsors')
        .set('Authorization', 'Bearer user-token')
        .send({ sponsorUserEmail: 'test@example.com', message: 'test', targetFilter: 'new_user' });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      // Test DELETE with non-admin auth
      response = await request(app)
        .delete('/sponsors/test')
        .set('Authorization', 'Bearer user-token');
      expect(response.status).toBe(403);

      // Test GET with non-admin auth
      response = await request(app)
        .get('/sponsors')
        .set('Authorization', 'Bearer user-token');
      expect(response.status).toBe(403);
    });
  });
}); 