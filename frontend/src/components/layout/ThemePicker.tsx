import { useState, useRef, useEffect } from 'react'
import { cn } from '../../utils/cn'
import { useThemeStore, THEME_LIST, ThemeId } from '../../stores/themeStore'
import { Palette, Check } from 'lucide-react'

export default function ThemePicker() {
  const theme = useThemeStore((s) => s.theme)
  const resolvedMode = useThemeStore((s) => s.resolvedMode)
  const setTheme = useThemeStore((s) => s.setTheme)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return

    const currentIndex = THEME_LIST.findIndex((t) => t.id === theme)
    let nextIndex = currentIndex !== -1 ? currentIndex : 0

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % THEME_LIST.length
      optionRefs.current[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + THEME_LIST.length) % THEME_LIST.length
      optionRefs.current[nextIndex]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const currentThemeConfig = THEME_LIST.find((t) => t.id === theme) || THEME_LIST[0]

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-xl text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all border border-transparent hover:border-border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary cursor-pointer"
        aria-label={`Select theme, current theme is ${currentThemeConfig.name}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Palette className="h-4.5 w-4.5 text-brand-primary" />
        <span className="hidden md:inline-block text-xs font-bold text-text-primary">
          {currentThemeConfig.name}
        </span>
        <span
          className="h-2.5 w-2.5 rounded-full border border-border-secondary hidden sm:inline-block"
          style={{ backgroundColor: currentThemeConfig.swatch.accent }}
        />
      </button>

      {/* Popover Menu */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-[380px] bg-widget-bg border border-widget-border rounded-2xl shadow-lg p-3 z-[1000] max-h-[85vh] overflow-y-auto scrollbar-thin"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-border-primary px-1">
            <div>
              <h3 className="font-extrabold text-xs text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-brand-primary" />
                Select Visual Theme
              </h3>
              <p className="text-[11px] text-text-tertiary">
                Active: <strong className="text-text-secondary">{currentThemeConfig.name}</strong> ({resolvedMode} mode)
              </p>
            </div>
          </div>

          {/* Radio Group */}
          <div
            role="radiogroup"
            aria-label="Color themes"
            className="space-y-1.5"
          >
            {THEME_LIST.map((t, idx) => {
              const isSelected = theme === t.id
              return (
                <button
                  key={t.id}
                  ref={(el) => { optionRefs.current[idx] = el }}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setTheme(t.id as ThemeId)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all cursor-pointer border',
                    isSelected
                      ? 'bg-brand-primary/10 border-brand-primary/40 text-text-primary shadow-2xs'
                      : 'bg-bg-tertiary/40 border-transparent hover:bg-bg-hover hover:border-border-primary text-text-secondary'
                  )}
                >
                  {/* Swatch Preview Box */}
                  <div
                    className="w-12 h-10 rounded-lg p-1 border border-black/10 dark:border-white/10 flex flex-col justify-between shrink-0 shadow-2xs relative overflow-hidden"
                    style={{ backgroundColor: t.swatch.bg }}
                  >
                    <div
                      className="w-full h-4 rounded-xs border border-black/5 dark:border-white/5 flex items-center justify-end px-1"
                      style={{ backgroundColor: t.swatch.surface }}
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: t.swatch.accent }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <div
                        className="h-1.5 w-full rounded-full"
                        style={{ backgroundColor: t.swatch.accent }}
                      />
                    </div>
                  </div>

                  {/* Theme Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-text-primary truncate">
                        {t.name}
                      </span>
                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider',
                          t.mode === 'auto'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : t.mode === 'dark'
                            ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                        )}
                      >
                        {t.mode === 'auto' ? 'Auto' : t.mode}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-tertiary truncate mt-0.5">
                      {t.description}
                    </p>
                  </div>

                  {/* Active Indicator */}
                  {isSelected && (
                    <div className="h-6 w-6 rounded-full bg-brand-primary text-brand-accent-contrast flex items-center justify-center shrink-0 shadow-2xs">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
