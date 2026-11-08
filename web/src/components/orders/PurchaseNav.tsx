'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '@/lib/cart';
import { useSession } from '@/lib/session';

/** Header links for buying (#54, #60): the cart (with its count) and, signed in, my orders. */
export function PurchaseNav() {
  const { user } = useSession();
  const { ids } = useCart();
  const pathname = usePathname() ?? '';
  const current = (href: string) => (pathname.startsWith(href) ? 'page' : undefined);
  return (
    <>
      {user && (
        <Link href="/orders" aria-current={current('/orders')}>
          My orders
        </Link>
      )}
      {(user || ids.length > 0) && (
        <Link href="/cart" aria-current={current('/cart')}>
          Cart{ids.length > 0 ? ` (${ids.length})` : ''}
          {ids.length > 0 && (
            <span className="visually-hidden">
              , {ids.length} course{ids.length === 1 ? '' : 's'}
            </span>
          )}
        </Link>
      )}
    </>
  );
}
