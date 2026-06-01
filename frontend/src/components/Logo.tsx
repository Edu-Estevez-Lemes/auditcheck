import { useState } from 'react'
import { Shield } from 'lucide-react'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
}

const sizes = {
  sm: { img: 'h-16 w-auto max-w-[180px]', text: 'text-base', icon: 20 },
  md: { img: 'h-20 w-auto max-w-[200px]', text: 'text-xl', icon: 28 },
  lg: { img: 'h-32 w-auto max-w-[280px]', text: 'text-3xl', icon: 40 },
}

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const [imgError, setImgError] = useState(false)
  const s = sizes[size]

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {!imgError ? (
        <img
          src="/api/v1/branding/logo"
          alt="ÃUDITCHECK"
          className={s.img}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Shield size={s.icon} className="text-primary" />
          {showText && (
            <span className={`font-bold ${s.text} text-text-primary tracking-tight`}>
              <span className="text-primary">Ã</span>UDITCHECK
            </span>
          )}
        </div>
      )}
    </div>
  )
}
