<script setup lang="ts">
/**
 * Le figure degli articoli di aiuto: le finestre di Windows da toccare, disegnate. Sono le stesse
 * della guida di Nearby nell'app desktop (`novren-desk/src/components/NearbyHelpArt.vue`): chi
 * passa dall'app al sito ritrova le stesse immagini. Se cambiano lì, vanno copiate qui.
 */
import type { HelpFigureId } from '@/src/content/help'

defineProps<{ figure: HelpFigureId }>()
</script>

<template>
    <div class="art-wrap">
    <!-- Impostazioni → Rete e Internet → Tipo di profilo di rete: Privata -->
    <svg v-if="figure === 'nearby-private'" viewBox="0 0 420 260" role="img" aria-label="Impostazioni di Windows: tipo di profilo di rete impostato su Privata">
      <rect x="10" y="10" width="400" height="240" rx="14" fill="#fff" stroke="#e1dfea" />
      <rect x="10" y="10" width="400" height="34" rx="14" fill="#f3f2f8" />
      <rect x="10" y="30" width="400" height="14" fill="#f3f2f8" />
      <text x="28" y="32" font-size="12" font-weight="600" fill="#4a4560">Impostazioni</text>
      <text x="28" y="70" font-size="15" font-weight="700" fill="#17142a">Rete e Internet › Wi-Fi › CasaRossi</text>
      <text x="28" y="98" font-size="12" font-weight="700" fill="#4a4560">Tipo di profilo di rete</text>
      <rect x="28" y="110" width="364" height="48" rx="10" fill="#f8f7fb" stroke="#e6e4ee" />
      <circle cx="48" cy="134" r="8" fill="#fff" stroke="#9a97ab" stroke-width="2" />
      <text x="66" y="131" font-size="12.5" font-weight="600" fill="#17142a">Pubblica (consigliata)</text>
      <text x="66" y="147" font-size="10.5" fill="#6b6680">Il dispositivo non è individuabile in rete</text>
      <rect x="28" y="166" width="364" height="48" rx="10" fill="#f6f3ff" stroke="#5a30eb" stroke-width="2" />
      <circle cx="48" cy="190" r="8" fill="#fff" stroke="#5a30eb" stroke-width="2" />
      <circle cx="48" cy="190" r="4.5" fill="#5a30eb" />
      <text x="66" y="187" font-size="12.5" font-weight="700" fill="#17142a">Privata</text>
      <text x="66" y="203" font-size="10.5" fill="#6b6680">Per una rete attendibile: casa o ufficio</text>
      <rect x="22" y="160" width="376" height="60" rx="14" fill="none" stroke="#5a30eb" stroke-width="3" stroke-dasharray="6 6" class="pulse" />
      <path d="M300 196l0 30 8-8 6 13 6-3-6-13 11 0z" fill="#17142a" stroke="#fff" stroke-width="2" stroke-linejoin="round" />
    </svg>

    <!-- Pannello di controllo → App consentite: Novren, casella Privata -->
    <svg v-else-if="figure === 'nearby-firewall'" viewBox="0 0 420 260" role="img" aria-label="Firewall di Windows Defender: Novren consentito sulle reti private">
      <rect x="10" y="10" width="400" height="240" rx="14" fill="#fff" stroke="#e1dfea" />
      <rect x="10" y="10" width="400" height="34" rx="14" fill="#f3f2f8" />
      <rect x="10" y="30" width="400" height="14" fill="#f3f2f8" />
      <text x="28" y="32" font-size="12" font-weight="600" fill="#4a4560">App consentite</text>
      <text x="28" y="68" font-size="13" font-weight="700" fill="#17142a">Consenti alle app di comunicare tramite il firewall</text>
      <rect x="290" y="78" width="104" height="24" rx="6" fill="#f3f2f8" stroke="#c9c6d6" />
      <text x="342" y="94" text-anchor="middle" font-size="10.5" font-weight="600" fill="#17142a">Modifica impostazioni</text>
      <text x="28" y="124" font-size="10.5" font-weight="700" fill="#6b6680">Nome</text>
      <text x="282" y="124" text-anchor="middle" font-size="10.5" font-weight="700" fill="#6b6680">Privata</text>
      <text x="348" y="124" text-anchor="middle" font-size="10.5" font-weight="700" fill="#6b6680">Pubblica</text>
      <g v-for="(row, i) in ['Microsoft Edge', 'Novren', 'Posta e calendario']" :key="row">
        <rect x="24" :y="132 + i * 34" width="372" height="30" rx="7" :fill="row === 'Novren' ? '#f6f3ff' : '#fff'" :stroke="row === 'Novren' ? '#c9bdf5' : '#efedf4'" />
        <rect x="34" :y="141 + i * 34" width="12" height="12" rx="3" :fill="row === 'Novren' ? '#5a30eb' : '#9a97ab'" />
        <text x="54" :y="151 + i * 34" font-size="12" :font-weight="row === 'Novren' ? 700 : 500" fill="#17142a">{{ row }}</text>
        <rect x="275" :y="140 + i * 34" width="14" height="14" rx="3" :fill="row === 'Novren' ? '#5a30eb' : '#fff'" :stroke="row === 'Novren' ? '#5a30eb' : '#9a97ab'" stroke-width="1.5" />
        <path v-if="row === 'Novren'" :d="`M278 ${147 + i * 34}l3 3 5-6`" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" />
        <rect x="341" :y="140 + i * 34" width="14" height="14" rx="3" fill="#fff" stroke="#9a97ab" stroke-width="1.5" />
      </g>
      <circle cx="282" cy="181" r="17" fill="none" stroke="#5a30eb" stroke-width="3" class="pulse" />
      <path d="M290 186l0 30 8-8 6 13 6-3-6-13 11 0z" fill="#17142a" stroke="#fff" stroke-width="2" stroke-linejoin="round" />
    </svg>

    <!-- Antivirus con firewall proprio: Novren fra le app consentite -->
    <svg v-else-if="figure === 'nearby-antivirus'" viewBox="0 0 420 260" role="img" aria-label="Il firewall di un antivirus con Novren fra le app consentite">
      <rect x="10" y="10" width="400" height="240" rx="14" fill="#fff" stroke="#e1dfea" />
      <rect x="10" y="10" width="110" height="240" rx="14" fill="#24124f" />
      <rect x="106" y="10" width="14" height="240" fill="#24124f" />
      <path d="M65 40l26 10v18c0 17-11 29-26 35-15-6-26-18-26-35V50z" fill="#2ee6c8" />
      <path d="M55 70l7 7 13-14" fill="none" stroke="#24124f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <text x="65" y="130" text-anchor="middle" font-size="10.5" font-weight="700" fill="#d2c8f7">Protezione</text>
      <rect x="22" y="142" width="86" height="24" rx="8" fill="#5a30eb" />
      <text x="65" y="158" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">Firewall</text>
      <text x="65" y="186" text-anchor="middle" font-size="10.5" fill="#d2c8f7">Impostazioni</text>
      <text x="138" y="44" font-size="13" font-weight="700" fill="#17142a">Firewall › Regole delle applicazioni</text>
      <g v-for="(row, i) in ['Browser', 'Novren', 'Spotify']" :key="row">
        <rect x="134" :y="62 + i * 46" width="262" height="38" rx="9" :fill="row === 'Novren' ? '#f6f3ff' : '#fbfbfd'" :stroke="row === 'Novren' ? '#c9bdf5' : '#efedf4'" />
        <text x="148" :y="86 + i * 46" font-size="12" :font-weight="row === 'Novren' ? 700 : 500" fill="#17142a">{{ row }}</text>
        <rect x="330" :y="72 + i * 46" width="52" height="18" rx="9" :fill="row === 'Novren' ? '#0f6e64' : '#d8d6e0'" />
        <circle :cx="row === 'Novren' ? 373 : 339" :cy="81 + i * 46" r="7" fill="#fff" />
        <text v-if="row === 'Novren'" x="260" :y="86 + i * 46" font-size="10.5" font-weight="700" fill="#0f6e64">Consentita</text>
      </g>
      <rect x="128" y="104" width="274" height="50" rx="13" fill="none" stroke="#5a30eb" stroke-width="3" stroke-dasharray="6 6" class="pulse" />
      <text x="138" y="214" font-size="10.5" fill="#6b6680">Norton, Avast, AVG, Bitdefender, Kaspersky, ESET, McAfee…</text>
      <text x="138" y="230" font-size="10.5" fill="#6b6680">il nome della voce cambia, il gesto è lo stesso.</text>
    </svg>

    <!-- La rete: stessi dispositivi sulla stessa Wi-Fi; la rete ospiti li isola -->
    <svg v-else viewBox="0 0 420 260" role="img" aria-label="Due computer sulla stessa rete Wi-Fi; la rete ospiti li tiene separati">
      <rect x="10" y="10" width="400" height="240" rx="14" fill="#f6f3ff" />
      <rect x="182" y="40" width="56" height="34" rx="8" fill="#24124f" />
      <circle cx="198" cy="66" r="3" fill="#2ee6c8" />
      <circle cx="210" cy="66" r="3" fill="#2ee6c8" />
      <path d="M196 40l-6-14M224 40l6-14" stroke="#24124f" stroke-width="4" stroke-linecap="round" />
      <path d="M180 30a36 36 0 0 1 60 0" fill="none" stroke="#724cf9" stroke-width="3" stroke-linecap="round" opacity="0.6" />
      <text x="210" y="96" text-anchor="middle" font-size="11" font-weight="700" fill="#4923d1">CasaRossi</text>
      <g>
        <rect x="48" y="138" width="96" height="62" rx="8" fill="#fff" stroke="#24124f" stroke-width="3" />
        <rect x="34" y="200" width="124" height="10" rx="4" fill="#24124f" />
        <text x="96" y="174" text-anchor="middle" font-size="11" font-weight="700" fill="#17142a">Il tuo PC</text>
      </g>
      <g>
        <rect x="276" y="138" width="96" height="62" rx="8" fill="#fff" stroke="#24124f" stroke-width="3" />
        <rect x="262" y="200" width="124" height="10" rx="4" fill="#24124f" />
        <text x="324" y="174" text-anchor="middle" font-size="11" font-weight="700" fill="#17142a">L'altro PC</text>
      </g>
      <path d="M150 150 L192 92" stroke="#0f6e64" stroke-width="3" stroke-dasharray="6 6" class="flow" />
      <path d="M270 150 L228 92" stroke="#0f6e64" stroke-width="3" stroke-dasharray="6 6" class="flow" />
      <circle cx="210" cy="140" r="16" fill="#0f6e64" />
      <path d="M202 140l6 6 10-11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <rect x="150" y="222" width="120" height="22" rx="11" fill="#fde8eb" />
      <text x="210" y="237" text-anchor="middle" font-size="10.5" font-weight="700" fill="#b42b3e">✕ Rete «Ospiti»: isolati</text>
    </svg>
  </div>
</template>

<style scoped>
.art-wrap {
  display: grid;
  place-items: center;
  width: 100%;
}

svg {
  width: 100%;
  max-width: 420px;
  height: auto;
  font-family: inherit;
}

.pulse {
  animation: pulse 1.8s ease-in-out infinite;
}

.flow {
  animation: flow 1.2s linear infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@keyframes flow {
  to {
    stroke-dashoffset: -12;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse,
  .flow {
    animation: none;
  }
}
</style>
