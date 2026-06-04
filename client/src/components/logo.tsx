interface LogoProps {
  size?: number
  className?: string
}

export function LogoIcon({ size = 40, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="BIM FIRE HIDRO CALC Logo"
    >
      <rect width="40" height="40" rx="8" fill="#1a3a6b" />
      {/* Flame */}
      <path
        d="M20 7C20 7 14 14 14 20.5C14 24.09 16.69 27 20 27C23.31 27 26 24.09 26 20.5C26 16 22 12 22 12C22 12 22 15 20 16C18 17 17 15.5 17 14C17 11 20 7 20 7Z"
        fill="#ef4444"
      />
      {/* Water drop */}
      <path
        d="M20 19C20 19 17.5 22 17.5 24C17.5 25.38 18.62 26.5 20 26.5C21.38 26.5 22.5 25.38 22.5 24C22.5 22 20 19 20 19Z"
        fill="white"
      />
    </svg>
  )
}

export function LogoFull({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoIcon size={40} />
      <div>
        <div className="font-bold text-sm leading-tight text-foreground tracking-wide">
          BIM FIRE HIDRO CALC
        </div>
        <div className="text-xs text-muted-foreground leading-tight">
          Cálculo de Hidrantes — NBR 5626 / NPT 022
        </div>
      </div>
    </div>
  )
}
