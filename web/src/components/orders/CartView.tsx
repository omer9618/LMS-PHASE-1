'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  ButtonLink,
  PageHeader,
  Section,
  SplitLayout,
  Money,
} from '@/components/ui';
import { api } from '@/lib/api/client';
import { RequestError, errorMessage } from '@/lib/api/errors';
import { courseDetail } from '@/lib/api/schemas/catalogue';
import { orders as defaultOrders, type OrdersApi } from '@/lib/api/orders';
import { useCart } from '@/lib/orders/cart';
import { groupByTeacher } from '@/lib/orders/display';
import { useSession } from '@/lib/session';
import { useMutation, useQuery } from '@tanstack/react-query';
import styles from './Orders.module.css';

/** The course an ORDER_REFUSED error is about (the API puts it in `info.courseId`). */
function refusedCourseId(error: unknown): string | null {
  if (!(error instanceof RequestError) || error.name !== 'ORDER_REFUSED') return null;
  const info = error.info as { courseId?: unknown } | undefined;
  return typeof info?.courseId === 'string' ? info.courseId : null;
}

/**
 * #54, #55: the cart, priced by the API (POST /cart/quote) and grouped per teacher, and checkout
 * (POST /orders). The cart is in the browser; the order freezes the prices when it is placed.
 */
export function CartView({ client = defaultOrders }: { client?: OrdersApi }) {
  const cart = useCart();
  const { status } = useSession();
  const router = useRouter();
  const quote = useQuery({
    queryKey: ['cart-quote', cart.ids],
    queryFn: () => client.quote(cart.ids),
    enabled: status === 'signed-in' && cart.ids.length > 0,
  });
  const place = useMutation({
    mutationFn: () => client.createOrder(cart.ids),
    onSuccess: (order) => {
      cart.clear();
      router.push(`/orders/${encodeURIComponent(order.id)}?placed=1`);
    },
  });
  // Stays busy after success too: the page is about to change.
  const placing = place.isPending || place.isSuccess;
  const placeError = place.error;
  const checkout = () => place.mutate();

  // The API refuses a cart for one course; name it, so the student knows what to remove.
  const refused = refusedCourseId(quote.status === 'error' ? quote.error : placeError);
  const refusedCourse = useQuery({
    queryKey: ['cart-refused-course', refused],
    queryFn: () => api.get(`/catalogue/courses/${refused}`, courseDetail),
    enabled: refused !== null,
  });

  if (cart.ids.length === 0) {
    return (
      <div className="stack">
        <PageHeader eyebrow="Checkout" title="Your cart" />
        <p>Your cart is empty.</p>
        <p>
          <ButtonLink href="/courses">Browse courses</ButtonLink>
        </p>
      </div>
    );
  }

  if (status === 'signed-out') {
    return (
      <div className="stack">
        <PageHeader eyebrow="Checkout" title="Your cart" />
        <p>
          {cart.ids.length} course{cart.ids.length === 1 ? '' : 's'} in your cart.
        </p>
        <Alert tone="info" title="Sign in to check out">
          <ButtonLink href={`/login?next=${encodeURIComponent('/cart')}`}>Sign in</ButtonLink>
        </Alert>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Checkout" title="Your cart" />

      {quote.status === 'pending' && quote.fetchStatus !== 'idle' && (
        <p className="muted" role="status">
          Pricing your cart…
        </p>
      )}

      {quote.status === 'error' && (
        <Alert tone="danger" title="Your cart cannot be checked out as it is">
          {refused ? (
            <>
              <p>
                {refusedCourse.data ? (
                  <>
                    <Link href={`/courses/${encodeURIComponent(refused)}`}>
                      {refusedCourse.data.title}
                    </Link>
                    :{' '}
                  </>
                ) : null}
                <span>{errorMessage(quote.error)}</span>
              </p>
              <p className="cluster">
                <Button variant="secondary" size="sm" onClick={() => cart.remove(refused)}>
                  Remove it from the cart
                </Button>
                <ButtonLink
                  href={`/courses/${encodeURIComponent(refused)}`}
                  variant="ghost"
                  size="sm"
                >
                  Open the course page
                </ButtonLink>
              </p>
              {cart.ids.length > 1 && (
                <p className="muted">
                  The other {cart.ids.length - 1 === 1 ? 'course' : 'courses'} in your cart will be
                  priced as soon as it is gone.
                </p>
              )}
            </>
          ) : (
            <>
              <p>{errorMessage(quote.error)}</p>
              <p>
                <Button variant="secondary" size="sm" onClick={() => cart.clear()}>
                  Empty the cart
                </Button>
              </p>
            </>
          )}
        </Alert>
      )}

      {quote.status === 'success' && (
        <SplitLayout
          main={
            <>
              {groupByTeacher(quote.data.items).map((group) => (
                <section
                  key={group.teacherId}
                  className={styles.card}
                  aria-label={`Courses by ${group.teacherName}`}
                >
                  <h2 className={styles.groupTitle}>{group.teacherName}</h2>
                  <ul className={styles.lines}>
                    {group.items.map((item) => (
                      <li key={item.courseId}>
                        <Link href={`/courses/${encodeURIComponent(item.courseId)}`}>
                          {item.title}
                        </Link>
                        <span className={styles.lineEnd}>
                          <strong>
                            <Money minor={item.priceMinor} currency={item.currency} />
                          </strong>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cart.remove(item.courseId)}
                            aria-label={`Remove ${item.title}`}
                          >
                            Remove
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {quote.data.teacherCount > 1 && (
                    <p className={styles.subtotal}>
                      Subtotal: <Money minor={group.subtotalMinor} currency={quote.data.currency} />
                    </p>
                  )}
                </section>
              ))}
            </>
          }
          aside={
            <Section raised title="Order summary">
              <div className={styles.totalRow}>
                <span>Total</span>
                <strong className={styles.bigValue}>
                  <Money minor={quote.data.totalMinor} currency={quote.data.currency} />
                </strong>
              </div>
              <p className="muted">
                You pay once, by bank transfer, with the reference you get on the next page. Prices
                are fixed when you place the order.
              </p>

              {placeError && (
                <Alert tone="danger" title="The order could not be placed">
                  <p>{errorMessage(placeError)}</p>
                  {placeError instanceof RequestError &&
                    placeError.name === 'EMAIL_NOT_VERIFIED' && (
                      <p>Check your inbox for the verification link, then try again.</p>
                    )}
                </Alert>
              )}

              <div>
                <Button size="lg" onClick={checkout} loading={placing} loadingText="Placing order…">
                  Place order
                </Button>
              </div>
            </Section>
          }
        />
      )}
    </div>
  );
}
