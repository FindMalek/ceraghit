import type { OptionalSetupStepId } from "@workspace/sdk"

/** Extension point: a lane sets `href` once its settings page exists. `null` shows "Bientôt disponible". */
export const OPTIONAL_STEP_UI: Record<OptionalSetupStepId, { title: string; why: string; href: string | null }> = {
  konnect: {
    title: "Paiement par carte (Konnect)",
    why: "Vos clients paient en ligne, l'argent arrive sur votre compte Konnect.",
    href: null,
  },
  aramex: { title: "Livraison Aramex", why: "Calcul des frais et étiquettes automatiques.", href: null },
  payoneer: { title: "Paiement Payoneer", why: "Pour les clients à l'étranger.", href: null },
  groq: { title: "Traduction automatique", why: "Propose les textes en anglais et en arabe.", href: null },
  emailDomain: {
    title: "Adresse d'envoi des emails",
    why: "Les emails partent de commandes@ceraghit.com.",
    href: "/settings",
  },
}
