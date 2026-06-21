/**
 * Global PassThrough preset — the PrimeVue equivalent of Nuxt UI's app.config.ts.
 *
 * Classes here apply to EVERY instance of the component across the app.
 * For one-off tweaks on a single component, use the `:pt` prop on that
 * component instead of adding rules here.
 *
 * Each key is a component name (lowercased), each value maps the component's
 * internal sections ("passthrough" slots) to Tailwind classes.
 */
export const globalPt: Record<string, Record<string, string>> = {
  // Add per-component global overrides here as we migrate.
  // Example:
  // button: { root: 'font-semibold' },
}

export default globalPt
