import type { Metadata } from "next"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = { title: "Connexion" }

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-center px-4 py-10">
      <div className="w-full">
        <LoginForm />
      </div>
    </main>
  )
}
