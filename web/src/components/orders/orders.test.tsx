import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { CartQuote, StudentOrder } from '@/lib/api/orders';
import { CART_STORAGE_KEY } from '@/lib/cart';
import { COURSE_ID, courseDetail } from '@/test/fixtures';
import { apiMock, resetMocks, router } from '@/test/mocks';
import { renderWithSession, STUDENT } from '@/test/render';
import { CourseDetailView } from '../course/CourseDetailView';
import { CartView } from './CartView';
import { OrderDetail } from './OrderDetail';
import { OrdersList } from './OrdersList';
import { ReceiptView } from './ReceiptView';

vi.mock('next/navigation', async () => (await import('@/test/mocks')).navigationMock);
vi.mock('@/lib/api/client', async () => (await import('@/test/mocks')).apiClientMock);

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const ORDER_ID = '55555555-5555-4555-8555-555555555555';

const quote: CartQuote = {
  items: [
    {
      courseId: C1,
      title: 'Mechanics',
      teacherId: 't1',
      teacherName: 'Ms Ahmed',
      priceMinor: '1500000',
      currency: 'PKR',
    },
    {
      courseId: C2,
      title: 'Waves',
      teacherId: 't2',
      teacherName: 'Mr Khan',
      priceMinor: '999950',
      currency: 'PKR',
    },
    {
      courseId: C3,
      title: 'Optics',
      teacherId: 't1',
      teacherName: 'Ms Ahmed',
      priceMinor: '50',
      currency: 'PKR',
    },
  ],
  currency: 'PKR',
  totalMinor: '2500000',
  teacherCount: 2,
};

function order(overrides: Partial<StudentOrder> = {}): StudentOrder {
  return {
    id: ORDER_ID,
    paymentReference: 'LMS-7Q2K9',
    status: 'PENDING',
    totalMinor: '1500000',
    currency: 'PKR',
    createdAt: '2026-11-08T10:00:00Z',
    expiresAt: '2026-11-10T10:00:00Z',
    verifiedAt: null,
    items: [
      { courseId: C1, courseTitle: 'Mechanics', teacherName: 'Ms Ahmed', priceMinor: '1500000' },
    ],
    proofs: [],
    paymentInstructions: {
      bankTransferInstructions: 'Bank: Example Bank\nAccount: 0123 4567',
      paymentReference: 'LMS-7Q2K9',
      amountMinor: '1500000',
      currency: 'PKR',
      expiresAt: '2026-11-10T10:00:00Z',
      verificationTurnaroundHours: 24,
    },
    lastDecision: null,
    guidance: {
      statusLabel: 'Awaiting payment',
      nextAction: 'SUBMIT_PROOF',
      canSubmitProof: true,
      whatHappensNext:
        'Transfer PKR 1500000 (minor units) using the bank details and reference LMS-7Q2K9 by 2026-11-10T10:00:00.000Z, then submit your transaction ID.',
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetMocks();
  window.localStorage.clear();
});

describe('cart and checkout (#54, #55)', () => {
  it('groups the quote per teacher with subtotals, removes courses, and places the order', async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([C1, C2, C3]));
    apiMock.post.mockImplementation(async (path: string, body: { courseIds: string[] }) => {
      if (path === '/cart/quote') {
        return { ...quote, items: quote.items.filter((i) => body.courseIds.includes(i.courseId)) };
      }
      if (path === '/orders') return order();
      throw new Error(`unexpected POST ${path}`);
    });
    renderWithSession(<CartView />, STUDENT);

    const byAhmed = await screen.findByRole('region', { name: 'Courses by Ms Ahmed' });
    expect(within(byAhmed).getByText('Subtotal: PKR 15,000.50')).toBeVisible();
    expect(screen.getByText('PKR 25,000.00')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Optics' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenLastCalledWith('/cart/quote', { courseIds: [C1, C2] }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/orders/${ORDER_ID}?placed=1`));
    expect(apiMock.post).toHaveBeenCalledWith('/orders', { courseIds: [C1, C2] });
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe('[]');
  });

  it('offers to remove a course the API refuses', async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([C1, C2]));
    apiMock.post.mockRejectedValueOnce(
      new ApiError('ORDER_REFUSED', 'You already have access to Waves', {
        status: 409,
        info: { courseId: C2, reason: 'ALREADY_ENROLLED' },
      }),
    );
    apiMock.post.mockResolvedValue({ ...quote, items: [quote.items[0]!], teacherCount: 1 });
    renderWithSession(<CartView />, STUDENT);
    expect(await screen.findByText('You already have access to Waves')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Remove that course' }));
    expect(await screen.findByText('Mechanics')).toBeVisible();
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([C1]);
  });

  it('asks signed-out visitors to sign in', async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([C1]));
    renderWithSession(<CartView />, null);
    expect(await screen.findByText('Sign in to check out')).toBeVisible();
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it('adds a paid course from the course page and goes to the cart', async () => {
    renderWithSession(<CourseDetailView courseId={COURSE_ID} />, STUDENT, (path) => {
      if (path === `/catalogue/courses/${COURSE_ID}`) return courseDetail();
      if (path === '/me/enrollments') return [];
      throw new Error(`unexpected GET ${path}`);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Buy now' }));
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([COURSE_ID]);
    expect(router.push).toHaveBeenCalledWith('/cart');
    expect(await screen.findByRole('link', { name: 'In your cart: view cart' })).toBeVisible();
  });
});

describe('order detail (#58, #60, #65, #66)', () => {
  function renderOrder(o: StudentOrder, justPlaced = false) {
    return renderWithSession(
      <OrderDetail orderId={ORDER_ID} justPlaced={justPlaced} />,
      STUDENT,
      (path) => {
        if (path === `/me/orders/${ORDER_ID}`) return o;
        throw new Error(`unexpected GET ${path}`);
      },
    );
  }

  it('shows the reference, amount, deadline and bank details, with readable guidance', async () => {
    renderOrder(order(), true);
    expect(await screen.findByText('Order placed')).toBeVisible();
    const pay = screen.getByRole('region', { name: 'How to pay' });
    expect(within(pay).getByText('PKR 15,000.00')).toBeVisible();
    expect(within(pay).getByText('LMS-7Q2K9')).toBeVisible();
    expect(within(pay).getByText(/Account: 0123 4567/)).toBeVisible();
    expect(within(pay).getByText(/10 Nov 2026/)).toBeVisible();
    const next = screen.getByRole('region', { name: 'What happens next' });
    expect(next).toHaveTextContent('PKR 15,000.00');
    expect(next).not.toHaveTextContent('minor units');
  });

  it('submits a proof as multipart and shows a duplicate warning', async () => {
    apiMock.postForm.mockResolvedValue({
      order: order({
        status: 'PROOF_SUBMITTED',
        guidance: {
          ...order().guidance,
          statusLabel: 'Payment under review',
          canSubmitProof: true,
        },
      }),
      proof: {
        id: 'p',
        transactionId: 'TX-1',
        amountClaimedMinor: '1500000',
        hasFile: false,
        fileUrl: null,
        submittedAt: '2026-11-08T11:00:00Z',
      },
      duplicateTransactionIdWarning: {
        transactionId: 'TX-1',
        conflictingPaymentReferences: ['LMS-AAAA'],
        message: 'Transaction ID "TX-1" was also submitted on LMS-AAAA.',
      },
    });
    renderOrder(order());
    await userEvent.type(await screen.findByLabelText(/Transaction ID/), 'TX-1');
    await userEvent.type(screen.getByLabelText(/Amount you transferred/), '15,000');
    await userEvent.click(screen.getByRole('button', { name: 'Submit payment details' }));

    await waitFor(() => expect(apiMock.postForm).toHaveBeenCalled());
    const [path, form] = apiMock.postForm.mock.calls[0]! as [string, FormData];
    expect(path).toBe(`/me/orders/${ORDER_ID}/proofs`);
    expect(form.get('transactionId')).toBe('TX-1');
    expect(form.get('amountClaimedMinor')).toBe('1500000');
    expect(form.get('file')).toBeNull();
    expect(await screen.findByText('Payment details received')).toBeVisible();
    expect(screen.getByText(/also submitted on LMS-AAAA/)).toBeVisible();
  });

  it('validates the proof form before sending', async () => {
    renderOrder(order());
    await userEvent.type(await screen.findByLabelText(/Amount you transferred/), '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Submit payment details' }));
    expect(screen.getByText('Enter the transaction ID from your bank')).toBeVisible();
    expect(screen.getByText(/Enter the amount you transferred/)).toBeVisible();
    expect(apiMock.postForm).not.toHaveBeenCalled();
  });

  it('shows a rejection with its reason and lets the student resubmit', async () => {
    renderOrder(
      order({
        status: 'REJECTED',
        lastDecision: {
          kind: 'REJECTED',
          reason: 'The transaction ID could not be matched to a transfer',
          notes: 'Check the last digits',
        },
        guidance: {
          statusLabel: 'Payment not accepted',
          nextAction: 'SUBMIT_PROOF',
          canSubmitProof: true,
          whatHappensNext: 'We could not verify your payment.',
        },
      }),
    );
    expect(await screen.findByText('Your payment was not accepted')).toBeVisible();
    expect(screen.getByText(/could not be matched to a transfer/)).toBeVisible();
    expect(screen.getByText('Check the last digits')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Submit a corrected payment' })).toBeVisible();
  });

  it('shows a top-up shortfall', async () => {
    renderOrder(order({ lastDecision: { kind: 'TOP_UP_REQUESTED', shortfallMinor: '250000' } }));
    expect(await screen.findByText('Top-up needed')).toBeVisible();
    expect(screen.getByText('PKR 2,500.00')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Add another transfer' })).toBeVisible();
  });

  it('links to the receipt and the courses once paid, with no proof form', async () => {
    renderOrder(
      order({
        status: 'VERIFIED',
        verifiedAt: '2026-11-08T12:00:00Z',
        guidance: {
          statusLabel: 'Paid',
          nextAction: 'NONE',
          canSubmitProof: false,
          whatHappensNext: 'Your payment is confirmed.',
        },
      }),
    );
    expect(await screen.findByRole('link', { name: 'View receipt' })).toHaveAttribute(
      'href',
      `/orders/${ORDER_ID}/receipt`,
    );
    expect(screen.getByRole('link', { name: 'Mechanics' })).toHaveAttribute('href', `/learn/${C1}`);
    expect(screen.queryByLabelText(/Transaction ID/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'How to pay' })).toBeNull();
  });
});

describe('orders list and receipt (#60, #62)', () => {
  it('lists orders with status and the next action', async () => {
    renderWithSession(<OrdersList />, STUDENT, (path) => {
      if (path === '/me/orders')
        return [
          order(),
          order({
            id: 'o2',
            paymentReference: 'LMS-B',
            status: 'LAPSED',
            guidance: { ...order().guidance, statusLabel: 'Expired', canSubmitProof: false },
          }),
        ];
      throw new Error(`unexpected GET ${path}`);
    });
    expect(await screen.findByText('Awaiting payment')).toBeVisible();
    expect(screen.getByText('Expired')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Pay and submit proof' })).toHaveLength(1);
  });

  it('shows the receipt, or explains it comes after confirmation', async () => {
    renderWithSession(<ReceiptView orderId={ORDER_ID} />, STUDENT, (path) => {
      if (path === `/me/orders/${ORDER_ID}/receipt`) {
        return {
          receiptNumber: 'R-2026-0001',
          orderId: ORDER_ID,
          paymentReference: 'LMS-7Q2K9',
          issuedAt: '2026-11-08T12:00:00Z',
          student: { fullName: 'Ayesha Khan', email: 'ayesha@example.com' },
          items: order().items,
          totalMinor: '1500000',
          currency: 'PKR',
        };
      }
      throw new Error(`unexpected GET ${path}`);
    });
    expect(await screen.findByText('No. R-2026-0001')).toBeVisible();
    expect(screen.getByText(/Ayesha Khan/)).toBeVisible();
    expect(screen.getAllByText('PKR 15,000.00').length).toBeGreaterThan(0);
  });

  it('explains a receipt is not issued before confirmation', async () => {
    renderWithSession(<ReceiptView orderId={ORDER_ID} />, STUDENT, () => {
      throw new ApiError(
        'ORDER_REFUSED',
        'A receipt is issued only once the payment is confirmed',
        { status: 409 },
      );
    });
    expect(await screen.findByText(/issued once your payment is confirmed/)).toBeVisible();
  });
});
