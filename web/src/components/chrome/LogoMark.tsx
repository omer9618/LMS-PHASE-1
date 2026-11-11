import { cx } from '@/components/ui/cx';
import styles from './Chrome.module.css';

/**
 * The Paperlane mark: a paper plane folded from an exam sheet on an exam-blue tile, with a faint
 * graph-paper grid and a dotted highlighter trail. Colours come from tokens. Below 32px the grid
 * and trail drop out so the plane stays legible. Decorative: the name beside it is the label.
 */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  const detailed = size >= 32;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={cx(styles.logo, className)}
    >
      <rect className={styles.logoTile} width="48" height="48" rx="8" />
      {detailed && (
        <>
          <path className={styles.logoGrid} d="M0 12H48M0 24H48M0 36H48M12 0V48M24 0V48M36 0V48" />
          <path className={styles.logoTrail} d="M6 41C10 38 13 35 17.5 31" />
        </>
      )}
      <polygon className={styles.logoNear} points="41,9 8,22 19,27" />
      <polygon className={styles.logoFar} points="41,9 19,27 24,38" />
      {detailed && <polygon className={styles.logoFold} points="19,27 24,38 21.5,29.5" />}
    </svg>
  );
}
