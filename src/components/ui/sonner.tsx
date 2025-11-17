"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: (
          <div className="p-1 rounded-md bg-gradient-to-br from-green-400 to-emerald-500">
            <CircleCheckIcon className="size-3 text-white" />
          </div>
        ),
        info: (
          <div className="p-1 rounded-md bg-gradient-to-br from-blue-400 to-cyan-500">
            <InfoIcon className="size-3 text-white" />
          </div>
        ),
        warning: (
          <div className="p-1 rounded-md bg-gradient-to-br from-yellow-400 to-orange-500">
            <TriangleAlertIcon className="size-3 text-white" />
          </div>
        ),
        error: (
          <div className="p-1 rounded-md bg-gradient-to-br from-red-400 to-rose-500">
            <OctagonXIcon className="size-3 text-white" />
          </div>
        ),
        loading: (
          <div className="p-1 rounded-md bg-gradient-to-br from-primary to-blue-500">
            <Loader2Icon className="size-3 text-white animate-spin" />
          </div>
        ),
      }}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: "group toast group-[.toaster]:bg-gradient-to-br group-[.toaster]:from-background group-[.toaster]:via-background/95 group-[.toaster]:to-primary/5 group-[.toaster]:border-0 group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-sm",
          title: "group-[.toast]:font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-t-2 group-[.toaster]:border-t-green-500",
          error: "group-[.toaster]:border-t-2 group-[.toaster]:border-t-red-500",
          warning: "group-[.toaster]:border-t-2 group-[.toaster]:border-t-yellow-500",
          info: "group-[.toaster]:border-t-2 group-[.toaster]:border-t-blue-500",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
