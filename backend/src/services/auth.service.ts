import bcrypt from 'bcrypt';
import { HttpError } from '../middleware/error';
import { generateToken } from '../middleware/auth';
import { databaseAdapter } from '../adapters';
import { COLLECTIONS, FirestoreUser } from '../types/firestore';
import { sponsorService } from './sponsor.service';

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
  user: Omit<FirestoreUser, 'hashedPassword'>;
  token: string;
}

export class AuthServiceFirestore {
  async register(data: RegisterData): Promise<AuthResult> {
    const { email, password, displayName } = data;

    // Check if user already exists
    const existingUser = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email);

    if (existingUser) {
      throw new HttpError(409, 'User already exists', 'USER_ALREADY_EXISTS');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user document
    const userData: Omit<FirestoreUser, 'id'> = {
      email,
      hashedPassword,
      displayName,
      isOnline: false,
      lastSeen: new Date(),
      createdAt: new Date(),
    };

    const user = await databaseAdapter.create<FirestoreUser>(COLLECTIONS.USERS, email, userData);

    // Process sponsor messages for new user (fire and forget - don't fail registration)
    try {
      await sponsorService.processSponsorMessages(email, true);
    } catch (error) {
      // Log error but don't fail registration
      console.error('Failed to process sponsor messages for new user:', error);
    }

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
    const user = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email);

    if (!user) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);

    if (!isPasswordValid) {
      throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Update last seen and online status
    const updatedUser = await databaseAdapter.update<FirestoreUser>(COLLECTIONS.USERS, email, {
      lastSeen: new Date(),
      isOnline: true,
    });

    // Generate token
    const token = generateToken(email);

    // Return user without password
    const { hashedPassword: _, ...userWithoutPassword } = updatedUser;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async getUserProfile(email: string): Promise<Omit<FirestoreUser, 'hashedPassword'>> {
    const user = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email);

    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const { hashedPassword: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateOnlineStatus(email: string, isOnline: boolean): Promise<Omit<FirestoreUser, 'hashedPassword'>> {
    const user = await databaseAdapter.findById<FirestoreUser>(COLLECTIONS.USERS, email);

    if (!user) {
      throw new HttpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const updatedUser = await databaseAdapter.update<FirestoreUser>(COLLECTIONS.USERS, email, {
      isOnline,
      lastSeen: new Date(),
    });

    const { hashedPassword: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }
}

export const authService = new AuthServiceFirestore(); 