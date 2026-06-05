"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Clock, CalendarDays } from "lucide-react"
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
  domain: z.string().min(1, "Enter a website"),
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
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { domain: "", startTime: "", endTime: "", daysOfWeek: [] },
  })

  async function onSubmit(data: FormValues) {
    const timeLimit = timeLimits.find((t) => t.domain === data.domain)
    if (!timeLimit) {
      setError("domain", { message: "Website not found in your blocked list" })
      return
    }
    setIsPending(true)
    await createSchedule({ timeLimitId: timeLimit.id, startTime: data.startTime, endTime: data.endTime, daysOfWeek: data.daysOfWeek })
    setIsPending(false)
    reset()
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-red-100">
          <Clock className="size-4 text-red-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Add a Schedule</h2>
          <p className="text-xs text-slate-500">Block a website during specific hours and days</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="domain" className="text-slate-700">Website</Label>
          <Input
            id="domain"
            type="text"
            list="timeLimits-list"
            placeholder="e.g. youtube.com"
            {...register("domain")}
          />
          <datalist id="timeLimits-list">
            {timeLimits.map((t) => (
              <option key={t.id} value={t.domain} />
            ))}
          </datalist>
          {errors.domain && (
            <p className="text-xs text-destructive">{errors.domain.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="startTime" className="text-slate-700">Start Time</Label>
            <Input id="startTime" type="time" {...register("startTime")} />
            {errors.startTime && (
              <p className="text-xs text-destructive">{errors.startTime.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endTime" className="text-slate-700">End Time</Label>
            <Input id="endTime" type="time" {...register("endTime")} />
            {errors.endTime && (
              <p className="text-xs text-destructive">{errors.endTime.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 text-slate-400" />
            <Label className="text-slate-700">Days</Label>
          </div>
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
                        "flex size-9 items-center justify-center rounded-full text-xs font-semibold transition-all duration-150",
                        isActive
                          ? "bg-red-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200",
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