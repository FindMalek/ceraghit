import { z } from "zod"

export const TUTORIAL_AREAS = ["storefront", "checkout", "dashboard", "emails", "setup"] as const
export type TutorialArea = (typeof TUTORIAL_AREAS)[number]

export const TUTORIAL_AREA_LABELS: Record<TutorialArea, string> = {
  storefront: "Boutique",
  checkout: "Commande et suivi",
  dashboard: "Tableau de bord",
  emails: "Emails et automatismes",
  setup: "Mise en route",
}

export const TUTORIAL_AUDIENCES = ["visitor", "customer", "owner"] as const
export type TutorialAudience = (typeof TUTORIAL_AUDIENCES)[number]

export const TUTORIAL_AUDIENCE_LABELS: Record<TutorialAudience, string> = {
  visitor: "Visiteur",
  customer: "Client",
  owner: "Propriétaire",
}

export const TUTORIAL_DEVICES = ["desktop", "mobile"] as const
export type TutorialDevice = (typeof TUTORIAL_DEVICES)[number]

const TAG = /^[\p{Ll}\p{N}][\p{Ll}\p{N} '-]*[\p{Ll}\p{N}]$/u

export const tutorialSchema = z.object({
  /** "<number>-<slug>", also the file name stem in the bucket: tutorials/<id>-desktop.mp4. */
  id: z.string().regex(/^\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1),
  area: z.enum(TUTORIAL_AREAS),
  audience: z.array(z.enum(TUTORIAL_AUDIENCES)).min(1),
  devices: z.array(z.enum(TUTORIAL_DEVICES)).min(1),
  lengthSeconds: z.number().int().min(30).max(150),
  tags: z.array(z.string().regex(TAG)).min(1),
  description: z.string().min(1),
  routes: z.array(z.string().startsWith("/")).optional(),
  /** The feature is not built yet: the card says "Bientôt" and no player is offered. */
  status: z.literal("soon").optional(),
})
export type Tutorial = z.infer<typeof tutorialSchema>

/**
 * The catalogue of tutorial videos, from the feature inventory. Files live in the bucket, never in git.
 * Videos marked `status: "soon"` wait for their feature, remove the status when it ships:
 * 27, 48, 77, 91 Payoneer (#330, link per order #169), 76 Konnect keys (#322), 49 and 92 Aramex shipping and
 * tracking (#192, #195), 68 site photos page (#200, #201).
 */
export const TUTORIALS: readonly Tutorial[] = [
  {
    id: "01-decouvrir-accueil",
    slug: "decouvrir-accueil",
    title: "Découvrir la page d'accueil",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["accueil", "hero", "diaporama", "collection", "pièces à la une", "atelier", "découvrir"],
    description: "Le hero, les pièces à la une, les collections et le bandeau pour une pièce unique.",
  },
  {
    id: "02-naviguer-menu",
    slug: "naviguer-menu",
    title: "Naviguer dans la boutique (en-tête, menu, clavier)",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["menu", "navigation", "en-tête", "logo", "panier"],
    description:
      "L'en-tête qui reste en haut, le menu burger sur téléphone, le logo et le lien d'évitement au clavier.",
  },
  {
    id: "03-changer-langue",
    slug: "changer-langue",
    title: "Changer de langue (français, anglais, arabe)",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["langue", "anglais", "arabe", "traduction", "drapeau", "multilingue"],
    description: "Passer la boutique en français, en anglais ou en arabe depuis le pied de page.",
  },
  {
    id: "04-lire-en-arabe",
    slug: "lire-en-arabe",
    title: "La boutique en arabe (droite à gauche)",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["arabe", "rtl", "droite à gauche", "miroir", "amiri"],
    description: "La boutique miroir en arabe : menu, panier et police adaptés à la lecture de droite à gauche.",
  },
  {
    id: "05-prix-devise-pays",
    slug: "prix-devise-pays",
    title: "Pourquoi je vois des dinars ou des euros",
    area: "storefront",
    audience: ["visitor", "owner"],
    devices: ["desktop"],
    lengthSeconds: 60,
    tags: ["devise", "prix", "dinar", "euro", "tnd", "eur", "pays"],
    description: "Les prix s'affichent en dinars en Tunisie et en euros ailleurs, sans bascule à faire soi-même.",
  },
  {
    id: "06-parcourir-collections",
    slug: "parcourir-collections",
    title: "Parcourir les collections",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["boutique", "catégories", "collection", "curda seca", "lampe votive", "bas-relief"],
    description: "Ouvrir une catégorie (Curda Seca, lampes votives, bas-reliefs) et voir ses pièces.",
  },
  {
    id: "07-rechercher-produit",
    slug: "rechercher-produit",
    title: "Rechercher une pièce",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["recherche", "rechercher", "référence", "nom", "introuvable"],
    description: "Trouver une pièce par sa référence ou son nom, et ce qui s'affiche quand rien ne correspond.",
  },
  {
    id: "08-trier-produits",
    slug: "trier-produits",
    title: "Trier les pièces",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 45,
    tags: ["trier", "prix croissant", "prix décroissant", "nouveautés", "sélection"],
    description: "Classer les pièces par nouveautés, prix croissant ou décroissant.",
  },
  {
    id: "09-fiche-produit-galerie",
    slug: "fiche-produit-galerie",
    title: "La fiche produit et sa galerie photo",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["produit", "fiche", "galerie", "photos", "swipe", "dimensions", "matière"],
    description: "La galerie photo, les dimensions et les informations d'une fiche produit.",
  },
  {
    id: "10-choisir-variante",
    slug: "choisir-variante",
    title: "Choisir une variante (émaillée ou non)",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["variante", "option", "émaillée", "non émaillée", "lampe votive"],
    description: "Choisir entre une pièce émaillée ou non émaillée avant de l'ajouter au panier.",
  },
  {
    id: "11-piece-unique-et-stock",
    slug: "piece-unique-et-stock",
    title: "Pièce unique, dernier exemplaire, épuisé",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["pièce unique", "stock", "dernière pièce", "épuisé", "similaire"],
    description: "Ce que voit un visiteur devant une pièce unique, un dernier exemplaire ou une pièce épuisée.",
  },
  {
    id: "12-demander-un-devis",
    slug: "demander-un-devis",
    title: "Pièce sur devis",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["devis", "sur devis", "demander un devis", "pièce unique"],
    description: "Une pièce sur devis ne s'achète pas : le bouton ouvre une demande déjà remplie.",
  },
  {
    id: "13-ajouter-au-panier",
    slug: "ajouter-au-panier",
    title: "Ajouter au panier et ouvrir le panier",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["panier", "ajouter", "quantité", "retirer", "sous-total"],
    description: "Ajouter une pièce, changer la quantité, retirer une ligne et lire le sous-total du panier.",
  },
  {
    id: "14-panier-page-barre-mobile",
    slug: "panier-page-barre-mobile",
    title: "La page panier et la barre panier mobile",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["panier", "barre mobile", "passer commande"],
    description: "La page panier complète et la barre panier collée en bas sur téléphone.",
  },
  {
    id: "15-demande-piece-unique",
    slug: "demande-piece-unique",
    title: "Envoyer une demande de pièce unique",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["demande", "pièce unique", "sur mesure", "devis", "formulaire", "contact"],
    description: "Décrire la pièce rêvée dans le formulaire pour recevoir une réponse de l'atelier.",
  },
  {
    id: "16-photos-de-reference",
    slug: "photos-de-reference",
    title: "Joindre des photos à ma demande",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["photos", "référence", "joindre", "5 mo", "compression"],
    description: "Ajouter des photos d'inspiration à une demande : formats, taille maximale et compression.",
  },
  {
    id: "17-page-atelier",
    slug: "page-atelier",
    title: "La page atelier",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["atelier", "adresse", "horaires", "carte", "sabri ghit"],
    description: "L'histoire de l'atelier, son adresse, ses horaires et sa carte.",
  },
  {
    id: "18-contact-et-reseaux",
    slug: "contact-et-reseaux",
    title: "Contacter l'atelier (pied de page, WhatsApp, Instagram)",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 45,
    tags: ["contact", "whatsapp", "instagram", "email", "téléphone", "pied de page"],
    description: "Les liens de contact en pied de page : email, téléphone, WhatsApp et Instagram.",
  },
  {
    id: "19-pages-legales",
    slug: "pages-legales",
    title: "Pages légales (CGV, livraison, mentions, confidentialité)",
    area: "storefront",
    audience: ["visitor", "owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["cgv", "mentions légales", "confidentialité", "rgpd", "cookies", "livraison"],
    description: "Conditions de vente, livraison, mentions légales et confidentialité.",
  },
  {
    id: "20-page-introuvable-erreur",
    slug: "page-introuvable-erreur",
    title: "Pages 404 et erreur",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 45,
    tags: ["404", "introuvable", "erreur", "réessayer"],
    description: "Ce que voit un visiteur sur une page introuvable ou en cas d'erreur, et comment revenir.",
  },
  {
    id: "21-clavier-et-accessibilite",
    slug: "clavier-et-accessibilite",
    title: "Utiliser la boutique au clavier et avec un lecteur d'écran",
    area: "storefront",
    audience: ["visitor"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["accessibilité", "clavier", "focus", "lecteur d'écran", "contraste"],
    description: "Parcourir la boutique avec le clavier et un lecteur d'écran.",
  },
  {
    id: "22-referencement-partage",
    slug: "referencement-partage",
    title: "Comment la boutique apparaît sur Google et au partage",
    area: "storefront",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["seo", "google", "partage", "whatsapp", "image de partage", "sitemap"],
    description: "L'aperçu de la boutique sur Google et dans un message WhatsApp : titre, image et plan du site.",
  },
  {
    id: "23-commander-especes-tunisie",
    slug: "commander-especes-tunisie",
    title: "Commander en Tunisie, payer en espèces à la livraison",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 120,
    tags: ["commander", "paiement à la livraison", "espèces", "tunisie", "dinars", "checkout"],
    description: "Le parcours complet d'une commande en Tunisie avec paiement en espèces à la livraison.",
  },
  {
    id: "24-commander-carte-demo",
    slug: "commander-carte-demo",
    title: "Payer par carte (passerelle de démonstration)",
    area: "checkout",
    audience: ["customer", "owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 120,
    tags: ["carte bancaire", "e-dinar", "konnect", "paiement en ligne", "démo"],
    description: "Payer par carte sur la passerelle de démonstration, du panier à la confirmation.",
  },
  {
    id: "25-echec-abandon-paiement",
    slug: "echec-abandon-paiement",
    title: "Paiement échoué ou abandonné",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["échec", "abandon", "annulée", "réessayer", "stock"],
    description: "Ce qui se passe quand un paiement échoue ou est abandonné : commande annulée et stock rendu.",
  },
  {
    id: "26-commander-virement-etranger",
    slug: "commander-virement-etranger",
    title: "Commander depuis l'étranger, payer par virement",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 120,
    tags: ["virement", "iban", "étranger", "euros", "belgique", "france"],
    description: "Une commande depuis la Belgique ou la France payée par virement, avec les coordonnées bancaires.",
  },
  {
    id: "27-commander-payoneer",
    slug: "commander-payoneer",
    title: "Payer avec un lien Payoneer",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["payoneer", "lien de paiement", "étranger", "euros"],
    description: "Payer en euros avec un lien Payoneer envoyé par l'atelier.",
  },
  {
    id: "28-erreurs-formulaire-commande",
    slug: "erreurs-formulaire-commande",
    title: "Erreurs et règles du formulaire de commande",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["erreur", "validation", "cgv", "formulaire", "obligatoire"],
    description: "Les messages d'erreur du formulaire de commande et les cases obligatoires.",
  },
  {
    id: "29-prix-livraison-commande",
    slug: "prix-livraison-commande",
    title: "Le prix de livraison au paiement",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["livraison", "frais de port", "offerte", "devis", "poids", "aramex"],
    description: "Comment les frais de livraison sont calculés et affichés au moment de payer.",
  },
  {
    id: "30-suivre-ma-commande",
    slug: "suivre-ma-commande",
    title: "Retrouver et suivre ma commande",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["suivi", "commande", "statut", "colis", "lien", "numéro de suivi"],
    description: "Retrouver sa commande avec son numéro et suivre son statut et son colis.",
  },
  {
    id: "31-facture-client",
    slug: "facture-client",
    title: "Télécharger ou imprimer ma facture",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 45,
    tags: ["facture", "imprimer", "pdf", "client"],
    description: "Ouvrir, imprimer ou télécharger sa facture depuis la page de la commande.",
  },
  {
    id: "32-commande-au-clavier",
    slug: "commande-au-clavier",
    title: "Commander uniquement au clavier",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["clavier", "accessibilité", "commander", "focus", "annonce"],
    description: "Remplir et valider une commande sans souris, avec les annonces du lecteur d'écran.",
  },
  {
    id: "33-erreurs-stock-commande",
    slug: "erreurs-stock-commande",
    title: "Quand une pièce n'est plus disponible",
    area: "checkout",
    audience: ["customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["stock", "épuisé", "indisponible", "course", "deux acheteurs"],
    description: "Quand une pièce est vendue pendant la commande : le message et ce qu'on peut faire.",
  },
  {
    id: "34-se-connecter",
    slug: "se-connecter",
    title: "Se connecter et se déconnecter",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["connexion", "mot de passe", "déconnexion", "verrouillage", "session", "sécurité"],
    description: "Se connecter au tableau de bord, les messages de sécurité et la déconnexion.",
    routes: ["/login"],
  },
  {
    id: "35-naviguer-tableau-de-bord",
    slug: "naviguer-tableau-de-bord",
    title: "Se repérer dans le tableau de bord",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["navigation", "menu", "barre latérale", "onglets", "badges", "aide"],
    description: "La barre latérale, la barre d'onglets du téléphone, les pastilles de comptage et l'aide.",
  },
  {
    id: "36-vue-ensemble-chiffres",
    slug: "vue-ensemble-chiffres",
    title: "Lire la vue d'ensemble (chiffres clés)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["statistiques", "ventes", "chiffre d'affaires", "panier moyen", "dinars", "euros"],
    description: "Chiffre d'affaires, nombre de commandes et panier moyen, en dinars et en euros séparés.",
  },
  {
    id: "37-periode-graphiques-classements",
    slug: "periode-graphiques-classements",
    title: "Période, graphiques et classements",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["période", "graphique", "meilleures ventes", "pays", "stock faible"],
    description: "Choisir la période, lire les graphiques et les classements des meilleures ventes.",
  },
  {
    id: "38-exporter-ventes-csv",
    slug: "exporter-ventes-csv",
    title: "Exporter les ventes par jour (CSV)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 45,
    tags: ["export", "csv", "ventes", "comptable"],
    description: "Télécharger les ventes jour par jour dans un fichier CSV pour le comptable.",
  },
  {
    id: "39-liste-commandes-filtres",
    slug: "liste-commandes-filtres",
    title: "La liste des commandes, recherche et filtres",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["commandes", "liste", "filtrer", "statut", "rechercher", "plus de commandes"],
    description: "Rechercher une commande, filtrer par statut et charger les suivantes.",
    routes: ["/orders"],
  },
  {
    id: "40-detail-commande",
    slug: "detail-commande",
    title: "Ouvrir une commande (détail, client, historique)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["commande", "détail", "client", "appeler", "historique", "paiement"],
    description: "Le détail d'une commande : client, articles, paiement et historique.",
    routes: ["/audit"],
  },
  {
    id: "41-expedier-commande",
    slug: "expedier-commande",
    title: "Marquer une commande expédiée (transporteur et suivi)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["expédier", "expédiée", "suivi", "transporteur", "colis", "livraison"],
    description: "Enregistrer le transporteur et le numéro de suivi quand le colis part.",
  },
  {
    id: "42-marquer-payee-virement",
    slug: "marquer-payee-virement",
    title: "Confirmer un virement reçu (marquer payée)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["marquer payée", "virement", "paiement manuel", "audit", "payoneer", "espèces"],
    description: "Marquer une commande payée quand le virement est arrivé, avec la trace dans l'historique.",
  },
  {
    id: "43-annuler-commande",
    slug: "annuler-commande",
    title: "Annuler une commande",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["annuler", "annulation", "stock", "remettre en stock"],
    description: "Annuler une commande et remettre les pièces en stock.",
  },
  {
    id: "44-rembourser-commande",
    slug: "rembourser-commande",
    title: "Rembourser une commande",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["rembourser", "remboursement", "konnect", "stock"],
    description: "Marquer une commande remboursée et savoir ce qui reste à faire chez Konnect.",
  },
  {
    id: "45-exporter-commandes-csv",
    slug: "exporter-commandes-csv",
    title: "Exporter les commandes pour le comptable",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 60,
    tags: ["export", "csv", "commandes", "comptable", "devise"],
    description: "Exporter les commandes en CSV, un fichier par devise.",
  },
  {
    id: "46-emettre-facture",
    slug: "emettre-facture",
    title: "Émettre et imprimer une facture",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["facture", "émettre", "numéro", "imprimer", "mentions légales", "langue"],
    description: "Générer le numéro de facture, choisir la langue et imprimer.",
  },
  {
    id: "47-facture-pdf",
    slug: "facture-pdf",
    title: "Télécharger la facture en PDF",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 45,
    tags: ["facture pdf", "télécharger", "fichier"],
    description: "Enregistrer la facture d'une commande en fichier PDF.",
  },
  {
    id: "48-confirmer-paiement-payoneer",
    slug: "confirmer-paiement-payoneer",
    title: "Commande Payoneer côté propriétaire",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["payoneer", "lien de paiement", "confirmer", "euros"],
    description: "Suivre et confirmer le paiement d'une commande réglée avec Payoneer.",
  },
  {
    id: "49-expedition-aramex-etiquette",
    slug: "expedition-aramex-etiquette",
    title: "Créer une expédition Aramex et imprimer l'étiquette",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["aramex", "expédition", "étiquette", "colis", "cod"],
    description: "Créer l'envoi chez Aramex et imprimer l'étiquette du colis.",
  },
  {
    id: "50-liste-produits",
    slug: "liste-produits",
    title: "La liste des produits (recherche, filtres, stock)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["produits", "catalogue", "filtrer", "stock", "rechercher", "réinitialiser"],
    description: "Rechercher des produits, filtrer par statut ou catégorie et repérer le stock.",
    routes: ["/products"],
  },
  {
    id: "51-creer-produit",
    slug: "creer-produit",
    title: "Créer un produit",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 150,
    tags: ["nouveau produit", "créer", "référence", "catégorie", "titre", "description", "matière"],
    description: "Créer une fiche produit : référence, catégorie, titre et description.",
    routes: ["/products/new"],
  },
  {
    id: "52-prix-deux-devises",
    slug: "prix-deux-devises",
    title: "Fixer les deux prix (TND et EUR) et le stock",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["prix", "dinars", "euros", "millimes", "stock", "devise"],
    description: "Saisir le prix en dinars et en euros, chacun fixé à la main, et le stock.",
  },
  {
    id: "53-traduire-avec-ia",
    slug: "traduire-avec-ia",
    title: "Traduire un produit avec l'IA (anglais et arabe)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["traduction", "ia", "anglais", "arabe", "groq", "brouillon"],
    description: "Générer un brouillon de traduction anglaise et arabe, à relire avant de publier.",
  },
  {
    id: "54-variantes-produit",
    slug: "variantes-produit",
    title: "Ajouter des variantes à une pièce",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["variantes", "option", "émaillée", "prix par variante", "stock par variante"],
    description: "Proposer plusieurs versions d'une pièce avec un prix et un stock pour chacune.",
  },
  {
    id: "55-photos-produit",
    slug: "photos-produit",
    title: "Gérer les photos d'un produit",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 120,
    tags: ["photos", "galerie", "photo principale", "médiathèque", "téléverser", "texte alternatif"],
    description: "Ajouter, choisir la photo principale et décrire les photos d'un produit.",
  },
  {
    id: "56-ordre-photos-clavier",
    slug: "ordre-photos-clavier",
    title: "Réordonner les photos (glisser-déposer et clavier)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["réordonner", "glisser-déposer", "clavier", "photos", "accessibilité"],
    description: "Changer l'ordre des photos en les glissant ou avec le clavier.",
  },
  {
    id: "57-modifier-description",
    slug: "modifier-description",
    title: "Modifier la description d'un produit (fr, en, ar)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["description", "modifier", "traduction", "onglets langue"],
    description: "Modifier le texte d'un produit en français, anglais et arabe.",
  },
  {
    id: "58-publier-depublier-lot",
    slug: "publier-depublier-lot",
    title: "Publier, dépublier et sélectionner plusieurs produits",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["publier", "dépublier", "brouillon", "sélection multiple", "lot"],
    description: "Sélectionner plusieurs produits pour les publier ou les masquer d'un coup.",
  },
  {
    id: "59-supprimer-produit",
    slug: "supprimer-produit",
    title: "Supprimer ou archiver un produit",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["supprimer", "archiver", "produit", "commandes"],
    description: "Supprimer un produit ou l'archiver quand des commandes y sont liées.",
  },
  {
    id: "60-options-piece-unique-vedette",
    slug: "options-piece-unique-vedette",
    title: "Pièce unique, sur devis, mis en avant",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["pièce unique", "sur devis", "mis en avant", "accueil"],
    description: "Marquer une pièce unique, sur devis ou mise en avant sur l'accueil.",
  },
  {
    id: "61-emballage-livraison-produit",
    slug: "emballage-livraison-produit",
    title: "Poids et dimensions pour le calcul de livraison",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["poids", "dimensions", "colis", "emballage", "livraison"],
    description: "Renseigner poids et dimensions du colis pour calculer la livraison.",
  },
  {
    id: "62-gerer-categories",
    slug: "gerer-categories",
    title: "Gérer les catégories",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["catégories", "menu", "ordre", "image", "masquer"],
    description: "Créer, ordonner, illustrer et masquer les catégories du menu.",
    routes: ["/categories"],
  },
  {
    id: "63-mediatheque-televerser",
    slug: "mediatheque-televerser",
    title: "Ajouter des photos à la médiathèque",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["médiathèque", "téléverser", "glisser-déposer", "webp", "doublon", "stockage"],
    description: "Téléverser des photos dans la médiathèque et suivre l'espace de stockage utilisé.",
    routes: ["/media"],
  },
  {
    id: "64-mediatheque-chercher-trier",
    slug: "mediatheque-chercher-trier",
    title: "Chercher, filtrer et trier les photos",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["médiathèque", "recherche", "tri", "mot-clé", "non utilisées"],
    description: "Retrouver une photo par mot-clé, la trier ou voir celles qui ne servent plus.",
  },
  {
    id: "65-mediatheque-fiche-photo",
    slug: "mediatheque-fiche-photo",
    title: "La fiche d'une photo (nom, texte alternatif, mots-clés, usages)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["texte alternatif", "mots-clés", "renommer", "utilisée sur", "garder"],
    description: "Renommer une photo, écrire son texte alternatif et voir où elle est utilisée.",
  },
  {
    id: "66-supprimer-photo",
    slug: "supprimer-photo",
    title: "Supprimer une photo (et pourquoi c'est parfois bloqué)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["supprimer photo", "utilisée", "bloqué", "médiathèque"],
    description: "Supprimer une photo inutile, et pourquoi la suppression est parfois bloquée.",
  },
  {
    id: "67-selecteur-mediatheque",
    slug: "selecteur-mediatheque",
    title: "Choisir une photo depuis la médiathèque",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["sélecteur", "photo", "médiathèque", "choisir"],
    description: "Choisir une photo déjà téléversée quand on édite un produit.",
  },
  {
    id: "68-photos-du-site",
    slug: "photos-du-site",
    title: "Changer les photos du site (accueil, atelier, logo, partage)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["photos du site", "hero", "accueil", "logo", "image de partage"],
    description: "Changer les photos de l'accueil, de l'atelier, le logo et l'image de partage.",
    status: "soon",
  },
  {
    id: "69-demandes-clients",
    slug: "demandes-clients",
    title: "Les demandes de pièces uniques",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 105,
    tags: ["demandes", "pièce unique", "devis", "statut", "note privée"],
    description: "La liste des demandes de pièces uniques, leur statut et la note privée.",
    routes: ["/requests"],
  },
  {
    id: "70-repondre-demande",
    slug: "repondre-demande",
    title: "Répondre à une demande",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["répondre", "email", "copier", "appeler", "whatsapp"],
    description: "Répondre à une demande : ouvrir l'email, copier l'adresse ou appeler, puis noter la suite.",
  },
  {
    id: "71-mode-livraison-grille",
    slug: "mode-livraison-grille",
    title: "Régler les prix de livraison (grille forfaitaire)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 120,
    tags: ["livraison", "zones", "tarifs", "kilos", "offerte", "carburant"],
    description: "Remplir la grille des prix de livraison par zone et par poids.",
    routes: ["/settings"],
  },
  {
    id: "72-estimateur-livraison",
    slug: "estimateur-livraison",
    title: "Simuler le prix de livraison d'un colis",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["estimateur", "simulateur", "livraison", "colis", "poids volumétrique"],
    description: "Simuler le prix d'envoi d'un colis avant de le proposer au client.",
  },
  {
    id: "73-identifiants-aramex",
    slug: "identifiants-aramex",
    title: "Configurer Aramex (test, identifiants, adresse d'envoi)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["aramex", "identifiants", "test de connexion", "livraison manuelle"],
    description: "Enregistrer les identifiants Aramex, tester la connexion et choisir l'adresse d'envoi.",
  },
  {
    id: "74-moyens-de-paiement",
    slug: "moyens-de-paiement",
    title: "Choisir les moyens de paiement",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["paiement", "carte", "espèces", "virement", "activer", "règles"],
    description: "Activer la carte, les espèces ou le virement, et les règles de chacun.",
    routes: ["/payments"],
  },
  {
    id: "75-delai-annulation-commandes",
    slug: "delai-annulation-commandes",
    title: "Délai avant annulation des commandes non payées",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["délai", "annulation automatique", "stock réservé", "virement", "jours"],
    description: "Régler après combien de jours une commande en virement ou à la livraison non payée est annulée.",
  },
  {
    id: "76-cles-konnect",
    slug: "cles-konnect",
    title: "Enregistrer ses clés Konnect (carte bancaire)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["konnect", "clés", "carte bancaire", "test", "mode live", "coffre"],
    description: "Enregistrer ses clés Konnect pour accepter la carte bancaire, en test puis en production.",
    status: "soon",
  },
  {
    id: "77-reglages-payoneer",
    slug: "reglages-payoneer",
    title: "Activer Payoneer et choisir son mode",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["payoneer", "lien statique", "par commande", "note", "activer"],
    description: "Activer Payoneer et choisir entre un lien unique ou un lien par commande.",
    status: "soon",
  },
  {
    id: "78-gerer-ateliers",
    slug: "gerer-ateliers",
    title: "Gérer les ateliers (adresses affichées sur le site)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["ateliers", "adresses", "horaires", "lieux", "carte"],
    description: "Gérer les ateliers affichés sur le site : adresses, horaires et carte.",
    routes: ["/locations"],
  },
  {
    id: "79-reglages-reseaux",
    slug: "reglages-reseaux",
    title: "Réglages (réseaux sociaux, note de livraison)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["réglages", "instagram", "whatsapp", "note de livraison"],
    description: "Renseigner les réseaux sociaux et la note de livraison affichée aux clients.",
    routes: ["/settings"],
  },
  {
    id: "80-traduction-auto-reglages",
    slug: "traduction-auto-reglages",
    title: "Réglages de la traduction automatique (clé Groq, plafond)",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["traduction automatique", "groq", "modèle", "plafond mensuel", "effort"],
    description: "Régler la traduction automatique : clé Groq, modèle et plafond mensuel.",
  },
  {
    id: "81-profil-atelier",
    slug: "profil-atelier",
    title: "Remplir le profil de l'atelier",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["profil", "raison sociale", "matricule fiscal", "adresse", "mention fiscale", "facture"],
    description: "Remplir raison sociale, matricule fiscal et adresse, qui figurent sur les factures.",
    routes: ["/settings/profile"],
  },
  {
    id: "82-compte-bancaire",
    slug: "compte-bancaire",
    title: "Saisir son compte bancaire pour les virements",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["rib", "iban", "bic", "banque", "virement"],
    description: "Saisir RIB, IBAN et BIC pour les clients qui paient par virement.",
  },
  {
    id: "83-aide-videos",
    slug: "aide-videos",
    title: "La page Aide et ses vidéos",
    area: "dashboard",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["aide", "tutoriels", "vidéos", "youtube"],
    description: "Retrouver les vidéos d'aide et en ajouter une avec un lien YouTube.",
    routes: ["/help"],
  },
  {
    id: "84-emails-client-confirmation",
    slug: "emails-client-confirmation",
    title: "L'email de confirmation de commande (selon le mode de paiement)",
    area: "emails",
    audience: ["owner", "customer"],
    devices: ["desktop"],
    lengthSeconds: 105,
    tags: ["email", "confirmation", "commande", "langue", "virement", "espèces"],
    description: "Ce que reçoit le client après sa commande, selon le moyen de paiement.",
  },
  {
    id: "85-emails-paiement-expedition",
    slug: "emails-paiement-expedition",
    title: 'Emails "Paiement reçu" et "Commande expédiée"',
    area: "emails",
    audience: ["customer", "owner"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["email", "paiement reçu", "expédiée", "suivi", "transporteur"],
    description: "Les emails envoyés au client quand le paiement est reçu et quand la commande part.",
  },
  {
    id: "86-emails-atelier",
    slug: "emails-atelier",
    title: "Les emails que reçoit l'atelier (nouvelle commande, nouvelle demande)",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 60,
    tags: ["notification", "nouvelle commande", "demande", "email atelier"],
    description: "Les emails reçus par l'atelier pour chaque nouvelle commande ou demande.",
  },
  {
    id: "87-emails-en-echec",
    slug: "emails-en-echec",
    title: "Emails en échec : renvoyer ou ignorer",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["emails", "échec", "renvoyer", "ignorer", "journal", "resend"],
    description: "Voir les emails qui n'ont pas pu partir, les renvoyer ou les ignorer.",
    routes: ["/emails"],
  },
  {
    id: "88-domaine-et-test-email",
    slug: "domaine-et-test-email",
    title: "Domaine d'envoi et email de test",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["domaine", "resend", "dns", "email de test", "vérification"],
    description: "Vérifier le domaine d'envoi des emails et envoyer un email de test.",
  },
  {
    id: "89-commande-expiree-liberation",
    slug: "commande-expiree-liberation",
    title: "Commandes non payées : expiration et stock libéré",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["expiration", "annulation automatique", "stock", "délai", "email"],
    description: "Ce qui se passe quand une commande n'est pas payée à temps : annulation et stock libéré.",
  },
  {
    id: "90-taches-planifiees",
    slug: "taches-planifiees",
    title: "Tâches planifiées (ce qui tourne tout seul)",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["tâches planifiées", "cron", "nettoyage", "stock réservé", "photos"],
    description: "Ce qui tourne tout seul : stock réservé, photos et emails.",
  },
  {
    id: "91-lien-payoneer-par-email",
    slug: "lien-payoneer-par-email",
    title: "Envoyer le lien Payoneer à un client",
    area: "emails",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["payoneer", "lien", "email", "commande"],
    description: "Envoyer au client le lien Payoneer de sa commande par email.",
  },
  {
    id: "92-suivi-colis-automatique",
    slug: "suivi-colis-automatique",
    title: "Suivi automatique des colis Aramex",
    area: "emails",
    audience: ["owner", "customer"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["suivi", "aramex", "colis", "chronologie", "actualiser"],
    description: "Suivre l'avancement des colis Aramex sans quitter le tableau de bord.",
  },
  {
    id: "93-premiere-ouverture",
    slug: "premiere-ouverture",
    title: "Première ouverture : votre nom",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 60,
    tags: ["premier démarrage", "onboarding", "nom", "bienvenue", "assistant"],
    description: "Le premier démarrage : confirmer son nom et découvrir l'assistant.",
    routes: ["/onboarding"],
  },
  {
    id: "94-assistant-atelier-banque",
    slug: "assistant-atelier-banque",
    title: "Assistant : l'atelier et le compte bancaire",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 120,
    tags: ["assistant", "atelier", "matricule fiscal", "banque", "iban", "virement"],
    description: "Renseigner l'atelier et le compte bancaire dans l'assistant de démarrage.",
  },
  {
    id: "95-assistant-livraison-fin",
    slug: "assistant-livraison-fin",
    title: "Assistant : frais de livraison et fin",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 90,
    tags: ["assistant", "frais de livraison", "grille", "tout est prêt"],
    description: "Choisir les frais de livraison et terminer l'assistant.",
  },
  {
    id: "96-etapes-optionnelles-progression",
    slug: "etapes-optionnelles-progression",
    title: "Étapes optionnelles et carte de progression",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop", "mobile"],
    lengthSeconds: 75,
    tags: ["progression", "étapes", "ignorer", "optionnel", "configuration"],
    description: "Les étapes optionnelles, ce qu'on peut ignorer et la carte de progression.",
  },
  {
    id: "97-demo-test-production",
    slug: "demo-test-production",
    title: "Démo, aperçu et production : ne jamais mélanger",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 90,
    tags: ["environnement", "démo", "test", "production", "passerelle", "aperçu"],
    description:
      "Local, aperçu et production : seule la production a les vraies clés, la vraie base et le vrai stockage.",
    routes: ["/checkout/demo"],
  },
  {
    id: "98-coffre-cles-secrets",
    slug: "coffre-cles-secrets",
    title: "Où vont les clés (coffre chiffré) et comment les remplacer",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 75,
    tags: ["clés", "secrets", "coffre", "groq", "resend", "aramex", "remplacer", "effacer"],
    description: "Où sont rangées les clés des services, chiffrées, et comment les remplacer.",
  },
  {
    id: "99-securite-donnees-sauvegardes",
    slug: "securite-donnees-sauvegardes",
    title: "Sécurité, vie privée et exploitation (RGPD, cookies, sauvegardes)",
    area: "setup",
    audience: ["owner"],
    devices: ["desktop"],
    lengthSeconds: 120,
    tags: ["rgpd", "cookies", "effacement", "sauvegarde", "sécurité", "supervision"],
    description: "Cookies, effacement des données, sauvegardes et supervision, en clair.",
  },
]

export const TUTORIAL_IDS: ReadonlySet<string> = new Set(TUTORIALS.map((t) => t.id))

/** The 11 slots of the first help page, matched to the videos that replace them. */
const LEGACY_TUTORIAL_NUMBERS: Record<string, string> = {
  "01": "01",
  "02": "23",
  "03": "34",
  "04": "51",
  "05": "59",
  "06": "55",
  "07": "66",
  "08": "57",
  "09": "36",
  "10": "46",
  "11": "93",
}

/** Owner links saved under the old "01".."11" keys, moved to the id of the video that replaced the slot. */
export function migrateTutorialLinkKey(key: string): string {
  const number = LEGACY_TUTORIAL_NUMBERS[key]
  return TUTORIALS.find((t) => number !== undefined && t.id.startsWith(`${number}-`))?.id ?? key
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"])

export const youtubeIdSchema = z.string().regex(VIDEO_ID)

export const tutorialLinkSchema = z.object({ desktop: youtubeIdSchema.nullable(), mobile: youtubeIdSchema.nullable() })
/** Optional YouTube override per video, only for known ids. */
export const tutorialLinksSchema = z
  .record(z.string(), tutorialLinkSchema)
  .refine((links) => Object.keys(links).every((id) => TUTORIAL_IDS.has(id)), "Unknown tutorial")
export type TutorialLink = z.infer<typeof tutorialLinkSchema>
export type TutorialLinks = z.infer<typeof tutorialLinksSchema>

export const EMPTY_TUTORIAL_LINKS: TutorialLinks = {}

/** Stored links as the owner left them: legacy keys moved, unknown ids and malformed entries dropped. */
export function readTutorialLinks(stored: unknown): TutorialLinks {
  if (typeof stored !== "object" || stored === null) return {}
  const links: TutorialLinks = {}
  for (const [key, value] of Object.entries(stored)) {
    const id = migrateTutorialLinkKey(key)
    const link = tutorialLinkSchema.safeParse(value)
    if (!link.success || !TUTORIAL_IDS.has(id) || (link.data.desktop === null && link.data.mobile === null)) continue
    if (id === key || !(id in links)) links[id] = link.data
  }
  return links
}

/** The 11-character video id from anything the owner pastes: a share link, a watch/shorts/embed url or the id itself. */
export function youtubeId(input: string): string | null {
  const text = input.trim()
  if (VIDEO_ID.test(text)) return text
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const [first, second] = url.pathname.split("/").filter(Boolean)
  let id: string | null | undefined = null
  if (host === "youtu.be") id = first
  else if (YOUTUBE_HOSTS.has(host)) {
    if (first === "watch") id = url.searchParams.get("v")
    else if (first === "shorts" || first === "embed" || first === "live") id = second
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/** "1 min 30", "45 s": how long a tutorial lasts, for people, not for players. */
export function formatTutorialLength(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (!m) return `${s} s`
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`
}

/** Lower case, no accents: "Pièce Émaillée" and "piece emaillee" meet. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr").replace(/œ/g, "oe").replace(/[’']/g, " ")
}

export interface TutorialFilters {
  query?: string
  area?: TutorialArea | null
  audience?: TutorialAudience | null
  tag?: string | null
}

/** Every distinct tag, accents folded for sorting, in the spelling of the first video that uses it. */
export function tutorialTags(list: readonly Tutorial[]): string[] {
  const seen = new Map<string, string>()
  for (const t of list) for (const tag of t.tags) if (!seen.has(foldText(tag))) seen.set(foldText(tag), tag)
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, tag]) => tag)
}

/** Every word of the query must appear in the title, the tags or the description. Filters narrow further. */
export function searchTutorials(list: readonly Tutorial[], filters: TutorialFilters = {}): Tutorial[] {
  const words = foldText(filters.query ?? "")
    .split(/\s+/)
    .filter(Boolean)
  return list.filter((t) => {
    if (filters.area && t.area !== filters.area) return false
    if (filters.audience && !t.audience.includes(filters.audience)) return false
    if (filters.tag && !t.tags.some((tag) => foldText(tag) === foldText(filters.tag!))) return false
    if (!words.length) return true
    const haystack = foldText([t.title, ...t.tags, t.description].join(" "))
    return words.every((w) => haystack.includes(w))
  })
}

/** Other videos sharing the most tags, best first, same-area ones before the rest on a tie. */
export function relatedTutorials(tutorial: Tutorial, list: readonly Tutorial[], limit = 3): Tutorial[] {
  const own = new Set(tutorial.tags.map(foldText))
  return list
    .filter((t) => t.id !== tutorial.id)
    .map((t) => ({ t, shared: t.tags.filter((tag) => own.has(foldText(tag))).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || Number(b.t.area === tutorial.area) - Number(a.t.area === tutorial.area))
    .slice(0, limit)
    .map(({ t }) => t)
}

export const tutorialFilesSchema = z.object({
  desktop: z.boolean().default(false),
  mobile: z.boolean().default(false),
  captions: z.boolean().default(false),
  poster: z.boolean().default(false),
})
export type TutorialFiles = z.infer<typeof tutorialFilesSchema>

export const tutorialManifestSchema = z.object({ videos: z.record(z.string(), tutorialFilesSchema) })
export type TutorialManifest = z.infer<typeof tutorialManifestSchema>

export const TUTORIAL_MANIFEST_KEY = "tutorials/manifest.json"

/**
 * The manifest the owner or the uploader keeps next to the videos. Anything unreadable means "no videos yet":
 * a bad manifest must never break the page. One malformed or unknown entry is dropped, the others stay.
 */
export function parseTutorialManifest(text: string | null | undefined): TutorialManifest {
  const videos: TutorialManifest["videos"] = {}
  if (!text) return { videos }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { videos }
  }
  const entries = (json as { videos?: unknown } | null)?.videos
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) return { videos }
  for (const [id, value] of Object.entries(entries)) {
    const files = tutorialFilesSchema.safeParse(value)
    if (TUTORIAL_IDS.has(id) && files.success && (files.data.desktop || files.data.mobile)) videos[id] = files.data
  }
  return { videos }
}

export type TutorialSource = { kind: "youtube"; id: string } | { kind: "file" }

/**
 * Where each device version of a video plays from: the owner's YouTube link first, then the hosted file.
 * Only the devices the video declares count, and a `soon` video never plays. The card, the count and the player all
 * read this, so they cannot disagree.
 */
export function playableSources(
  tutorial: Tutorial,
  files: TutorialFiles | undefined,
  link: TutorialLink | undefined,
): Partial<Record<TutorialDevice, TutorialSource>> {
  const sources: Partial<Record<TutorialDevice, TutorialSource>> = {}
  if (tutorial.status === "soon") return sources
  for (const device of tutorial.devices) {
    const youtube = link?.[device]
    if (youtube) sources[device] = { kind: "youtube", id: youtube }
    else if (files?.[device]) sources[device] = { kind: "file" }
  }
  return sources
}

/** Storage keys of a video's files, relative to the bucket (the api adds the environment prefix). */
export function tutorialKeys(id: string, device: TutorialDevice) {
  return {
    video: `tutorials/${id}-${device}.mp4`,
    captions: `tutorials/${id}-${device}.vtt`,
    poster: `tutorials/${id}.jpg`,
  }
}
