import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import type { MetricsOverview } from '@/src/composables/useAdminMetrics'
import type { GuestChannelOverview, LimitGroup } from '@/src/composables/useAdminCosts'

/**
 * Pagina «Costi e limiti» del pannello admin (O1.5).
 *
 * Cosa difendono questi test: che il pannello **dica forte** le cose che costano — una stima
 * oltre la soglia, un indice che non risponde, contatori degli ospiti che non sono un tetto
 * vero — e che l'interruttore del canale ospiti non si possa chiudere senza un motivo.
 */

const GB = 1024 ** 3

const { overview, limits, guest, setGuestChannel } = vi.hoisted(() => ({
  overview: { value: null as unknown },
  limits: { value: [] as unknown[] },
  guest: { value: null as unknown },
  setGuestChannel: vi.fn(async () => true),
}))

vi.mock('@/src/composables/useAdminMetrics', () => ({
  useAdminMetrics: () => ({
    overview: ref(overview.value),
    isLoadingOverview: ref(false),
    loadOverview: vi.fn(async () => {}),
    loadTimeseries: vi.fn(async () => null),
  }),
}))
vi.mock('@/src/composables/useAdminCosts', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/src/composables/useAdminCosts')>()
  return {
    ...original,
    useAdminCosts: () => ({
      limits: ref(limits.value),
      guest: ref(guest.value),
      isSwitching: ref(false),
      loadLimits: vi.fn(async () => {}),
      loadGuestChannel: vi.fn(async () => {}),
      setGuestChannel,
    }),
  }
})

import AdminCostsPage from './AdminCostsPage.vue'

const stubs = {
  Button: {
    props: ['label', 'disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
  InputText: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input class="reason" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}

function makeOverview(partial: Partial<MetricsOverview> = {}): MetricsOverview {
  return {
    day: '2026-10-04', at: '2026-10-04T12:00:00Z', users: 3, activeUsers30d: 2, trackedUsers: 3,
    storedBytes: 12 * GB, monthlyBytes: 4 * GB, plans: { free: 2, pro: 1 }, paidPlans: 1, grantedPlans: 0,
    expiredGrants: 0, guestLinks: 1, accountLinks: 2, claims: 0, openReports: 0, quarantinedLinks: 0, claimRate: 0,
    freeBytes: 2 * GB, freeExpiring: [{ day: '2026-10-11', bytes: 2 * GB }], guestBytes: GB,
    storageBands: [{ label: '0', users: 1 }], nearQuota: 1, cognitoTier: 'ESSENTIALS', monthlyPayers: 1, yearlyPayers: 0,
    estimatedCostUsd: 8.4,
    costs: {
      lines: [{ key: 'fly', label: 'Fly · server API', usd: 8.4, note: 'tetto' }],
      totalUsd: 8.4,
      alert: { thresholdUsd: 20, ratio: 0.42, level: 'ok' },
      revenue: { revenueEur: 9, stripeFeesEur: 0.45, marginEur: 0.77 },
      monthProgress: 0.13,
      pricesCheckedOn: '2026-10-03',
    },
    guest: null,
    indexFallbacks: [],
    ...partial,
  }
}

const guestOpen: GuestChannelOverview = {
  day: '2026-10-04', usedBytesToday: 50 * GB, maxBytesPerDay: 200 * GB, maxBytesPerIpPerDay: 10 * GB, persistent: true,
  channel: { closed: false, reason: null, at: null, by: null },
}

const limitGroups: LimitGroup[] = [
  { key: 'guest', label: 'Invii senza account', items: [{ key: 'guest.bytesPerIp', label: 'Volume al giorno per IP', value: 10 * GB, unit: 'bytes', env: 'GUEST_MAX_GB_PER_IP_PER_DAY', note: null }] },
]

async function mountPage() {
  const wrapper = mount(AdminCostsPage, { global: { stubs } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  overview.value = makeOverview()
  limits.value = limitGroups
  guest.value = guestOpen
  setGuestChannel.mockClear()
})

describe('AdminCostsPage', () => {
  it('sotto la soglia lo dice piano; oltre, lo dice forte', async () => {
    expect((await mountPage()).get('[data-testid="cost-alert"]').text()).toContain('Sotto la soglia')

    const over = makeOverview()
    over.costs.alert = { thresholdUsd: 20, ratio: 1.3, level: 'over' }
    overview.value = over
    expect((await mountPage()).get('[data-testid="cost-alert"]').text()).toContain('supera la soglia di $20')
  })

  it('un indice che non risponde si vede, con quante volte', async () => {
    overview.value = makeOverview({
      indexFallbacks: [{ index: 'S3KeyIndex', table: 'SharedLinks', count: 42, firstAt: '2026-10-04T10:00:00Z', lastAt: '2026-10-04T11:00:00Z', lastError: 'ValidationException' }],
    })

    const text = (await mountPage()).get('[data-testid="index-fallbacks"]').text()
    expect(text).toContain('S3KeyIndex su SharedLinks · 42 volte')
  })

  it('il canale ospiti non si chiude senza un motivo', async () => {
    const wrapper = await mountPage()
    const close = wrapper.findAll('button').find((b) => b.text() === 'Chiudi gli invii senza account')!

    expect(close.attributes('disabled')).toBeDefined()
    await wrapper.get('input.reason').setValue('ondata di spam')
    await close.trigger('click')

    expect(setGuestChannel).toHaveBeenCalledWith(true, 'ondata di spam')
  })

  it('avvisa quando i contatori degli ospiti non sono un tetto vero', async () => {
    guest.value = { ...guestOpen, persistent: false }

    expect((await mountPage()).get('[data-testid="guest-channel"]').text()).toContain('si azzerano a ogni deploy')
  })

  it('mostra i limiti con il valore leggibile e la variabile che li cambia', async () => {
    const text = (await mountPage()).get('[data-testid="limits"]').text()

    expect(text).toContain('Volume al giorno per IP')
    expect(text).toContain('10')
    expect(text).toContain('GUEST_MAX_GB_PER_IP_PER_DAY')
  })
})
