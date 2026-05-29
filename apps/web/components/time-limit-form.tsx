"use client"

import { useState } from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createTimeLimit } from "@/lib/actions/time-limits"

const FormSchema = z.object({
  domain: z
    .string()
    .min(1, "Domain is required")
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      "Invalid domain format",
    ),
  // Empty input becomes null (unconditional block); a positive integer caps daily usage
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="domain">Domain</Label>
        <Input id="domain" placeholder="example.com" {...register("domain")} />
        {errors.domain && (
          <p className="text-sm text-destructive">{errors.domain.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="dailyLimit">Daily Limit (minutes)</Label>
        <Input
          id="dailyLimit"
          type="number"
          placeholder="Leave blank to block entirely"
          {...register("dailyLimit")}
        />
        {errors.dailyLimit && (
          <p className="text-sm text-destructive">{errors.dailyLimit.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending && (
          <span
            data-testid="loading-indicator"
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        Add
      </Button>
    </form>
  )
}