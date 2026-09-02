/**
 * ASSET PATH GUARD.
 *
 * TEMPLATE_DEFECTS: every category hero image 404'd on the live site because
 * the markup said `src="assets/hero.jpg"`. On `/hot-tubs/` a browser resolves
 * that to `/hot-tubs/assets/hero.jpg`, which does not exist. The homepage
 * looked fine, so nobody noticed until the category pages were opened.
 *
 * The config schema already refuses a relative path for logos and hero
 * images. This file covers the other source: image URLs that arrive from the
 * DATABASE, typed by a client into the admin panel, where no Zod schema is
 * standing guard.
 *
 * The rule is the same either way — a component is never handed a relative
 * path. It gets an absolute URL or it gets null, and null renders the
 * placeholder treatment rather than a broken image.
 */

/**
 * Returns the URL only if it is absolute; null otherwise.
 *
 * "Absolute" means root-relative (`/products/x.webp`) or a full https URL
 * (an R2 public URL). A protocol-relative `//host/x.jpg` is rejected too —
 * it is a footgun on a site that must always be https.
 */
export function toAbsoluteAsset(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('https://')) return trimmed;
  return null;
}

/**
 * Same check, but shouts during development so a bad admin upload surfaces
 * while someone is looking at it rather than silently rendering a grey box
 * on a live client site.
 */
export function assetOrWarn(value: string | null | undefined, context: string): string | null {
  const resolved = toAbsoluteAsset(value);
  if (resolved === null && value && value.trim().length > 0 && import.meta.env.DEV) {
    console.warn(
      `[assets] Ignored a non-absolute image path in ${context}: "${value}". ` +
        'Paths must start with "/" or "https://" — a relative path 404s on nested routes.',
    );
  }
  return resolved;
}
