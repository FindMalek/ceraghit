import { ORPCError } from "@orpc/client"

export { isUnauthorized } from "@workspace/orpc/errors"

const KNOWN: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Only compressed WebP images are accepted\.?$/, () => "L'image n'a pas pu être vérifiée. Réessayez l'envoi."],
  [
    /^(The upload has not arrived yet|Could not check the upload|Upload already in progress)/,
    () => "Envoi pas encore vérifiable. Réessayez dans un instant.",
  ],
  [/^Media not found\.?$/, () => "Image introuvable."],
  [
    /^A photo is no longer available\.?$/,
    () => "Une photo n'existe plus dans la médiathèque. Retirez-la puis enregistrez.",
  ],
  [/^Each photo can only be added once\.?$/, () => "Chaque photo ne peut être ajoutée qu'une fois."],
  [
    /^This image is still in use\.?$/,
    () => "Cette image est encore utilisée. Retirez-la d'abord des pages qui l'affichent.",
  ],
  [/^This image ships with the site/, () => "Cette image fait partie du site et ne peut pas être supprimée."],
  [/^This slot needs at least one visible image\.?$/, () => "Cet emplacement doit garder au moins une image visible."],
  [/^Too many images for this slot\.?$/, () => "Trop d'images pour cet emplacement."],
  [/^A photo is no longer available\.?$/, () => "Une photo n'est plus disponible."],
  [/^Invalid file name\.?$/, () => "Nom de fichier invalide."],
  [/^Too many deletions/, () => "Trop de suppressions, réessayez dans quelques minutes."],
  [/^Email introuvable\.?$/, () => "Email introuvable."],
  [/^Wrong current password\.?$/, () => "Le mot de passe actuel est incorrect."],
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
  [
    /^An unpaid order cannot be refunded/,
    () => "Une commande non payée ne peut pas être remboursée, annulez-la plutôt.",
  ],
  [/^This order cannot be marked paid/, () => "Cette commande ne peut pas être marquée payée."],
  [/^Use a link from payoneer\.com/, () => "Utilisez un lien de payoneer.com."],
  [
    /^A payment link can only be set on a pending Payoneer order/,
    () => "Un lien de paiement ne peut être ajouté qu'à une commande Payoneer en attente de paiement.",
  ],
  [
    /^Payoneer uses one shop-wide link/,
    () => "Payoneer utilise un seul lien pour toute la boutique : les liens par commande sont désactivés.",
  ],
  [/^This link is already used on another order/, () => "Ce lien est déjà utilisé sur une autre commande."],
  [/^Card payments are confirmed by the gateway only/, () => "Un paiement par carte est confirmé automatiquement."],
  [/^The amount changed, reload the order/, () => "Le montant a changé, rechargez la commande."],
  [/^The storage space is full/, () => "L'espace de stockage (2,5 Go) est plein. Supprimez des photos inutilisées."],
  [/^Image storage is not configured/, () => "Le stockage des images n'est pas configuré ici."],
  [/^Only paid orders get an invoice/, () => "Seules les commandes payées reçoivent une facture."],
  [/^Some required steps are not complete/, () => "Terminez d'abord les étapes obligatoires."],
  [/^Commande introuvable\.?$/, () => "Commande introuvable."],
  [/^Expédition introuvable\.?$/, () => "Expédition introuvable."],
  [/^Enlèvement introuvable\.?$/, () => "Enlèvement introuvable."],
  [
    /^(Seuls les colis dont|Un de ces colis|Choisissez des colis|La fenêtre d'enlèvement|Ce colis est dans un enlèvement|Le colis est déjà chez Aramex|Cette expédition a été créée|Une création d'expédition|L'enlèvement n|Trop d'actualisations)/,
    (m) => m.input ?? "",
  ],
  [
    /^(Une expédition existe déjà|Aramex n'a pas répondu|Ce colis dépasse|Le pays du destinataire|L'étiquette n'a pas pu|Aramex n'est pas configuré|Ajoutez le code douanier|La valeur déclarée doit|La facture commerciale n'a pas|Facture commerciale indisponible|Le paiement à la livraison n'(?:existe|est possible)|Étiquette indisponible|Aramex a refusé|Aramex ne répond pas|Réponse inattendue d'Aramex|Identifiants Aramex refusés|Le transporteur est momentanément|Les informations d'expédition|Cette action n'est pas disponible)/,
    (m) => m.input ?? "",
  ],
  [/^(Code postal invalide|Le code postal est obligatoire)/, (m) => m.input ?? ""],
  [/^Cette commande ne peut pas être expédiée/, (m) => m.input ?? ""],
  [/^Seule une commande expédiée/, (m) => m.input ?? ""],
  [/^Le lien de suivi doit commencer/, (m) => m.input ?? ""],
  [/^Champ inconnu\.?$/, (m) => m.input ?? ""],
  [/^Les clés enregistrées sont illisibles/, (m) => m.input ?? ""],
  [/^Réglage invalide\.?$/, (m) => m.input ?? ""],
  [
    /^(Renseignez |Le mode réel Aramex|Confirmez les types|Les identifiants enregistrés ne peuvent|Trop d'essais)/,
    (m) => m.input ?? "",
  ],
  [/^Le coffre des clés n'est pas configuré/, (m) => m.input ?? ""],
  [/^Au moins un moyen de paiement doit rester actif/, (m) => m.input ?? ""],
  [
    /^(Ajoutez une clé Groq|Écrivez d'abord le texte|Toutes les langues sont déjà|Limite mensuelle de traduction|Le service de traduction)/,
    (m) => m.input ?? "",
  ],
  [/^Card payment is not available/, () => "Le paiement par carte n'est pas disponible."],
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
