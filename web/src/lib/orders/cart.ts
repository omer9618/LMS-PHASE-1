'use client';

import { useSyncExternalStore } from 'react';
import { z } from 'zod';

/**
 * The cart (#54) lives in the browser: a list of course ids in localStorage. The API validates
 * and prices it on every quote, so nothing here is trusted for money.
 */
export const CART_MAX_ITEMS = 20;
export const CART_STORAGE_KEY = 'lms.cart.v1';

const courseId = z.guid();

/** What a stored cart may hold: unknown shapes, bad ids and duplicates are dropped, then capped. */
const storedCart = z.array(z.unknown()).transform((values) => {
  const ids = values.filter((v): v is string => courseId.safeParse(v).success);
  return [...new Set(ids)].slice(0, CART_MAX_ITEMS);
});

/** Reads a stored cart defensively: unknown shapes, bad ids and duplicates are dropped. */
export function parseCart(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = storedCart.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export type AddResult = { ok: true; ids: string[] } | { ok: false; reason: 'FULL' };

export function addToCart(ids: readonly string[], courseId: string): AddResult {
  if (ids.includes(courseId)) return { ok: true, ids: [...ids] };
  if (ids.length >= CART_MAX_ITEMS) return { ok: false, reason: 'FULL' };
  return { ok: true, ids: [...ids, courseId] };
}

export function removeFromCart(ids: readonly string[], courseId: string): string[] {
  return ids.filter((id) => id !== courseId);
}

// ── Store ───────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
const EMPTY: string[] = [];
let cached: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(CART_STORAGE_KEY);
  if (raw !== cached.raw) cached = { raw, ids: parseCart(raw) };
  return cached.ids;
}

function write(ids: string[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(ids));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Other tabs change the cart too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export interface Cart {
  ids: string[];
  has(courseId: string): boolean;
  add(courseId: string): AddResult;
  remove(courseId: string): void;
  clear(): void;
}

export function useCart(): Cart {
  const ids = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    ids,
    has: (courseId) => ids.includes(courseId),
    add: (courseId) => {
      const result = addToCart(read(), courseId);
      if (result.ok) write(result.ids);
      return result;
    },
    remove: (courseId) => write(removeFromCart(read(), courseId)),
    clear: () => write([]),
  };
}
