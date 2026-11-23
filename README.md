# RCA · Foreningsplatform

Medlemsplatform for Ressourcecenter for Adopterede (RCA). Kører på Netlify med
Netlify Identity (login) og Netlify Database (Postgres).

## Funktioner

- **Offentligt:** forside, offentlige arrangementer, videnscenter, privatlivspolitik
- **Medlemmer:** indmeldelse med samtykke, egen profil, tilmelding til arrangementer,
  dokumenter, høring, idébank (del og støt idéer), download af egne data og anmodning om sletning (GDPR)
- **Bestyrelsen:** overblik, medlemsliste (godkend, kontingent, roller, CSV-eksport),
  arrangementer med tilmeldte, dokumenter/referater, opgaver, årshjul,
  videnscenter og log over ændringer

## Deploy

Netlify-projektet **rca-forening** (https://rca-forening.netlify.app) er koblet til
dette GitHub-repo. Hvert push til `main` bygges og udrulles automatisk.
Databasen oprettes ved første deploy, og tabellerne laves ud fra
`netlify/database/migrations/` (ændr aldrig en migration, der er kørt – lav en ny).

## Opsætning i Netlify (én gang)

1. **Slå Identity til:** https://app.netlify.com/projects/rca-forening/identity → *Enable Identity*.
2. **Registrering:** lad den stå på *Open*, så nye medlemmer selv kan oprette konto.
   (Bestyrelsen godkender medlemskabet i platformen.)
3. **Miljøvariabler** (Project configuration → Environment variables):

| Variabel | Formål |
|---|---|
| `BOARD_EMAILS` | Kommasepareret liste over bestyrelsens e-mails. De får automatisk bestyrelsesadgang. Sat til `lemmykook@gmail.com`. |
| `CONTACT_EMAIL` | Foreningens kontaktmail (vises i privatlivspolitikken) |
| `FEE_TEXT` | Tekst om kontingent og betaling, fx “Kontingent 200 kr./år via MobilePay 12345” |

Bestyrelsesmedlemmer kan også gøres til bestyrelse inde i platformen under
*Bestyrelse → Medlemmer → Redigér → Rolle*.

## Teknik

- Frontend: React + Vite (`src/`)
- API: én Netlify Function på `/api/*` (`netlify/functions/api.mts`)
- Database-skema: `netlify/database/migrations/`
