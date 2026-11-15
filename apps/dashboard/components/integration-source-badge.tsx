import type { MaskedIntegration } from "@workspace/sdk"
import { Badge } from "@workspace/ui/components/badge"

const LABELS: Record<MaskedIntegration["source"], string> = {
  db: "Enregistrée dans le tableau de bord",
  env: "Valeur du serveur (variable d'environnement)",
  none: "Non configurée",
}

export function IntegrationSourceBadge({ source }: { source: MaskedIntegration["source"] }) {
  return <Badge variant={source === "none" ? "outline" : "secondary"}>{LABELS[source]}</Badge>
}
