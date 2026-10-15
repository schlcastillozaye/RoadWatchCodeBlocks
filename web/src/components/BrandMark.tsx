interface BrandMarkProps {
  size?: number;
  onDark?: boolean;
  className?: string;
}

/**
 * The Code Blocks Inc. symbol — a column of three rounded squares with two
 * smaller accent squares beside the top and bottom blocks (the middle-right
 * slot stays empty, forming a "C" out of blocks).
 */
export function BrandMark({ size = 26, onDark = true, className }: BrandMarkProps) {
  const blockColor = onDark ? '#c3e6ff' : '#071633';
  const accentColor = onDark ? '#f3efe3' : '#c5d5e0';

  const gap = size * 0.16;
  const radius = size * 0.32;
  const accentSize = size * 0.62;

  const square = (dimension: number, color: string) => (
    <div style={{ width: dimension, height: dimension, borderRadius: radius * (dimension / size), background: color }} />
  );

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'flex-start', gap: gap * 0.85 }} aria-hidden="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {square(size, blockColor)}
        {square(size, blockColor)}
        {square(size, blockColor)}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: size * 3 + gap * 2,
        }}
      >
        {square(accentSize, accentColor)}
        {/* middle-right slot intentionally empty */}
        {square(accentSize, accentColor)}
      </div>
    </div>
  );
}
