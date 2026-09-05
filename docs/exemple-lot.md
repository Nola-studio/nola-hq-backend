# Lot « Facturation par échéance »

Auteur : Greg · septembre 2026

# EPIC BIL-01 — Générer les factures d'abonnement avant l'échéance

Priorité : P0
Domaine : D08

Chaque abonnement doit produire sa facture trois jours avant le renouvellement,
et l'envoyer au contact de facturation du tenant.

Stories :

1. En tant que gestionnaire, je veux voir les factures à venir des sept prochains jours.
2. En tant que client, je veux recevoir ma facture par courriel avant le prélèvement.
3. En tant que gestionnaire, je veux relancer une génération qui a échoué.

# EPIC BIL-02 — Annuler une facture émise par erreur

Priorité : P1

Stories :

- En tant que gestionnaire, je veux annuler une facture en donnant un motif.
- En tant qu'auditeur, je veux retrouver qui a annulé quoi et quand.
