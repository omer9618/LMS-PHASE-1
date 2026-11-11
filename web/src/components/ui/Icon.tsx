import type { SVGProps } from 'react';

/**
 * The icon set: inline stroke SVGs on a 24px grid, drawn in `currentColor`, stroke 2, round caps
 * (Paperlane: no emoji, no icon fonts). Decorative by default (`aria-hidden`): the words beside an
 * icon carry the meaning. Pass `title` when an icon stands alone.
 */
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17.5v.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 1.5" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5-10-6.5z" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  chevronUp: <path d="M6 14l6-6 6 6" />,
  chevronDown: <path d="M6 10l6 6 6-6" />,
} as const;

export type IconName = keyof typeof PATHS;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size; defaults to 1em so the icon follows the text around it. */
  size?: number | string;
  /** Set when the icon is the only content of a control or a state. */
  title?: string;
}

export function Icon({ name, size = '1em', title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      style={{ verticalAlign: '-0.125em', flexShrink: 0 }}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
