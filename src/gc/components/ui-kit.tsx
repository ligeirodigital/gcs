import { forwardRef, useId, type ReactNode } from 'react'
import { AlertCircle, Loader2, type LucideIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive bg-card px-4 py-10 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="max-w-md text-sm">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary"><Icon className="h-5 w-5 text-muted-foreground" aria-hidden /></span>
      <h2 className="text-base font-medium">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> { label: string; error?: string; hint?: string }
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, ...props }, ref) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} ref={ref} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...props} />
      {hint && !error && <p id={`${id}-h`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-e`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
})

export function FieldShell({ label, error, htmlFor, children }: { label: string; error?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function SubmitButton({ loading, children, ...p }: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button type="submit" disabled={loading || p.disabled} {...p}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}{children}
    </Button>
  )
}

export const ColorField = forwardRef<HTMLInputElement, { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  function ColorField({ label, error, ...p }, ref) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium leading-none">{label}
          <input ref={ref} type="color" className="mt-1.5 block h-10 w-full cursor-pointer rounded-md border border-border bg-background p-1" {...p} /></label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
    )
  })


/** Alternância entre modos (ex.: mês/semana). Botões com aria-pressed: não exige painéis de abas. */
export function SegmentedControl<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-secondary p-1">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === k ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>))}
    </div>
  )
}
