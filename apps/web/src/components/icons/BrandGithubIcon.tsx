import type { LucideProps } from 'lucide-react';
import { forwardRef } from 'react';

/** GitHub brand mark — lucide-react 1.x removed brand icons; local shim for Help page. */
export const BrandGithubIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ size = 24, color = 'currentColor', strokeWidth = 2, className, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={props['aria-hidden']}
      {...props}
    >
      <title>GitHub</title>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.09.28-2.2 0-3.29 0 0-1 0-3 1.5A10.3 10.3 0 0 0 12 4.8c-1 0-2 .1-3 .3-2-1.5-3-1.5-3-1.5-.28 1.09-.28 2.2 0 3.29-.73 1.02-1.08 2.25-1 3.5 0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S9 19 9 20v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  ),
);

BrandGithubIcon.displayName = 'BrandGithubIcon';
