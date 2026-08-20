import { useState, useId } from 'react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

const sizes = {
  sm: { img: 'h-20 w-auto max-w-[210px]', text: 'text-base', icon: 24 },
  md: { img: 'h-28 w-auto max-w-[240px]', text: 'text-xl',  icon: 34 },
  lg: { img: 'h-44 w-auto max-w-[400px]', text: 'text-3xl', icon: 50 },
}

function EggplantMark({ size }: { size: number }) {
  const uid = useId().replace(/:/g, '')
  const w = Math.round(size * 0.83)

  return (
    <svg width={w} height={size} viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`bg-${uid}`} x1="10" y1="10" x2="30" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c4b5fd" />
          <stop offset="45%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b0764" />
        </linearGradient>
        <radialGradient id={`hl-${uid}`} cx="38%" cy="30%" r="45%">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="31" rx="14" ry="17" fill={`url(#bg-${uid})`} />
      <ellipse cx="20" cy="31" rx="14" ry="17" fill={`url(#hl-${uid})`} />
      <path
        d="M20 14C13.5 9 7 12.5 10.5 19.5C12.5 23 20 19.5 20 19.5C20 19.5 27.5 23 29.5 19.5C33 12.5 26.5 9 20 14Z"
        fill="#166534"
      />
      <line x1="20" y1="14" x2="24" y2="4" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const [imgError, setImgError] = useState(false)
  const s = sizes[size]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {!imgError ? (
        <img
          src="/api/v1/branding/logo"
          alt="AUDITCHECK"
          className={s.img}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center gap-2.5">
          <span className="block leading-none">
            <EggplantMark size={s.icon} />
          </span>
          {showText && (
            <span className={`font-bold ${s.text} text-text-primary tracking-tight`}>
              AUDIT<span className="text-primary">CHECK</span>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
