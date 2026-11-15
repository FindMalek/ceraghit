import { ORPCError } from "@orpc/client"

export { isUnauthorized } from "@workspace/orpc/errors"

const KNOWN: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Email introuvable\.?$/, () => "Email introuvable."],
  [/^Wrong email or password\.?$/, () => "Email ou mot de passe incorrect."],
  [/^Too many attempts\. Try again in 1 hour/, () => "Trop de tentatives. Réessayez dans 1 heure."],
  [/^Too many (domain checks|test emails)/, () => "Trop d'essais, réessayez dans quelques minutes."],
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
  [/^This order cannot be marked paid/, () => "Cette commande ne peut pas être marquée payée."],
  [/^Card payments are confirmed by the gateway only/, () => "Un paiement par carte est confirmé automatiquement."],
  [/^The amount changed, reload the order/, () => "Le montant a changé, rechargez la commande."],
  [/^The storage space is full/, () => "L'espace de stockage (2,5 Go) est plein. Supprimez des photos inutilisées."],
  [/^Image storage is not configured/, () => "Le stockage des images n'est pas configuré ici."],
  [/^Only paid orders get an invoice/, () => "Seules les commandes payées reçoivent une facture."],
  [/^Some required steps are not complete/, () => "Terminez d'abord les étapes obligatoires."],
  [/^Au moins un moyen de paiement doit rester actif/, (m) => m.input ?? ""],
  [/^Card payment needs the Konnect live keys/, () => "Ajoutez d'abord vos clés Konnect pour activer la carte."],
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
