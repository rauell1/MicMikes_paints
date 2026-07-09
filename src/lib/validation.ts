import { z } from 'zod'

// ===========================================
// HELPER: Kenyan Phone Number Validation
// ===========================================
const KENYAN_MOBILE_PREFIXES = ['70', '71', '72', '74', '75', '76', '77', '78', '79']

const validateKenyanPhone = (phone: string): boolean => {
  const digits = phone.replace(/[\s\-\(\)]/g, '')
  const normalized = digits.startsWith('+') ? digits.slice(1) : digits
  if (normalized.startsWith('254')) {
    if (normalized.length !== 12) return false
    const prefix = normalized.slice(3, 5)
    return prefix.startsWith('7') && KENYAN_MOBILE_PREFIXES.includes(prefix)
  } else if (normalized.startsWith('0')) {
    if (normalized.length !== 10) return false
    const prefix = normalized.slice(1, 3)
    return prefix.startsWith('7') && KENYAN_MOBILE_PREFIXES.includes(prefix)
  } else if (normalized.startsWith('7')) {
    if (normalized.length !== 9) return false
    const prefix = normalized.slice(0, 2)
    return KENYAN_MOBILE_PREFIXES.includes(prefix)
  }
  return false
}

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
  name: z.string().min(2).max(100).regex(/^[a-zA-Z\s\-'\.]+$/),
  email: z.string().email().max(254).toLowerCase(),
  phone: z.string().min(9).max(15).refine(validateKenyanPhone, {
    message: 'Please enter a valid Kenyan mobile number (e.g. 0712 345678 or +254712345678)',
  }),
  message: z.string().min(10).max(2000),
  agreedToTerms: z.boolean().refine(val => val === true, 'You must agree to the terms and privacy policy'),
})
export type EnquiryFormData = z.infer<typeof enquiryFormSchema>

// ===========================================
// ORDER FORM SCHEMA
// ===========================================
export const orderFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200),

  email: z.string().email('Please enter a valid email address').max(254).toLowerCase(),

  phone: z.string().min(9, 'Phone number is too short').max(15)
    .refine(validateKenyanPhone, {
      message: 'Please enter a valid Kenyan mobile number (e.g. 0712 345678 or +254712345678)',
    }),

  county: z.string().min(2, 'County is required').max(200),
  town:   z.string().max(200).optional().nullable(),
  address: z.string().min(2, 'Address is required').max(200),

  // optional extras from the checkout form
  notes:     z.string().max(500).optional(),
  payMethod: z.enum(['mpesa', 'card']).optional(),
  latitude:  z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),

  agreedToTerms: z.boolean().refine(val => val === true, 'You must agree to the terms of service and privacy policy to proceed'),
  marketingOptIn: z.boolean().optional(),
  analyticsConsent: z.boolean().optional(),

  items: z.array(
    z.object({
      productSlug: z.string().min(1).max(100),
      colourId:    z.string().max(100).nullable().optional(),
      size:        z.string().min(1).max(50),
      finish:      z.string().max(30).optional(),
      quantity:    z.number().int().min(1).max(50),
    })
  ).min(1, 'At least one item is required').max(30),
})
export type OrderFormData = z.infer<typeof orderFormSchema>

// ===========================================
// NEWSLETTER SCHEMA
// ===========================================
export const newsletterSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
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
