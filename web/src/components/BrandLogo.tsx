import { BRAND } from '../lib/config';
import { BrandMark } from './BrandMark';

interface BrandLogoProps {
  onDark?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

const SIZES = {
  sm: { mark: 16, title: '1.05rem' },
  md: { mark: 22, title: '1.4rem' },
  lg: { mark: 32, title: '2rem' },
} as const;

export function BrandLogo({ onDark = true, size = 'md', showTagline = false }: BrandLogoProps) {
  const config = SIZES[size];
  const titleColor = onDark ? '#f7fbff' : '#071633';
  const subtitleColor = onDark ? '#c3e6ff' : '#3d4b63';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'lg' ? 16 : 11 }}>
      <BrandMark size={config.mark} onDark={onDark} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: config.title,
            letterSpacing: '-0.02em',
            color: titleColor,
          }}
        >
          {BRAND.product}
        </span>
        {showTagline && (
          <span style={{ fontSize: '0.7rem', fontWeight: 500, color: subtitleColor, marginTop: 3 }}>
            by {BRAND.company}
          </span>
        )}
      </div>
    </div>
  );
}
