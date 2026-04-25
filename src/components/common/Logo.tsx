// The logo PNG is square with the chicken in the top ~64% and "EDENTRACK" text below.
// CROP_SCALE = 1/0.64 ≈ 1.56 — scaling the image to 156% of its container causes
// overflow:hidden to clip the text, showing only the chicken.
const CROP_SCALE = 1.56;
const LOGO_SRC = '/img_9286.png';

interface LogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  blend?: boolean;
}

// mix-blend-mode: multiply removes the cream background on white/light surfaces
function blendProps(blend: boolean) {
  return blend ? { mixBlendMode: 'multiply' as const } : {};
}

// LogoIcon — shows only the chicken (text cropped out). Use in navbars, avatars, favicons.
export function LogoIcon({ size = 'md', className = '', blend = false }: { size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string; blend?: boolean }) {
  const px = { xs: 24, sm: 32, md: 40, lg: 48 }[size];
  const imgPx = Math.round(px * CROP_SCALE);
  const offset = Math.round((imgPx - px) / 2);

  return (
    <div
      className={className}
      style={{ width: px, height: px, overflow: 'hidden', display: 'inline-block', flexShrink: 0 }}
    >
      <img
        src={LOGO_SRC}
        alt="EDENTRACK"
        width={imgPx}
        height={imgPx}
        style={{ display: 'block', marginLeft: -offset, ...blendProps(blend) }}
      />
    </div>
  );
}

// LogoFull — the complete logo image including text. Use for email headers, print, auth screens.
export function LogoFull({ size = 'md', className = '', blend = false }: { size?: 'sm' | 'md' | 'lg'; className?: string; blend?: boolean }) {
  const heights = { sm: 'h-12', md: 'h-16', lg: 'h-24' };
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={LOGO_SRC}
        alt="EDENTRACK"
        className={`${heights[size]} w-auto`}
        style={{ objectFit: 'contain', ...blendProps(blend) }}
      />
    </div>
  );
}

// Logo — generic variant, kept for backward compatibility
export function Logo({ variant = 'full', size = 'md', className = '', blend = false }: LogoProps) {
  if (variant === 'icon') {
    const iconSize = ({ sm: 'xs', md: 'sm', lg: 'md', xl: 'lg' } as const)[size as 'sm' | 'md' | 'lg' | 'xl'] ?? 'sm';
    return <LogoIcon size={iconSize} className={className} blend={blend} />;
  }
  const heights = { sm: 'h-10', md: 'h-14', lg: 'h-20', xl: 'h-28' };
  return (
    <img
      src={LOGO_SRC}
      alt="EDENTRACK"
      className={`${heights[size]} w-auto ${className}`}
      style={{ objectFit: 'contain', ...blendProps(blend) }}
    />
  );
}
