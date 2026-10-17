import { BRAND } from '../lib/config';
import { BrandMark } from './BrandMark';

interface BrandLogoProps {
  onDark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

const SIZES = {
  sm: { mark: 24, title: '0.95rem', gap: 9 },
  md: { mark: 38, title: '1.4rem', gap: 11 },
  lg: { mark: 50, title: '2rem', gap: 16 },
} as const;

export function BrandLogo({ onDark = true, size = 'md', showTagline = false }: BrandLogoProps) {
  const config = SIZES[size];
  const titleColor = onDark ? '#f7fbff' : '#071633';
  const subtitleColor = onDark ? '#c3e6ff' : '#3d4b63';

  return (
    <div
      role="img"
      aria-label={`${BRAND.company}${showTagline ? `, ${BRAND.product}` : ''}`}
      style={{ display: 'flex', alignItems: 'center', gap: config.gap }}
    >
      <BrandMark size={config.mark} onDark={onDark} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: config.title,
            letterSpacing: '0.15em',
            color: titleColor,
          }}
        >
          CODEBLOCKS
        </span>
        <span
          style={{
            marginTop: 3,
            fontSize: '0.62rem',
            fontWeight: 500,
            letterSpacing: '0.24em',
            color: subtitleColor,
          }}
        >
          INC.
        </span>
        {showTagline && (
          <span style={{ fontSize: '0.7rem', fontWeight: 500, color: subtitleColor, marginTop: 5 }}>
            {BRAND.product}
          </span>
        )}
      </div>
    </div>
  );
}
