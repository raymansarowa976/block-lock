"use client"

import { useState } from "react"
import { deleteUserAccount } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface DangerZoneProps {
  userEmail: string
}

export function DangerZone({ userEmail }: DangerZoneProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [pending, setPending] = useState(false)

  const emailMatches = confirmEmail === userEmail

  async function handleConfirm() {
    setPending(true)
    await deleteUserAccount(confirmEmail)
    setPending(false)
  }

  function handleClose() {
    setIsOpen(false)
    setConfirmEmail("")
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        This action is permanent and cannot be undone. All your data, including
        block rules, schedules, usage logs, and insights will be permanently
        removed.
      </p>
      <Button variant="destructive" onClick={() => setIsOpen(true)}>
        Delete Account
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              Delete Account
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              To confirm, type <strong>{userEmail}</strong> below.
            </p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="confirm-email">Type your email to confirm</Label>
              <Input
                id="confirm-email"
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={userEmail}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={!emailMatches || pending}
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
