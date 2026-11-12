import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import styles from './BackLink.module.css';

/** The one way back to a list or parent page: an arrow, then the place, in sentence case. */
export function BackLink({ className, children, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link {...rest} className={cx(styles.back, className)}>
      <Icon name="arrowLeft" />
      <span>{children}</span>
    </Link>
  );
}
