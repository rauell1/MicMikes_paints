import { z } from 'zod'

// ===========================================
// HELPER: Kenyan Phone Number Validation
// Accepts:
//   +2547XXXXXXXX  (international, 13 chars)
//   07XXXXXXXX     (local, 10 digits)
//   2547XXXXXXXX   (without +, 12 digits)
// Kenyan mobile prefixes: 070x, 071x, 072x, 074x, 075x, 076x, 077x, 078x, 079x
// ===========================================
const KENYAN_MOBILE_PREFIXES = ['70', '71', '72', '74', '75', '76', '77', '78', '79']

const validateKenyanPhone = (phone: string): boolean => {
  const digits = phone.replace(/[\s\-\(\)]/g, '')

  // +2547XXXXXXXX → strip + → 2547XXXXXXXX
  const normalized = digits.startsWith('+') ? digits.slice(1) : digits

  if (normalized.startsWith('254')) {
    // 2547XXXXXXXX — 12 digits
    if (normalized.length !== 12) return false
    const prefix = normalized.slice(3, 5) // '7X'
    return prefix.startsWith('7') && KENYAN_MOBILE_PREFIXES.includes(prefix)
  } else if (normalized.startsWith('0')) {
    // 07XXXXXXXX — 10 digits
    if (normalized.length !== 10) return false
    const prefix = normalized.slice(1, 3) // '7X'
    return prefix.startsWith('7') && KENYAN_MOBILE_PREFIXES.includes(prefix)
  } else if (normalized.startsWith('7')) {
    // 7XXXXXXXX — 9 digits (missing leading 0)
    if (normalized.length !== 9) return false
    const prefix = normalized.slice(0, 2)
    return KENYAN_MOBILE_PREFIXES.includes(prefix)
  }

  return false
}

// Normalise any valid Kenyan phone to 2547XXXXXXXX for storage
export const normaliseKenyanPhone = (phone: string): string => {
  const digits = phone.replace(/[\s\-\(\)\+]/g, '')
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return '254' + digits.slice(1)
  if (digits.startsWith('7')) return '254' + digits
  return digits
}

// ===========================================
// ENQUIRY / CONTACT FORM SCHEMA
// ===========================================
export const enquiryFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name can only contain letters, spaces, hyphens, apostrophes and dots'),

  email: z
    .string()
    .email('Please enter a valid email address')
    .max(254, 'Email must be less than 254 characters')
    .toLowerCase(),

  phone: z
    .string()
    .min(9, 'Phone number is too short')
    .max(15, 'Phone number is too long')
    .refine(validateKenyanPhone, {
      message: 'Please enter a valid Kenyan mobile number (e.g. 0712 345678 or +254712345678)',
    }),

  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must be less than 2000 characters'),

  agreedToTerms: z
    .boolean()
    .refine(val => val === true, 'You must agree to the terms and privacy policy'),
})

export type EnquiryFormData = z.infer<typeof enquiryFormSchema>

// ===========================================
// ORDER FORM SCHEMA
// ===========================================
export const orderFormSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name is too long'),

  email: z
    .string()
    .email('Please enter a valid email address')
    .max(254, 'Email is too long')
    .toLowerCase(),

  phone: z
    .string()
    .min(9, 'Phone number is too short')
    .max(15, 'Phone number is too long')
    .refine(validateKenyanPhone, {
      message: 'Please enter a valid Kenyan mobile number (e.g. 0712 345678 or +254712345678)',
    }),

  county: z
    .string()
    .min(2, 'County is required')
    .max(200, 'County name is too long'),

  town: z
    .string()
    .min(2, 'Town is required')
    .max(200, 'Town name is too long'),

  address: z
    .string()
    .min(5, 'Address is required')
    .max(200, 'Address is too long'),

  items: z
    .array(
      z.object({
        productSlug: z.string().min(1).max(100),
        colourId:    z.string().max(100).nullable().optional(),
        size:        z.string().min(1).max(50),
        finish:      z.string().max(30).optional(),
        quantity:    z.number().int().min(1).max(50),
      })
    )
    .min(1, 'At least one item is required')
    .max(30, 'Too many items in order'),
})

export type OrderFormData = z.infer<typeof orderFormSchema>

// ===========================================
// NEWSLETTER SCHEMA
// ===========================================
export const newsletterSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(254, 'Email must be less than 254 characters')
    .toLowerCase(),
})

export type NewsletterData = z.infer<typeof newsletterSchema>

// ===========================================
// HELPERS
// ===========================================
export const getFirstError = (error: z.ZodError): string =>
  error.issues[0]?.message || 'Validation failed'

export const getFieldErrors = (error: z.ZodError): Record<string, string> => {
  const errors: Record<string, string> = {}
  error.issues.forEach((err: z.ZodIssue) => {
    const path = err.path.join('.')
    if (!errors[path]) errors[path] = err.message
  })
  return errors
}
