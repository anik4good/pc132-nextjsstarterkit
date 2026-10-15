import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CompanySchema = z.object({
  name: z
    .string()
    .nonempty({ message: 'Company name is required.' })
    .min(2, { message: 'Name must be at least 2 characters long.' })
    .max(80, { message: 'Name must not exceed 80 characters.' }),
  slug: z
    .string()
    .nonempty({ message: 'Slug is required.' })
    .min(2, { message: 'Slug must be at least 2 characters long.' })
    .max(50, { message: 'Slug must not exceed 50 characters.' })
    .regex(slugRegex, {
      message: 'Use kebab-case: lowercase letters, numbers and dashes.',
    }),
  description: z
    .string()
    .max(255, { message: 'Description must not exceed 255 characters.' })
    .optional(),
  email: z
    .string()
    .email({ message: 'Please enter a valid email address.' })
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .max(30, { message: 'Phone must not exceed 30 characters.' })
    .optional()
    .or(z.literal('')),
  website: z
    .string()
    .max(255, { message: 'Website must not exceed 255 characters.' })
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export type CompanySchemaType = z.infer<typeof CompanySchema>;
