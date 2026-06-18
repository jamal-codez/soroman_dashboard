import * as React from "react"
import { Input } from "@/components/ui/input"

export interface CommaInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** Raw numeric string (no commas), e.g. "1234.5" */
  value: string
  /** Receives the raw numeric string (no commas) on every keystroke */
  onValueChange: (raw: string) => void
}

/**
 * Text input that displays its numeric value with thousand separators
 * while typing, but reports the raw unformatted value via onValueChange.
 * Use for any monetary amount or quantity figure — not for account
 * numbers, phone numbers, references, or other identifiers.
 */
const CommaInput = React.forwardRef<HTMLInputElement, CommaInputProps>(
  ({ value, onValueChange, ...props }, ref) => {
    const display = (() => {
      if (!value) return ""
      const dotIdx = value.indexOf(".")
      if (dotIdx === -1) {
        const n = Number(value)
        return Number.isFinite(n) ? n.toLocaleString() : value
      }
      // Preserve the decimal part exactly as typed (incl. trailing zeros
      // and a trailing dot) — only the integer part gets comma-grouped.
      const intPart = value.slice(0, dotIdx)
      const decPart = value.slice(dotIdx + 1)
      const n = Number(intPart || "0")
      const formattedInt = Number.isFinite(n) ? n.toLocaleString() : intPart
      return `${formattedInt}.${decPart}`
    })()

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          let raw = e.target.value.replace(/[^0-9.]/g, "")
          const firstDot = raw.indexOf(".")
          if (firstDot !== -1) {
            raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "")
          }
          onValueChange(raw)
        }}
        {...props}
      />
    )
  }
)
CommaInput.displayName = "CommaInput"

export { CommaInput }
