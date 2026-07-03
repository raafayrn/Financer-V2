import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../env';

export interface TokenPayload {
  userId: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string' || !decoded || typeof decoded.userId !== 'string') {
    throw new Error('Token inválido');
  }
  return { userId: decoded.userId };
}
