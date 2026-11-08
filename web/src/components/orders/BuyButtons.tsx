'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, ButtonLink } from '@/components/ui';
import { CART_MAX_ITEMS, useCart } from '@/lib/cart';

/** #54: the paid-course actions on the course page: add to cart, or buy now (cart + checkout). */
export function BuyButtons({ courseId }: { courseId: string }) {
  const cart = useCart();
  const router = useRouter();
  const [full, setFull] = useState(false);
  const inCart = cart.has(courseId);

  function add(thenCheckout: boolean) {
    const result = cart.add(courseId);
    if (!result.ok) {
      setFull(true);
      return;
    }
    if (thenCheckout) router.push('/cart');
  }

  return (
    <div className="stack">
      <Button fullWidth size="lg" onClick={() => add(true)}>
        Buy now
      </Button>
      {inCart ? (
        <ButtonLink href="/cart" variant="secondary" fullWidth>
          In your cart: view cart
        </ButtonLink>
      ) : (
        <Button variant="secondary" fullWidth onClick={() => add(false)}>
          Add to cart
        </Button>
      )}
      {full && (
        <Alert tone="warning">
          Your cart is full ({CART_MAX_ITEMS} courses). Check out or remove a course first.
        </Alert>
      )}
      <p className="muted">Paid by bank transfer. You get access once we confirm payment.</p>
    </div>
  );
}
