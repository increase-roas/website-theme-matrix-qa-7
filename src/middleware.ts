/**
 * ATTRIBUTION MIDDLEWARE.
 *
 * Runs on every page request and does two things before anything renders:
 *
 *   1. Assigns a `lead_uuid` on the first visit. The row in D1 is keyed by
 *      it, so the same person filling the form twice updates one lead rather
 *      than creating two, and a lead can be written before the form is even
 *      submitted.
 *
 *   2. Captures attribution. FIRST touch is written once and never
 *      overwritten — that is the campaign that actually earned the customer.
 *      LAST touch is overwritten on every visit. Storing only one of the two
 *      is how "which ad worked?" becomes unanswerable three months later.
 *
 * This is the only place cookies are set. No component writes attribution,
 * so there is no second copy to drift out of step.
 */

import { defineMiddleware } from 'astro:middleware';

/** Query params worth remembering. */
const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ttclid',
  'msclkid',
] as const;

const NINETY_DAYS = 60 * 60 * 24 * 90;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Paths that never need a cookie — assets and the API's own routes. */
function isTrackable(pathname: string): boolean {
  if (pathname.startsWith('/_')) return false;
  if (pathname.startsWith('/api/')) return false;
  return !/\.[a-z0-9]+$/i.test(pathname);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { cookies, url } = context;

  if (!isTrackable(url.pathname)) return next();

  // --- 1. Lead UUID -------------------------------------------------
  if (!cookies.has('lead_uuid')) {
    cookies.set('lead_uuid', crypto.randomUUID(), {
      path: '/',
      maxAge: NINETY_DAYS,
      sameSite: 'lax',
      secure: true,
      // Readable by client JS on purpose: the pixel needs it as external_id
      // so browser and server events can be matched. It identifies a
      // session, not a person, and carries no PII.
      httpOnly: false,
    });
  }

  // --- 2. Attribution ----------------------------------------------
  for (const key of ATTRIBUTION_KEYS) {
    const value = url.searchParams.get(key);
    if (!value) continue;

    const clean = value.slice(0, 400);

    // First touch: written once. This is the deliberate part — an
    // overwritten first touch silently re-credits the last ad someone
    // happened to click, which flatters retargeting and buries the
    // campaign that actually found them.
    const firstKey = `ft_${key}`;
    if (!cookies.has(firstKey)) {
      cookies.set(firstKey, clean, {
        path: '/',
        maxAge: NINETY_DAYS,
        sameSite: 'lax',
        secure: true,
      });
    }

    // Last touch: always overwritten.
    cookies.set(`lt_${key}`, clean, {
      path: '/',
      maxAge: THIRTY_DAYS,
      sameSite: 'lax',
      secure: true,
    });
  }

  return next();
});
