import { createHash } from 'crypto';

// Time utilities
export const toUTC = (date: Date): Date => {
  return new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
};

export const toISOString = (date: Date): string => {
  return date.toISOString();
};

export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

export const parseDate = (dateString: string): Date => {
  return new Date(dateString + 'T00:00:00.000Z');
};

export const getDayStart = (date: Date): Date => {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
};

export const getDayEnd = (date: Date): Date => {
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  return dayEnd;
};

export const getHourStart = (date: Date): Date => {
  const hourStart = new Date(date);
  hourStart.setUTCMinutes(0, 0, 0);
  return hourStart;
};

// Hashing utilities
export const sha256 = (data: string): string => {
  return createHash('sha256').update(data).digest('hex');
};

export const sha256Hex = (data: string): string => {
  return '0x' + sha256(data);
};

// Math utilities
export const roundToPrecision = (value: number, precision: number): number => {
  return Number(value.toFixed(precision));
};

export const sum = (values: number[]): number => {
  return values.reduce((acc, val) => acc + val, 0);
};

export const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
};

export const max = (values: number[]): number => {
  return Math.max(...values);
};

// Validation utilities
export const isValidDate = (date: unknown): date is Date => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && isFinite(value);
};

export const isValidString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};

// Error handling
export class OracleError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'OracleError';
  }
}

export const createError = (message: string, code: string, statusCode: number = 500): OracleError => {
  return new OracleError(message, statusCode, code);
};

// Request ID generation
export const generateRequestId = (): string => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// Retry utility with exponential backoff
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};
