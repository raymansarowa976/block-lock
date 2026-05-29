"use client"

import { useState } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { createSchedule } from "@/lib/actions/schedules"

const DAYS = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
]

const HHMMTime = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM format")

const FormSchema = z.object({
  startTime: HHMMTime,
  endTime: HHMMTime,
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, "At least one day required"),
})

type FormValues = z.infer<typeof FormSchema>

interface ScheduleFormProps {
  timeLimitId: string
}

export function ScheduleForm({ timeLimitId }: ScheduleFormProps) {
  const [isPending, setIsPending] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { startTime: "", endTime: "", daysOfWeek: [] },
  })

  async function onSubmit(data: FormValues) {
    setIsPending(true)
    await createSchedule({ timeLimitId, ...data })
    setIsPending(false)
    reset()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="startTime">Start Time</Label>
        <Input id="startTime" type="text" placeholder="09:00" {...register("startTime")} />
        {errors.startTime && (
          <p className="text-sm text-destructive">{errors.startTime.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="endTime">End Time</Label>
        <Input id="endTime" type="text" placeholder="17:00" {...register("endTime")} />
        {errors.endTime && (
          <p className="text-sm text-destructive">{errors.endTime.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Days of Week</p>
        <div className="flex gap-3">
          <Controller
            name="daysOfWeek"
            control={control}
            render={({ field }) => (
              <>
                {DAYS.map((day) => (
                  <div key={day.value} className="flex flex-col items-center gap-1">
                    <Checkbox
                      checked={field.value.includes(day.value)}
                      onCheckedChange={(checked) => {
                        field.onChange(
                          checked
                            ? [...field.value, day.value]
                            : field.value.filter((d) => d !== day.value),
                        )
                      }}
                    />
                    <span className="text-xs">{day.label}</span>
                  </div>
                ))}
              </>
            )}
          />
        </div>
        {errors.daysOfWeek && (
          <p className="text-sm text-destructive">{errors.daysOfWeek.message}</p>
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
        Save
      </Button>
    </form>
  )
}