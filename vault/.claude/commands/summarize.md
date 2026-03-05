Génère un résumé structuré d'un fichier clippé et ajoute-le en haut du body (après le frontmatter).

Fichier à résumer : $ARGUMENTS

Étapes :
1. Lis le fichier `.md` indiqué dans `/vault/`
2. Analyse le contenu Markdown (ignore le frontmatter)
3. Génère un bloc résumé au format suivant, en français :

```markdown
> [!summary] Résumé
> **Points clés :**
> - Point 1
> - Point 2
> - Point 3
>
> **En une phrase :** <résumé concis>
```

4. Insère ce bloc juste après le frontmatter (après le `---` fermant), avant le contenu existant
5. Ne modifie pas le reste du contenu ni le frontmatter
6. Affiche le résumé généré
