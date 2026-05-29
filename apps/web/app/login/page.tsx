import { signIn } from "@/auth"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-white">
        Sign in to Block Lock
      </h1>
      <form
        action={async () => {
          "use server"
          await signIn("google", { redirectTo: "/dashboard" })
        }}
      >
        <button
          type="submit"
          className="rounded-md bg-white px-6 py-2 text-sm font-medium text-black hover:bg-gray-100"
        >
          Continue with Google
        </button>
      </form>
    </div>
  )
}