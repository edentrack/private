import { useEffect, useRef } from 'react';

interface EdenAvatarAnimatedProps {
  size?: 'sm' | 'md' | 'lg';
  expanded?: boolean;
}

export function EdenAvatarAnimated({ size = 'sm' }: EdenAvatarAnimatedProps) {
  const dim = size === 'lg' ? 64 : size === 'md' ? 36 : 22;
  const id = useRef(`eden-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const styleId = 'eden-cartoon-keyframes';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes eden-blink {
        0%, 92%, 100% { transform: scaleY(1); }
        96%            { transform: scaleY(0.08); }
      }
      @keyframes eden-bob {
        0%, 100% { transform: translateY(0px); }
        50%      { transform: translateY(-1.5px); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0, animation: 'eden-bob 3.5s ease-in-out infinite' }}
    >
      {/* Background */}
      <circle cx="20" cy="20" r="20" fill="#3D5F42" />

      {/* Afro — big dark puff behind head */}
      <ellipse cx="20" cy="14" rx="12" ry="11" fill="#1a0900" />
      {/* Afro side puffs for volume */}
      <ellipse cx="9"  cy="17" rx="5"  ry="7"  fill="#1a0900" />
      <ellipse cx="31" cy="17" rx="5"  ry="7"  fill="#1a0900" />

      {/* Neck */}
      <rect x="17" y="30" width="6" height="5" rx="2" fill="#6B3A1F" />

      {/* Face */}
      <ellipse cx="20" cy="22" rx="9.5" ry="10.5" fill="#8B4513" />

      {/* Forehead highlight — subtle */}
      <ellipse cx="20" cy="15" rx="5" ry="3" fill="#A0522D" opacity="0.4" />

      {/* Left eye white */}
      <ellipse cx="15.8" cy="20.5" rx="2.6" ry="2.2" fill="white" />
      {/* Left pupil + iris */}
      <circle cx="15.8" cy="20.5" r="1.4" fill="#1a0900" />
      <circle cx="16.3" cy="19.9" r="0.45" fill="white" opacity="0.9" />
      {/* Left eyelid blink */}
      <ellipse
        cx="15.8" cy="20.5" rx="2.6" ry="2.2" fill="#8B4513"
        style={{
          transformOrigin: '15.8px 18.3px',
          animation: 'eden-blink 4s ease-in-out infinite',
        }}
      />

      {/* Right eye white */}
      <ellipse cx="24.2" cy="20.5" rx="2.6" ry="2.2" fill="white" />
      {/* Right pupil + iris */}
      <circle cx="24.2" cy="20.5" r="1.4" fill="#1a0900" />
      <circle cx="24.7" cy="19.9" r="0.45" fill="white" opacity="0.9" />
      {/* Right eyelid blink */}
      <ellipse
        cx="24.2" cy="20.5" rx="2.6" ry="2.2" fill="#8B4513"
        style={{
          transformOrigin: '24.2px 18.3px',
          animation: 'eden-blink 4s ease-in-out infinite',
        }}
      />

      {/* Eyebrows */}
      <path d="M13.2 17.8 Q15.8 16.5 18 17.5" stroke="#1a0900" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M22 17.5 Q24.2 16.5 26.8 17.8" stroke="#1a0900" strokeWidth="1.1" strokeLinecap="round" fill="none" />

      {/* Nose */}
      <ellipse cx="20" cy="24" rx="1.2" ry="0.8" fill="#6B2F0D" opacity="0.6" />

      {/* Smile */}
      <path d="M16.5 27 Q20 30 23.5 27" stroke="#5C1F0A" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      {/* Lip fill */}
      <path d="M17 27.3 Q20 29.5 23 27.3 Q20 28.5 17 27.3Z" fill="#7B2D1A" opacity="0.7" />

      {/* Small gold earrings */}
      <circle cx="10.8" cy="23" r="1" fill="#F5A623" />
      <circle cx="29.2" cy="23" r="1" fill="#F5A623" />

      {/* Collar / top of shirt — green to blend with bg */}
      <path d="M11 37 Q14 33 17 35 Q20 36.5 23 35 Q26 33 29 37" fill="#2d4a31" />
    </svg>
  );
}
