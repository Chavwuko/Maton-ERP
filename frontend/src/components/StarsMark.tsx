// The three rising stars from the Maton logo, in its star green.
const STAR = '12,1 15,9 23,9 17,14 19,22 12,17.5 5,22 7,14 1,9 9,9';

export function StarsMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size * 3 + 8} height={size + 6} viewBox={`0 0 ${size * 3 + 8} ${size + 6}`} role="img" aria-label="Maton stars">
      {[0.6, 0.8, 1].map((scale, index) => (
        <polygon
          key={scale}
          points={STAR}
          fill="#00a75a"
          transform={`translate(${index * (size + 4)} ${(1 - scale) * size + 3}) scale(${(size / 24) * scale})`}
        />
      ))}
    </svg>
  );
}
