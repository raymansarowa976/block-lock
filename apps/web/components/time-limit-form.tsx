"use client"

import { useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTimeLimit } from "@/lib/actions/time-limits"

const FormSchema = z.object({
  domain: z
    .string()
    .min(1, "Website address is required")
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      "Invalid website address",
    ),
  dailyLimit: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  isActive: z.boolean(),
})

type FormValues = z.output<typeof FormSchema>

export function TimeLimitForm() {
  const [isPending, setIsPending] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as Resolver<FormValues>,
    defaultValues: { domain: "", dailyLimit: null, isActive: true },
  })

  async function onSubmit(data: FormValues) {
    setIsPending(true)
    await createTimeLimit(data)
    setIsPending(false)
    reset()
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-red-100">
          <ShieldCheck className="size-4 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Block a Website</h2>
          <p className="text-xs text-slate-500">Restrict access or set a daily time limit</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="domain" className="text-slate-700">Website</Label>
          <Input id="domain" placeholder="example.com" {...register("domain")} />
          {errors.domain ? (
            <p className="text-xs text-destructive">{errors.domain.message}</p>
          ) : (
            <p className="text-xs text-slate-400">Enter without https:// or www.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dailyLimit" className="text-slate-700">Daily Limit (minutes)</Label>
          <Input
            id="dailyLimit"
            type="number"
            min={1}
            placeholder="e.g. 30 — leave blank to fully block"
            {...register("dailyLimit")}
          />
          {errors.dailyLimit && (
            <p className="text-xs text-destructive">{errors.dailyLimit.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending && (
            <span
              data-testid="loading-indicator"
              className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
          )}
          Add Website
        </Button>
      </form>
    </div>
  )
}