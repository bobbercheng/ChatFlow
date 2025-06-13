import { PrismaClient, User } from '@prisma/client';
import bcrypt from 'bcrypt';
import { HttpError } from '../middleware/error';
import { generateToken } from '../middleware/auth';

const prisma = new PrismaClient();

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  user: Omit<User, 'hashedPassword'>;
  token: string;
}

export class AuthService {
  async register(data: RegisterData): Promise<AuthResult> {
    const { email, password, displayName } = data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new HttpError(409, 'User already exists', 'USER_ALREADY_EXISTS');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        hashedPassword,
        displayName,
      },
    });

    // Generate token
    const token = generateToken(email);

    // Return user without password
    const { hashedPassword: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async login(data: LoginData): Promise<AuthResult> {
    const { email, password } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);

    if (!isPasswordValid) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Update last seen
    await prisma.user.update({
      where: { email },
      data: { lastSeen: new Date(), isOnline: true },
    });

    // Generate token
    const token = generateToken(email);

    // Return user without password
    const { hashedPassword: _, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async getUserProfile(email: string): Promise<Omit<User, 'hashedPassword'>> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const { hashedPassword: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateOnlineStatus(email: string, isOnline: boolean): Promise<Omit<User, 'hashedPassword'>> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const updatedUser = await prisma.user.update({
      where: { email },
      data: {
        isOnline,
        lastSeen: new Date(),
      },
    });

    const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }
}

export const authService = new AuthService(); 