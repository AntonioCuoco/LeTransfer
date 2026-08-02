# Font — provenienza e licenza

I tre file `.woff2` di questa cartella sono **vendorizzati di proposito**: la CSP di
produzione dichiara `font-src 'self'`, quindi nessun font può arrivare da un CDN, e un
prodotto che promette "il server non vede niente" non può far bussare il browser di chi
riceve un link a un dominio di terzi a ogni visita.

Sono i sottoinsiemi latini dei **variable font** pubblicati da
[Fontsource](https://fontsource.org) (che a sua volta li impacchetta dagli upstream
ufficiali), copiati byte per byte, senza modifiche.

| File | Famiglia | Pacchetto Fontsource | Asse |
|---|---|---|---|
| `inter-latin-wght-normal.woff2` | Inter | `@fontsource-variable/inter@5.3.0` | `wght` 100–900 |
| `inter-latin-ext-wght-normal.woff2` | Inter (Latin Extended) | `@fontsource-variable/inter@5.3.0` | `wght` 100–900 |
| `inter-tight-latin-wght-normal.woff2` | Inter Tight | `@fontsource-variable/inter-tight@5.3.0` | `wght` 100–900 |
| `jetbrains-mono-latin-wght-normal.woff2` | JetBrains Mono | `@fontsource-variable/jetbrains-mono@5.3.0` | `wght` 100–800 |

## SHA-256

Il build riproducibile ([reproducible-build.yml](../../../../.github/workflows/reproducible-build.yml))
ha senso solo se ogni byte che finisce nel bundle è tracciabile — i font inclusi.

```
34b9c504cab7a73e37b746343a449132e56cf7b5481af2cb81dc74dcff25c956  inter-latin-ext-wght-normal.woff2
3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62  inter-latin-wght-normal.woff2
77fefe8ca19b9f69b5284832c519e0493127c1f091f0a8936884be7721c4e618  inter-tight-latin-wght-normal.woff2
18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e  jetbrains-mono-latin-wght-normal.woff2
```

Verifica: `sha256sum *.woff2` in questa cartella.

## Licenza

Tutte e tre le famiglie sono **SIL Open Font License 1.1** → [OFL-1.1.txt](OFL-1.1.txt),
che ne consente l'uso, l'incorporazione e la ridistribuzione (anche in un progetto
commerciale) a patto di non venderle da sole e di mantenere licenza e copyright — motivo
per cui questo file esiste.

- Inter — Copyright 2016 The Inter Project Authors, <https://github.com/rsms/inter>
- Inter Tight — Copyright 2022 The Inter Project Authors, <https://github.com/rsms/inter-tight>
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors, <https://github.com/JetBrains/JetBrainsMono>

## Aggiornarli

```sh
V=5.3.0
curl -sSLO https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@$V/files/inter-latin-wght-normal.woff2
curl -sSLO https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@$V/files/inter-latin-ext-wght-normal.woff2
curl -sSLO https://cdn.jsdelivr.net/npm/@fontsource-variable/inter-tight@$V/files/inter-tight-latin-wght-normal.woff2
curl -sSLO https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@$V/files/jetbrains-mono-latin-wght-normal.woff2
```

Poi aggiorna versioni e SHA-256 qui sopra, e ricontrolla gli `unicode-range` in
[`../fonts.css`](../fonts.css) contro l'`index.css` dei pacchetti: i sottoinsiemi
Google cambiano tra una major e l'altra.
