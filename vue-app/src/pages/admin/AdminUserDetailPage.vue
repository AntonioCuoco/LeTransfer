<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import { useAdminUsers, PLAN_GRANT_DAYS, type PlanGrantDays } from '@/src/composables/useAdminUsers'
import { formatBytes } from '@/src/types/plan'

/**
 * La scheda utente — risponde a «perché questo non riesce a caricare?» in tre secondi:
 * piano, quota, volume e stato uno sotto l'altro, non da dedurre. È il 90% dell'uso reale
 * del pannello, secondo il work order che l'ha commissionata.
 */

const route = useRoute()
const router = useRouter()
const userId = String(route.params.userId)

const { detail, userAudit, isLoading, isActing, loadDetail, suspend, unsuspend, scheduleDeletion, cancelDeletion, grantPlan, revokePlan } =
  useAdminUsers()
const confirm = useConfirm()

onMounted(() => { void loadDetail(userId) })

const storedPercent = computed(() => {
  const d = detail.value
  if (!d?.usage.tracked || !d.limits.maxStoredBytes) return null
  return Math.min(100, Math.round((d.usage.storedBytes / d.limits.maxStoredBytes) * 100))
})
const monthlyPercent = computed(() => {
  const d = detail.value
  if (!d?.usage.tracked || !d.limits.maxMonthlyBytes) return null
  return Math.min(100, Math.round((d.usage.monthlyBytes / d.limits.maxMonthlyBytes) * 100))
})

const planSourceLabel = computed(() => {
  switch (detail.value?.plan.source) {
    case 'stripe': return 'cliente pagante'
    case 'admin': return 'regalato da admin'
    case 'admin_revoked': return 'regalo revocato'
    default: return null
  }
})

// ── Dialoghi con motivo obbligatorio ─────────────────────────────────────────────
type ReasonAction = 'suspend' | 'unsuspend' | 'schedule-deletion' | 'cancel-deletion' | 'revoke-plan'
const reasonOpen = ref(false)
const reasonAction = ref<ReasonAction | null>(null)
const reasonText = ref('')

function openReason(action: ReasonAction) {
  reasonAction.value = action
  reasonText.value = ''
  reasonOpen.value = true
}

async function refresh() {
  await loadDetail(userId)
}

async function submitReason() {
  const reason = reasonText.value.trim()
  if (!reason) return
  const action = reasonAction.value

  const run: Record<ReasonAction, () => Promise<unknown>> = {
    suspend: () => suspend(userId, reason),
    unsuspend: () => unsuspend(userId, reason),
    'schedule-deletion': () => scheduleDeletion(userId, reason),
    'cancel-deletion': () => cancelDeletion(userId, reason),
    'revoke-plan': () => revokePlan(userId, reason),
  }

  // La sospensione blocca subito accesso e link: la si fa confermare come le altre azioni
  // difficili da annullare in fretta, non perché sia irreversibile — unsuspend esiste.
  if (action === 'suspend') {
    confirm.require({
      message: `L'accesso di questo utente verrà bloccato subito, e ogni suo link condiviso revocato. Motivo: «${reason}».`,
      header: 'Conferma sospensione',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sospendi',
      rejectLabel: 'Annulla',
      acceptClass: 'p-button-danger',
      accept: async () => {
        if (action && (await run[action]())) { reasonOpen.value = false; await refresh() }
      },
    })
    return
  }

  if (action && (await run[action]())) {
    reasonOpen.value = false
    await refresh()
  }
}

// ── Piano regalato ────────────────────────────────────────────────────────────────
const grantOpen = ref(false)
const grantPlanId = ref('pro')
const grantDays = ref<PlanGrantDays>(30)
const grantReason = ref('')

async function submitGrant() {
  if (!grantReason.value.trim()) return
  if (await grantPlan(userId, grantPlanId.value, grantDays.value, grantReason.value.trim())) {
    grantOpen.value = false
    grantReason.value = ''
    await refresh()
  }
}
</script>

<template>
  <div v-if="isLoading && !detail" class="text-sm text-haze-400">Carico…</div>

  <div v-else-if="!detail" class="text-sm text-haze-400">Utente non trovato.</div>

  <div v-else class="flex flex-col gap-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <button type="button" class="mb-2 text-xs text-haze-500 hover:text-haze-300" @click="router.push('/admin/utenti')">
          ← Utenti
        </button>
        <h1 class="m-0 text-xl font-semibold text-haze-100">{{ detail.profile.email || userId }}</h1>
        <p class="m-0 mt-1 font-mono text-xs text-haze-500">{{ userId }}</p>
      </div>
      <div class="flex gap-1.5">
        <Tag v-if="detail.state.suspended" value="sospeso" severity="danger" />
        <Tag v-if="detail.state.deletionScheduledAt" value="in cancellazione" severity="warn" />
        <Tag v-if="detail.profile.mfaEnabled === true" value="2FA attiva" severity="success" />
        <Tag v-if="detail.profile.mfaEnabled === false" value="senza 2FA" severity="secondary" />
      </div>
    </header>

    <!-- Avvisi di stato -->
    <div v-if="detail.state.deletionScheduledAt" class="rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4">
      <p class="m-0 text-sm font-semibold text-haze-100">
        Cancellazione programmata per il {{ new Date(detail.state.deletionScheduledAt).toLocaleDateString('it-IT') }}
      </p>
      <p class="m-0 mt-1 text-xs text-haze-300">
        Motivo: {{ detail.state.deletionReason || '—' }}. L'utente può ancora accedere in
        sola lettura ed esportare; i suoi link restano attivi fino ad allora.
      </p>
      <Button label="Annulla cancellazione" size="small" text class="mt-2" :loading="isActing" @click="openReason('cancel-deletion')" />
    </div>

    <div v-if="detail.state.suspended" class="rounded-well border border-crit-200 bg-crit-100/10 p-4">
      <p class="m-0 text-sm font-semibold text-haze-100">Account sospeso</p>
      <p class="m-0 mt-1 text-xs text-haze-300">Motivo: {{ detail.state.suspendReason || '—' }}</p>
      <Button label="Revoca sospensione" size="small" text class="mt-2" :loading="isActing" @click="openReason('unsuspend')" />
      <p class="m-0 mt-1 text-[0.7rem] text-haze-500">
        I link revocati durante la sospensione restano revocati anche dopo.
      </p>
    </div>

    <!-- Diagnostica -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Piano</h2>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt class="text-haze-500">Piano</dt>
          <dd class="m-0 text-haze-100">{{ detail.plan.plan }}</dd>
          <template v-if="planSourceLabel">
            <dt class="text-haze-500">Origine</dt>
            <dd class="m-0 text-haze-100">{{ planSourceLabel }}</dd>
          </template>
          <template v-if="detail.plan.expiresAt">
            <dt class="text-haze-500">Scade il</dt>
            <dd class="m-0 text-haze-100">{{ new Date(detail.plan.expiresAt).toLocaleDateString('it-IT') }}</dd>
          </template>
          <template v-if="detail.plan.reason">
            <dt class="text-haze-500">Motivo</dt>
            <dd class="m-0 text-haze-400">{{ detail.plan.reason }}</dd>
          </template>
        </dl>
        <div class="mt-3 flex gap-2">
          <Button label="Regala piano" size="small" outlined @click="grantOpen = true" />
          <Button
            v-if="detail.plan.source === 'admin'"
            label="Togli regalo"
            size="small"
            text
            severity="danger"
            @click="openReason('revoke-plan')"
          />
        </div>
      </section>

      <section class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Spazio e volume</h2>
        <template v-if="!detail.usage.tracked">
          <p class="m-0 text-sm text-haze-500">Conteggio non disponibile.</p>
        </template>
        <template v-else>
          <div class="mb-3">
            <div class="mb-1 flex justify-between text-xs text-haze-400">
              <span>Archiviato</span>
              <span class="font-mono">{{ formatBytes(detail.usage.storedBytes) }} / {{ detail.limits.maxStoredBytes ? formatBytes(detail.limits.maxStoredBytes) : '—' }}</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-brand-500" :style="{ width: `${storedPercent ?? 0}%` }" />
            </div>
          </div>
          <div>
            <div class="mb-1 flex justify-between text-xs text-haze-400">
              <span>Questo mese</span>
              <span class="font-mono">{{ formatBytes(detail.usage.monthlyBytes) }} / {{ detail.limits.maxMonthlyBytes ? formatBytes(detail.limits.maxMonthlyBytes) : '—' }}</span>
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full bg-brand-500" :style="{ width: `${monthlyPercent ?? 0}%` }" />
            </div>
          </div>
        </template>
      </section>

      <section class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Attività</h2>
        <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt class="text-haze-500">Iscritto il</dt>
          <dd class="m-0 text-haze-100">{{ detail.profile.createdAt ? new Date(detail.profile.createdAt).toLocaleDateString('it-IT') : '—' }}</dd>
          <dt class="text-haze-500">Ultima attività</dt>
          <dd class="m-0 text-haze-100">{{ detail.profile.lastActivityAt ? new Date(detail.profile.lastActivityAt).toLocaleDateString('it-IT') : '—' }}</dd>
          <dt class="text-haze-500">File</dt>
          <dd class="m-0 text-haze-100">{{ detail.counts.files ?? '—' }}</dd>
          <dt class="text-haze-500">Link</dt>
          <dd class="m-0 text-haze-100">{{ detail.counts.activeLinks }} attivi di {{ detail.counts.links }}</dd>
          <dt class="text-haze-500">Richieste file</dt>
          <dd class="m-0 text-haze-100">{{ detail.counts.requests }}</dd>
        </dl>
      </section>

      <section class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Moderazione</h2>
        <p class="m-0 text-sm" :class="detail.moderation.openReports > 0 ? 'text-warn-400' : 'text-haze-400'">
          {{ detail.moderation.openReports }} segnalazioni aperte sui suoi link
        </p>
      </section>
    </div>

    <!-- Azioni -->
    <section class="rounded-well border border-white/10 bg-white/[0.03] p-4">
      <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Azioni</h2>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="!detail.state.suspended"
          label="Sospendi"
          icon="pi pi-ban"
          size="small"
          severity="danger"
          outlined
          @click="openReason('suspend')"
        />
        <Button
          v-if="!detail.state.deletionScheduledAt"
          label="Programma cancellazione"
          icon="pi pi-calendar-times"
          size="small"
          outlined
          @click="openReason('schedule-deletion')"
        />
      </div>
    </section>

    <!-- Registro delle azioni su questo utente -->
    <section>
      <h2 class="m-0 mb-3 text-sm font-semibold text-haze-200">Registro</h2>
      <p v-if="userAudit.length === 0" class="text-sm text-haze-500">Nessuna azione amministrativa registrata.</p>
      <ul v-else class="m-0 flex flex-col gap-2 p-0">
        <li v-for="entry in userAudit" :key="entry.id" class="rounded-field border border-white/10 bg-white/[0.02] p-3 text-xs">
          <span class="font-mono text-haze-400">{{ new Date(entry.at).toLocaleString('it-IT') }}</span>
          <span class="ml-2 text-haze-100">{{ entry.action }}</span>
          <span class="ml-2 text-haze-500">{{ entry.adminEmail || entry.adminId }}</span>
          <p v-if="entry.detail?.reason" class="m-0 mt-1 text-haze-400">{{ entry.detail.reason }}</p>
        </li>
      </ul>
    </section>

    <!-- Motivo obbligatorio -->
    <Dialog v-model:visible="reasonOpen" modal header="Motivo" :style="{ width: 'min(440px, 94vw)' }">
      <Textarea v-model="reasonText" rows="3" auto-resize fluid placeholder="Perché questa azione…" />
      <template #footer>
        <Button label="Annulla" text @click="reasonOpen = false" />
        <Button label="Conferma" :disabled="!reasonText.trim()" :loading="isActing" @click="submitReason" />
      </template>
    </Dialog>

    <!-- Regalo piano -->
    <Dialog v-model:visible="grantOpen" modal header="Regala un piano" :style="{ width: 'min(440px, 94vw)' }">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <Select v-model="grantPlanId" :options="['pro']" fluid />
          <Select v-model="grantDays" :options="[...PLAN_GRANT_DAYS]" fluid />
        </div>
        <Textarea v-model="grantReason" rows="2" auto-resize fluid placeholder="Motivo (es. «prova 90 giorni»)…" />
        <p class="m-0 text-xs text-haze-500">Torna a Free da solo alla scadenza.</p>
      </div>
      <template #footer>
        <Button label="Annulla" text @click="grantOpen = false" />
        <Button label="Regala" :disabled="!grantReason.trim()" :loading="isActing" @click="submitGrant" />
      </template>
    </Dialog>

  </div>
</template>
