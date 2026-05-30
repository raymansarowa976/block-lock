"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { createSchedule } from "@/lib/actions/schedules"

const DAYS = [
  { label: "S", value: 0, full: "Sunday" },
  { label: "M", value: 1, full: "Monday" },
  { label: "T", value: 2, full: "Tuesday" },
  { label: "W", value: 3, full: "Wednesday" },
  { label: "T", value: 4, full: "Thursday" },
  { label: "F", value: 5, full: "Friday" },
  { label: "S", value: 6, full: "Saturday" },
]

const HHMMTime = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")

const FormSchema = z.object({
  timeLimitId: z.string().min(1, "Select a website"),
  startTime: HHMMTime,
  endTime: HHMMTime,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "Select at least one day"),
})

type FormValues = z.infer<typeof FormSchema>

type TimeLimit = { id: string; domain: string }

interface ScheduleFormProps {
  timeLimits: TimeLimit[]
}

export function ScheduleForm({ timeLimits }: ScheduleFormProps) {
  const [isPending, setIsPending] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { timeLimitId: "", startTime: "", endTime: "", daysOfWeek: [] },
  })

  async function onSubmit(data: FormValues) {
    setIsPending(true)
    await createSchedule(data)
    setIsPending(false)
    reset()
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-5">
        <h2 className="font-semibold">Add a Schedule</h2>
        <p className="text-xs text-muted-foreground">
          Block a website during specific hours and days
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="timeLimitId">Website</Label>
          <select
            id="timeLimitId"
            {...register("timeLimitId")}
            className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
          >
            <option value="">Select a website…</option>
            {timeLimits.map((t) => (
              <option key={t.id} value={t.id}>
                {t.domain}
              </option>
            ))}
          </select>
          {errors.timeLimitId && (
            <p className="text-xs text-destructive">{errors.timeLimitId.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="startTime">Start Time</Label>
            <Input id="startTime" type="time" {...register("startTime")} />
            {errors.startTime && (
              <p className="text-xs text-destructive">{errors.startTime.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endTime">End Time</Label>
            <Input id="endTime" type="time" {...register("endTime")} />
            {errors.endTime && (
              <p className="text-xs text-destructive">{errors.endTime.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Days</Label>
          <Controller
            name="daysOfWeek"
            control={control}
            render={({ field }) => (
              <div className="flex gap-1.5">
                {DAYS.map((day) => {
                  const isActive = field.value.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      title={day.full}
                      aria-label={day.full}
                      aria-pressed={isActive}
                      onClick={() =>
                        field.onChange(
                          isActive
                            ? field.value.filter((d) => d !== day.value)
                            : [...field.value, day.value],
                        )
                      }
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>
            )}
          />
          {errors.daysOfWeek && (
            <p className="text-xs text-destructive">{errors.daysOfWeek.message}</p>
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
          Save Schedule
        </Button>
      </form>
    </div>
  )
}