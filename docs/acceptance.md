# Recette de la boutique

Liste de contrôle à imprimer pour la réception de la boutique Ceraghit Creation. À faire ensemble, propriétaire et opérateur,
sur le vrai site. Cochez une case seulement quand vous avez vu la chose fonctionner vous-même. Tout ce qui ne va pas est noté
dans la dernière colonne ou en bas de page, puis devient un ticket.

Appareils : un ordinateur et un téléphone. Langues : français, anglais, arabe. Les points marqués (client) dépendent d'une
information ou d'un compte du studio : tant qu'ils manquent, notez « en attente » et ne cochez pas.

Date : ____ / ____ / ________    Testeur : ______________________    Appareil : ______________________

## 1. Site visible par les clients

- [ ] la page d'accueil s'ouvre en français, en anglais (`/en`) et en arabe (`/ar`)
- [ ] en arabe, tout se lit de droite à gauche ; les prix, numéros et e-mails restent lisibles
- [ ] le diaporama de l'accueil défile, les photos s'affichent sans saut de page
- [ ] la boutique : filtres, tri, catégories
- [ ] une fiche produit : photos, prix, dimensions, matière ; une pièce unique ne se commande qu'une fois
- [ ] un produit « sur devis » mène au formulaire de demande
- [ ] le changement de monnaie DT / EUR : un seul prix affiché à la fois, les prix sont les vôtres
- [ ] « L'atelier », « Pièce unique » (envoi d'une photo de 5 Mo maximum), pages légales : aucun texte entre crochets restant
- [ ] la page d'erreur et la page 404 s'affichent dans les trois langues
- [ ] sur téléphone : panier, commande et menu utilisables avec le pouce

## 2. Commande de bout en bout

- [ ] ajouter au panier, changer une quantité, retirer un article
- [ ] commande en Tunisie en DT : paiement à la livraison proposé
- [ ] commande à l'étranger en EUR : virement proposé, le RIB et le numéro de commande sont affichés
- [ ] le client reçoit l'e-mail de confirmation, et l'atelier reçoit « Nouvelle commande »
- [ ] la commande apparaît dans le tableau de bord avec le bon stock réservé
- [ ] annuler la commande de test : le stock revient

## 3. Tableau de bord

- [ ] connexion sur ordinateur et sur téléphone (il n'existe pas encore d'écran pour changer le mot de passe : c'est celui que l'opérateur a enregistré dans le secret `ADMIN_PASSWORD`, qu'il peut changer sur demande)
- [ ] première ouverture : les étapes se suivent, les étapes facultatives se passent
- [ ] profil de la boutique : nom légal, adresse, téléphone, e-mail, matricule fiscal enregistrés et visibles sur la facture
- [ ] banque : titulaire, RIB, IBAN, BIC remplis, plus aucun « À compléter » dans l'e-mail de virement, la page de commande et la facture

## 4. Produits et photos

- [ ] créer un produit avec ses deux prix (DT et EUR), le publier, le voir sur le site
- [ ] modifier la description, voir le changement sur le site
- [ ] ajouter des photos, choisir la photo principale, changer l'ordre
- [ ] supprimer une photo utilisée : refusée avec un message clair ; supprimer une photo inutilisée : acceptée
- [ ] dépublier puis supprimer le produit de test
- [ ] la traduction automatique propose un brouillon en anglais et en arabe, rien n'est enregistré sans « Enregistrer »
- [ ] les images du site (accueil, atelier, logo, images de partage) se changent depuis « Images du site »

## 5. Commandes, paiements, factures

- [ ] marquer une commande payée (virement ou paiement à la livraison) : l'action est enregistrée et l'e-mail « paiement reçu » part
- [ ] « Marquer expédiée » une commande avec un numéro de suivi : l'e-mail d'expédition le contient
- [ ] ouvrir la facture PDF : bonne langue, une seule monnaie, coordonnées et banque, impression A4 propre
- [ ] le client ouvre sa facture depuis le lien de sa commande
- [ ] paiement par carte (client) : un vrai petit paiement depuis une carte tunisienne et une carte étrangère, la commande passe payée toute seule
- [ ] lien Payoneer (client) : coller le lien sur la commande, le client le voit, marquer payée à la réception

## 6. Livraison

- [ ] mode manuel : transporteur et suivi enregistrés, visibles du client
- [ ] Aramex (client) : « Tester la connexion » réussit, un tarif s'affiche à la commande, une étiquette est créée (« Créer l'expédition Aramex »), imprimée, collée
- [ ] Aramex (client) : « Demander l'enlèvement » puis « Annuler l'enlèvement », suivi mis à jour avec « Actualiser »
- [ ] les frais de livraison saisis dans « Réglages » apparaissent au paiement

## 7. Statistiques et exports

- [ ] « Vue d'ensemble » : dinars et euros séparés, jamais additionnés, seulement les commandes payées
- [ ] export des ventes et des commandes en CSV, un fichier par monnaie, s'ouvre bien dans Excel (accents lisibles)

## 8. E-mails

- [ ] les e-mails arrivent dans la boîte de réception, pas dans les indésirables, avec l'adresse d'envoi de la boutique
- [ ] la demande de pièce unique arrive à l'atelier, la réponse se fait depuis votre boîte
- [ ] la page « Emails » liste un échec s'il y en a, et permet de « Renvoyer »

## 9. Aide et vidéos

- [ ] la page « Aide » liste les vidéos et les lit sur ordinateur et sur téléphone
- [ ] le guide `docs/handover.md` a été relu avec l'opérateur et correspond aux écrans réels

## 10. Sécurité et reprise

- [ ] un visiteur qui ouvre l'adresse du tableau de bord voit la page de connexion, rien d'autre
- [ ] après plusieurs mots de passe faux, la connexion se bloque pendant 15 minutes (5 essais ratés par adresse et par 15 minutes)
- [ ] l'opérateur a remis les coordonnées à appeler en cas de problème
- [ ] l'opérateur a confirmé la date de la dernière sauvegarde et du dernier test de restauration

## 11. Informations à fournir par le studio

- [ ] prix en DT et stock réels de chaque pièce, pièces sur devis, nom des tuiles « Curda Seca »
- [ ] frais de livraison pour la Tunisie et pour l'étranger, ou devis après commande
- [ ] dénomination légale, adresse, matricule fiscal, registre de commerce, patente, RIB, IBAN, BIC, régime de TVA
- [ ] politique de retour, délai pour signaler un colis abîmé
- [ ] compte Konnect (clés réelles), accès Aramex, compte Payoneer
- [ ] propriétaire du nom de domaine et anciens liens à rediriger

## Remarques

&nbsp;

&nbsp;

&nbsp;

## Validation

Réception prononcée le ____ / ____ / ________

Propriétaire : ______________________    Opérateur : ______________________
