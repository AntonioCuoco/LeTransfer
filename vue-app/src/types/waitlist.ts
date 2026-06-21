export type WaitlistRole = 'developer' | 'creative' | 'founder' | 'other'

export interface WaitlistFormData {
  firstName: string
  lastName: string
  email: string
  role: WaitlistRole
  companyName?: string
}
