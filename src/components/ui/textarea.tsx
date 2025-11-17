import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Base styles
        "flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors",
        // Placeholder - lighter, more muted color (consistent with Input)
        "placeholder:text-muted-foreground/50",
        // Focus state
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        // Selection
        "selection:bg-primary/20",
        // Error state
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        // Text size
        "md:text-sm",
        // Field sizing
        "field-sizing-content",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
