import type { Config } from 'tailwindcss'

const withAlpha = (cssVar: string) => `hsl(var(${cssVar}) / <alpha-value>)`

const scale = (prefix: string) => ({
  50: withAlpha(`--color-${prefix}-50`),
  100: withAlpha(`--color-${prefix}-100`),
  200: withAlpha(`--color-${prefix}-200`),
  300: withAlpha(`--color-${prefix}-300`),
  400: withAlpha(`--color-${prefix}-400`),
  500: withAlpha(`--color-${prefix}-500`),
  600: withAlpha(`--color-${prefix}-600`),
  700: withAlpha(`--color-${prefix}-700`),
  800: withAlpha(`--color-${prefix}-800`),
  900: withAlpha(`--color-${prefix}-900`),
  950: withAlpha(`--color-${prefix}-950`),
})

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: withAlpha('--color-bg'),
        'bg-muted': withAlpha('--color-bg-muted'),
        surface: withAlpha('--color-surface'),
        'surface-muted': withAlpha('--color-surface-muted'),
        panel: withAlpha('--color-panel'),
        text: withAlpha('--color-text'),
        muted: withAlpha('--color-text-muted'),
        border: withAlpha('--color-border'),
        ring: withAlpha('--color-ring'),
        primary: withAlpha('--color-primary'),
        'primary-hover': withAlpha('--color-primary-hover'),
        'primary-active': withAlpha('--color-primary-active'),
        'primary-foreground': withAlpha('--color-primary-foreground'),
        secondary: withAlpha('--color-secondary'),
        'secondary-hover': withAlpha('--color-secondary-hover'),
        'secondary-active': withAlpha('--color-secondary-active'),
        'secondary-foreground': withAlpha('--color-secondary-foreground'),
        accent: withAlpha('--color-accent'),
        'status-success': withAlpha('--color-status-success'),
        'status-danger': withAlpha('--color-status-danger'),
        'status-warning': withAlpha('--color-status-warning'),
        'status-info': withAlpha('--color-status-info'),
        gray: scale('neutral'),
        slate: scale('neutral'),
        neutral: scale('neutral'),
        blue: scale('primary'),
        sky: scale('primary'),
        cyan: scale('primary'),
        indigo: scale('primary'),
      },
    },
  },
  plugins: [],
}
export default config
