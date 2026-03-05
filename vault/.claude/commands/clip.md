Clip une page web en utilisant le serveur HTTP du clipper.

URL à clipper : $ARGUMENTS

Appelle le serveur clipper via :

```bash
curl -s -X POST http://web-clipper:3000/clip \
  -H 'Content-Type: application/json' \
  -d '{"url":"<URL>","template":"<TEMPLATE>"}'
```

Étapes :
1. Détermine le template le plus adapté en appelant `GET http://web-clipper:3000/templates` pour voir les templates disponibles
2. Si l'URL correspond à un trigger connu, utilise ce template. Sinon utilise "default"
3. Appelle `POST /clip` avec l'URL et le template choisi
4. Affiche le résultat (titre, chemin du fichier, nombre de mots)
5. Si le clip a réussi, propose d'enrichir le fichier avec `/enrich`
