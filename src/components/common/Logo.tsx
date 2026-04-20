interface LogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Logo({ variant = 'full', size = 'md', className = '' }: LogoProps) {
  const sizes = {
    sm: variant === 'full' ? 'h-10' : 'h-8',
    md: variant === 'full' ? 'h-14' : 'h-10',
    lg: variant === 'full' ? 'h-20' : 'h-16',
    xl: variant === 'full' ? 'h-28' : 'h-24',
  };

  return (
    <img
      src="/img_9286.png"
      alt="EDENTRACK"
      className={`${sizes[size]} ${className}`}
      style={{ objectFit: 'contain' }}
    />
  );
}

export function LogoFull({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const heights = {
    sm: 'h-12',
    md: 'h-16',
    lg: 'h-24',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/img_9286.png"
        alt="EDENTRACK - Professional Farm Management Worldwide"
        className={heights[size]}
        style={{ objectFit: 'contain' }}
      />
    </div>
  );
}

export function LogoIcon({ size = 'md', className = '' }: { size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const heights = {
    xs: 'h-6',
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-12',
  };

  return (
    <img
      src="/img_9286.png"
      alt="EDENTRACK"
      className={`${heights[size]} ${className}`}
      style={{ objectFit: 'contain' }}
    />
  );
}
