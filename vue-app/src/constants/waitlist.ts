import type { WaitlistRole } from '@/src/types/waitlist'

export interface RoleOption {
  value: WaitlistRole
  label: string
  icon: string
}

export interface BenefitData {
  icon: string
  title: string
  description: string
}

export interface WaitlistRoleOption extends RoleOption {
  value: WaitlistRole
}

export const WAITLIST_ROLE_OPTIONS: readonly WaitlistRoleOption[] = [
  { value: 'developer', label: 'Developer', icon: '💻' },
  { value: 'creative', label: 'Creative', icon: '🎨' },
  { value: 'founder', label: 'Founder', icon: '👥' },
  { value: 'other', label: 'Other', icon: '✨' },
] as const

export const WAITLIST_BENEFITS: readonly BenefitData[] = [
  { icon: '🎁', title: 'Accesso Anticipato', description: 'Prova le nuove feature prima di tutti' },
  { icon: '💰', title: 'Prezzo Speciale', description: 'Sconto lifetime per i primi 500 iscritti' },
  { icon: '🗣️', title: 'Voce in Capitolo', description: 'Influenza lo sviluppo con il tuo feedback' },
] as const

export const WAITLIST_SOCIAL_PROOF = {
  avatars: ['🧑‍💻', '👩‍🎨', '👨‍💼', '👩‍💻'],
  count: '500+',
  countLabel: 'già in lista',
  statusText: 'Lancio previsto Q2 2026',
} as const
