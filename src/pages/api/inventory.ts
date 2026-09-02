/**
 * PUBLIC INVENTORY API — GET /api/inventory
 *
 *   /api/inventory                → every product in an enabled category
 *   /api/inventory?category=hot-tub
 *   /api/inventory?slug=xyz       → one product
 *   /api/inventory?counts=1       → per-category counts
 *
 * This route is public and read-only. It cannot return a draft, cannot
 * return a deleted row, and — the part that matters — cannot return a
 * product in a category this client does not sell, because the query layer
 * filters against the same config array the nav renders from.
 *
 * The old site had `const CATEGORIES = new Set(['hot-tub','swim-spa'])`
 * typed into the API by hand. That is why removing saunas took 26 file
 * edits and why the API was the copy everyone missed. There is no such set
 * in this file.
 */

import type { APIRoute } from 'astro';
import {
  getDb,
  listProducts,
  getProductBySlug,
  countProductsByCategory,
  isEnabledCategory,
  inventoryStatus,
} from '../../lib/db';
import { enabledCategories } from '../../config';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Short edge cache; inventory changes when the admin saves, not per view.
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=60' : 'no-store',
    },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const db = getDb();
  const status = inventoryStatus(db);

  if (!db) {
    // 503, not 500: the site is fine, the database just is not wired yet.
    return json({ ok: false, error: status.message, ...status }, 503);
  }

  const categoryParam = url.searchParams.get('category');
  const slugParam = url.searchParams.get('slug');
  const wantCounts = url.searchParams.get('counts') === '1';

  try {
    if (wantCounts) {
      return json({
        ok: true,
        counts: await countProductsByCategory(db),
        categories: enabledCategories.map((c) => ({
          slug: c.slug,
          label: c.label,
          href: c.href,
        })),
      });
    }

    if (slugParam) {
      const product = await getProductBySlug(db, slugParam);
      if (!product) return json({ ok: false, error: 'Product not found.' }, 404);
      return json({ ok: true, product });
    }

    if (categoryParam !== null && !isEnabledCategory(categoryParam)) {
      // Explicit and honest: this client does not sell that. Not a 500,
      // and not a silent full listing either.
      return json(
        {
          ok: false,
          error: `This site does not sell "${categoryParam}".`,
          enabledCategories: enabledCategories.map((c) => c.slug),
        },
        404,
      );
    }

    const products = await listProducts(db, {
      ...(categoryParam !== null ? { category: categoryParam } : {}),
    });

    return json({ ok: true, count: products.length, products });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown database error.';
    return json({ ok: false, error: message }, 500);
  }
};
