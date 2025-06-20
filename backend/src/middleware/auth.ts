import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { HttpError } from './error';

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
  };
}

export interface JwtPayload {
  email: string;
  iat?: number;
  exp?: number;
}

export const authenticateToken = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new HttpError(401, 'Access token required', 'TOKEN_REQUIRED');
  }

  const jwtSecret = process.env['JWT_SECRET'];
  if (!jwtSecret) {
    throw new HttpError(500, 'JWT secret not configured', 'JWT_SECRET_MISSING');
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    req.user = { email: decoded.email };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'Token expired', 'TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new HttpError(401, 'Invalid token', 'TOKEN_INVALID');
    } else {
      throw new HttpError(401, 'Token verification failed', 'TOKEN_VERIFICATION_FAILED');
    }
  }
};

export const generateToken = (email: string): string => {
  const jwtSecret = process.env['JWT_SECRET'];
  const jwtExpiresIn = process.env['JWT_EXPIRES_IN'] || '7d';

  if (!jwtSecret) {
    throw new HttpError(500, 'JWT secret not configured', 'JWT_SECRET_MISSING');
  }

  return jwt.sign({ email }, jwtSecret as string, { expiresIn: jwtExpiresIn } as SignOptions);
}; 