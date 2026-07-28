import "server-only";
import { seedFAQ, seedFeatures, seedTestimonials } from "@/lib/seed-data";

/**
 * Server-side fetch of published marketing content from the backend CMS.
 *
 * These run in React Server Components, so they hit the backend directly (the
 * client `/api` proxy isn't available server-side). Every call falls back to the
 * bundled seed-data if the API is empty or unreachable — the public site must
 * always render, even if the backend is down or a fresh DB hasn't been seeded.
 */
const API_BASE = process.env.API_PROXY_URL || "http://localhost:3101/api";
const REVALIDATE = 60; // seconds — content is admin-edited, not real-time

export interface Faq { q: string; a: string; category?: string | null }
export interface Feature { icon: string; title: string; desc: string; chips?: string[] }
export interface Testimonial { quote: string; name: string; role: string }

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}/v1${path}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // backend unreachable → caller uses the seed fallback
  }
}

export async function getFaqs(): Promise<Faq[]> {
  const data = await get<{ question: string; answer: string; category: string | null }[]>("/content/faqs");
  if (!data || data.length === 0) return seedFAQ;
  return data.map((f) => ({ q: f.question, a: f.answer, category: f.category }));
}

export async function getFeatures(): Promise<Feature[]> {
  const data = await get<{ icon: string; title: string; description: string }[]>("/content/features");
  if (!data || data.length === 0) return seedFeatures as Feature[];
  return data.map((f) => ({ icon: f.icon, title: f.title, desc: f.description }));
}

export async function getTestimonials(): Promise<Testimonial[]> {
  const data = await get<{ quote: string; name: string; role: string }[]>("/content/testimonials");
  if (!data || data.length === 0) return seedTestimonials;
  return data.map((t) => ({ quote: t.quote, name: t.name, role: t.role }));
}

/** Published section copy for a page as a {key: value} map, with fallbacks applied. */
export async function getSections(
  page: string,
  fallback: Record<string, string> = {},
): Promise<Record<string, string>> {
  const data = await get<Record<string, string>>(`/content/sections?page=${encodeURIComponent(page)}`);
  return { ...fallback, ...(data ?? {}) };
}

/**
 * Per-page SEO title/description, CMS-overridable via the page-section store
 * (keys `meta_title` / `meta_description`), with static fallbacks so pages
 * always carry sound metadata even before a superadmin customises them. Shares
 * the `/content/sections` fetch with getSections — Next dedupes identical calls
 * within a render, so this adds no extra round-trip on pages that also render
 * section copy.
 */
export async function getSeo(
  page: string,
  fallback: { title: string; description: string },
): Promise<{ title: string; description: string }> {
  const data = await get<Record<string, string>>(`/content/sections?page=${encodeURIComponent(page)}`);
  return {
    title: data?.meta_title?.trim() || fallback.title,
    description: data?.meta_description?.trim() || fallback.description,
  };
}
