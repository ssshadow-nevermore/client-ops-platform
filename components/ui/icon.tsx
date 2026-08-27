import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "activity"
  | "arrow-left"
  | "arrow-up-right"
  | "check"
  | "chevron-right"
  | "clock"
  | "file"
  | "globe"
  | "grid"
  | "history"
  | "layers"
  | "lock"
  | "menu"
  | "plug"
  | "plus"
  | "refresh"
  | "settings"
  | "shield"
  | "sparkles"
  | "users"
  | "x";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, ReactNode> = {
  activity: (
    <>
      <path d="M3 12h4l2-7 4 14 2-7h6" />
    </>
  ),
  "arrow-left": <path d="m15 18-6-6 6-6M9 12h12" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  check: <path d="m5 12 4 4L19 6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  file: (
    <>
      <path d="M6 3.5h7l5 5V20.5H6z" />
      <path d="M13 3.5v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.1 5.1 3.1 8.5s-1 6.2-3.1 8.5c-2.1-2.3-3.1-5.1-3.1-8.5S9.9 5.8 12 3.5Z" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="14.5" width="6" height="6" rx="1" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 5.5v4.3h4.3M12 7v5l3 2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8.5 4.3L12 12.5 3.5 8.3 12 4Z" />
      <path d="m3.5 12 8.5 4.3 8.5-4.3M3.5 15.7l8.5 4.3 8.5-4.3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plug: (
    <>
      <path d="M8 12h8M9 4v5M15 4v5M6.5 9h11v2.5a5.5 5.5 0 0 1-11 0V9ZM12 17v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.7-3L3 11" />
      <path d="M3 5v6h6M4 13a8 8 0 0 0 14.7 3L21 13" />
      <path d="M21 19v-6h-6" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15 .1.1 1.4 1.1-1.7 2.9-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-3.4l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.7-2.9 1.4-1.1.1-.1a8.3 8.3 0 0 1 0-2l-.1-.1-1.4-1.1 1.7-2.9 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h3.4l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.7 2.9-1.4 1.1-.1.1a8.3 8.3 0 0 1 0 2Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.2c0 4.4-2.8 7.4-7 9.3-4.2-1.9-7-4.9-7-9.3V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.1 4.9L18 9l-4.9 1.1L12 15l-1.1-4.9L6 9l4.9-1.1L12 3ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 3.7a3.5 3.5 0 0 1 0 6.8M21 20v-1.5a4 4 0 0 0-3-3.9" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
};

export function Icon({ name, size = 18, className, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      className={className}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
