/**
 * Tests for validation schemas
 * Example test file demonstrating validation testing patterns
 */

import { describe, it, expect } from 'vitest';
import {
  CreateCaseSchema,
  CreateClientSchema,
  InviteUserSchema,
  validate,
} from '../schemas';

describe('CreateCaseSchema', () => {
  it('should validate a valid case', () => {
    const validCase = {
      title: 'Test Case',
      description: 'Test description',
      status: 'open' as const,
      priority: 'high' as const,
    };

    const result = validate(CreateCaseSchema, validCase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Test Case');
    }
  });

  it('should reject empty title', () => {
    const invalidCase = {
      title: '',
      description: 'Test description',
    };

    const result = validate(CreateCaseSchema, invalidCase);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain('title');
    }
  });

  it('should reject invalid status', () => {
    const invalidCase = {
      title: 'Test Case',
      status: 'invalid_status',
    };

    const result = validate(CreateCaseSchema, invalidCase);
    expect(result.success).toBe(false);
  });
});

describe('CreateClientSchema', () => {
  it('should validate a valid client', () => {
    const validClient = {
      name: 'Test Client',
      email: 'test@example.com',
      phone: '123-456-7890',
    };

    const result = validate(CreateClientSchema, validClient);
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const invalidClient = {
      name: 'Test Client',
      email: 'invalid-email',
    };

    const result = validate(CreateClientSchema, invalidClient);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain('email');
    }
  });
});

describe('InviteUserSchema', () => {
  it('should validate a valid invitation', () => {
    const validInvite = {
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'user',
    };

    const result = validate(InviteUserSchema, validInvite);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const invalidInvite = {
      email: 'user@example.com',
      // Missing firstName and lastName
    };

    const result = validate(InviteUserSchema, invalidInvite);
    expect(result.success).toBe(false);
  });
});

