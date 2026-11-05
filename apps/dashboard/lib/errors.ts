import { ORPCError } from "@orpc/client"

export { isUnauthorized } from "@workspace/orpc/errors"

const KNOWN: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Wrong email or password\.?$/, () => "Email ou mot de passe incorrect."],
  [/^Too many attempts/, () => "Trop de tentatives. Réessayez dans 15 minutes."],
  [/^Reference (.+) already exists\.?$/, (m) => `La référence ${m[1]} existe déjà.`],
  [
    /^Move or delete the products in this category first\.?$/,
    () => "Déplacez ou supprimez d'abord les produits de cette catégorie.",
  ],
  [
    /^(Product|Category|Location|Order) not found\.?$/,
    (m) =>
      ({ Product: "Produit", Category: "Catégorie", Location: "Adresse", Order: "Commande" })[m[1] as "Product"] +
      " introuvable.",
  ],
  [/^An order that is (\w+) cannot become (\w+)\.?$/, () => "Cette commande ne peut pas passer à ce statut."],
  [/^The storage space is full/, () => "L'espace de stockage (2,5 Go) est plein. Supprimez des photos inutilisées."],
  [/^Image storage is not configured/, () => "Le stockage des images n'est pas configuré ici."],
  [/^Cash on delivery is only available/, () => "Le paiement à la livraison n'est disponible qu'en Tunisie."],
]

/** French text for the owner: known server messages are translated, crashes and unknown ones get a generic line. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ORPCError)) return "Une erreur est survenue. Réessayez."
  if (error.code === "BAD_REQUEST" && /validation/i.test(error.message))
    return "Certains champs sont invalides. Vérifiez le formulaire."
  for (const [pattern, translate] of KNOWN) {
    const match = error.message.match(pattern)
    if (match) return translate(match)
  }
  if (error.code === "UNAUTHORIZED") return "Session expirée. Reconnectez-vous."
  return "Une erreur est survenue. Réessayez."
}
