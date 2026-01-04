/**
 * Zod validation schemas for form inputs and API requests
 * Provides type-safe validation across the application
 */

import { z } from 'zod';

// Case/Matter schemas
export const CreateCaseSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  description: z.string().optional(),
  case_number: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'closed', 'pending']).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid('Invalid user ID').optional().nullable(),
  court: z.string().optional(),
  next_hearing_date: z.string().optional().nullable(),
  client_id: z.string().uuid('Invalid client ID').optional().nullable(),
  case_type_id: z.string().uuid('Invalid case type ID').optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateCaseSchema = CreateCaseSchema.partial().extend({
  id: z.string().uuid('Invalid case ID'),
});

// Client schemas
export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  company: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
});

export const UpdateClientSchema = CreateClientSchema.partial().extend({
  id: z.string().uuid('Invalid client ID'),
});

// Document schemas
export const CreateDocumentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  content: z.string().optional(),
  summary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  effective_date: z.string().optional().nullable(),
  renewal_date: z.string().optional().nullable(),
  termination_date: z.string().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  contract_type: z.string().optional(),
  currency: z.string().length(3).optional(),
  terms: z.string().optional(),
  file_path: z.string().optional().nullable(),
  file_size: z.number().nonnegative().optional().nullable(),
  mime_type: z.string().optional().nullable(),
  case_id: z.string().uuid().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
});

export const UpdateDocumentSchema = CreateDocumentSchema.partial().extend({
  id: z.string().uuid('Invalid document ID'),
});

// Contract schemas
export const CreateContractSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  content: z.string().optional(),
  summary: z.string().optional(),
  status: z.enum(['draft', 'pending', 'active', 'expired', 'terminated']).optional(),
  contract_type: z.string().optional(),
  effective_date: z.string().optional().nullable(),
  renewal_date: z.string().optional().nullable(),
  termination_date: z.string().optional().nullable(),
  value: z.number().nonnegative().optional().nullable(),
  currency: z.string().length(3).optional(),
  terms: z.string().optional(),
  client_id: z.string().uuid().optional().nullable(),
  case_id: z.string().uuid().optional().nullable(),
});

export const UpdateContractSchema = CreateContractSchema.partial().extend({
  id: z.string().uuid('Invalid contract ID'),
});

// User/Profile schemas
export const UpdateProfileSchema = z.object({
  first_name: z.string().max(100).optional().nullable(),
  last_name: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
});

// Invitation schemas
export const InviteUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.string().optional(),
  roleId: z.string().uuid().optional(),
  department: z.string().optional(),
});

// Query parameter schemas
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
});

export const FilterSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

// Export types
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
export type UpdateCaseInput = z.infer<typeof UpdateCaseSchema>;
export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
export type CreateDocumentInput = z.infer<typeof CreateDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof UpdateDocumentSchema>;
export type CreateContractInput = z.infer<typeof CreateContractSchema>;
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type FilterInput = z.infer<typeof FilterSchema>;

