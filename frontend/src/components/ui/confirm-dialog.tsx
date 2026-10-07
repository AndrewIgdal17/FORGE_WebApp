import { useEffect, useId, useRef, useState, type ReactElement } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: "default" | "destructive"
  suppressKey?: string
}

function isSuppressed(suppressKey: string | undefined): boolean {
  if (!suppressKey) return false
  try {
    return localStorage.getItem(suppressKey) === "true"
  } catch {
    return false
  }
}

function writeSuppressed(suppressKey: string): void {
  try {
    localStorage.setItem(suppressKey, "true")
  } catch {
    // Private mode or blocked storage — still confirm.
  }
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  variant = "default",
  suppressKey,
}: ConfirmDialogProps): ReactElement {
  const checkboxId = useId()
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const handledRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  const onOpenChangeRef = useRef(onOpenChange)
  onConfirmRef.current = onConfirm
  onOpenChangeRef.current = onOpenChange

  const suppressed = isSuppressed(suppressKey)
  const visible = open && !suppressed

  useEffect(() => {
    if (!open) {
      handledRef.current = false
      return
    }
    if (!suppressed || handledRef.current) return
    handledRef.current = true
    onConfirmRef.current()
    onOpenChangeRef.current(false)
  }, [open, suppressed])

  useEffect(() => {
    if (visible) setDontShowAgain(false)
  }, [visible])

  function handleConfirm(): void {
    if (suppressKey && dontShowAgain) writeSuppressed(suppressKey)
    onOpenChange(false)
    onConfirm()
  }

  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {suppressKey ? (
          <Label htmlFor={checkboxId} className="font-normal text-muted-foreground">
            <Checkbox
              id={checkboxId}
              checked={dontShowAgain}
              onCheckedChange={setDontShowAgain}
            />
            Don&apos;t show again
          </Label>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
