import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors",
        // Placeholder - lighter, more muted color
        "placeholder:text-muted-foreground/50",
        // Focus state
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        // File input
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // Selection
        "selection:bg-primary/20",
        // Error state
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        // Text size
        "md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
