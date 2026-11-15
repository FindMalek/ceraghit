import type { Metadata } from "next"
import { MailFailuresView } from "@/components/mail-failures-view"

export const metadata: Metadata = { title: "Emails en échec" }

export default function EmailsPage() {
  return <MailFailuresView />
}
