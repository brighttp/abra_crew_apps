import { z } from 'zod';
export const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const text = z.string().trim().min(1).max(200);
export const password = z
  .string()
  .min(8)
  .max(72)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes');
export const username = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[a-zA-Z0-9_.-]+$/);
export const email = z
  .union([z.email().max(254), z.literal(''), z.null()])
  .optional()
  .transform((v) => v || null);
export const crew = z.object({
  full_name: text,
  username,
  password,
  email,
  phone: z.string().trim().max(40).optional(),
});
export const profile = z.object({
  full_name: text,
  email,
  phone: z.string().trim().max(40).optional(),
});
export const event = z
  .object({
    name: text,
    client_name: z.string().trim().max(200).default(''),
    location: text,
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    description: z.string().max(10000).default(''),
    status: z.enum(['DRAFT', 'UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED']).default('DRAFT'),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: 'End date must not precede start date',
    path: ['end_date'],
  });
export const registration = z.object({
  is_enabled: z.boolean(),
  deadline: z.iso.datetime().nullable().optional(),
  quota: z.number().int().positive().nullable().optional(),
  public_description: z.string().max(10000).default(''),
  instructions: z.string().max(5000).default(''),
  show_client: z.boolean().default(false),
  show_slots: z.boolean().default(true),
});
export const scoring = z.object({
  scores: z
    .array(z.object({ event_criterion_id: id, score: z.number().int().min(1).max(5) }))
    .min(1)
    .max(100),
  feedback: z.string().max(5000).default(''),
});
export const criterion = z.object({
  name: text,
  description: z.string().max(2000).default(''),
  is_active: z.boolean().default(true),
});
export const parse = (schema, value) => schema.parse(value);
export { z };
