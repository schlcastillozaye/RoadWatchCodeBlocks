interface BrandMarkProps {
  size?: number;
  onDark?: boolean;
  className?: string;
}

/**
 * The Code Blocks Inc. symbol — five equally sized rounded squares forming a
 * block-style "C", with brand accents beside the top and bottom blocks.
 */
export function BrandMark({ size = 26, onDark = true, className }: BrandMarkProps) {
  const blockColor = onDark ? '#c3e6ff' : '#071633';
  const accentColor = onDark ? '#f3efe3' : '#c5d5e0';

  return (
    <svg
      className={className}
      width={size * (22 / 34)}
      height={size}
      viewBox="0 0 22 34"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <rect x="0" y="0" width="10" height="10" rx="1.6" fill={blockColor} />
      <rect x="12" y="0" width="10" height="10" rx="1.6" fill={accentColor} />
      <rect x="0" y="12" width="10" height="10" rx="1.6" fill={blockColor} />
      <rect x="0" y="24" width="10" height="10" rx="1.6" fill={blockColor} />
      <rect x="12" y="24" width="10" height="10" rx="1.6" fill={accentColor} />
    </svg>
  );
}
