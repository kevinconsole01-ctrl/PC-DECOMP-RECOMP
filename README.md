# Recomp & Decomp PC

Webapp statica che elenca i progetti di **recompilazione** e **decompilazione** grazie ai quali i giochi console girano in versione nativa su PC, con copertine dei giochi, filtri e ricerca.

## Come si usa

Apri `index.html` con un doppio clic. Non serve installare nulla.

Se il browser blocca il caricamento da `file://` (succede soprattutto con Safari), avvia un server locale nella cartella:

```sh
python3 -m http.server 8000
```

e visita <http://localhost:8000>.

## Da dove arrivano i dati

La pagina legge a ogni ricaricamento la tabella *List of unofficial ports* di PCGamingWiki tramite l'API pubblica del sito:

<https://www.pcgamingwiki.com/wiki/List_of_unofficial_ports>

È una lista curata dalla community: si aggiorna man mano che vengono aggiunti nuovi progetti, **senza che tu debba inserire nulla a mano**. Basta ricaricare la pagina o premere **Aggiorna**.

Ogni card mostra:

| Campo | Significato |
| --- | --- |
| Copertina | Box art del gioco (vedi sotto) |
| Nome gioco | Il gioco originale |
| Port | Nome del progetto (es. *Ship of Harkinian*, *BanjoRecomp*) |
| Tipo | Recomp (recompilazione statica) o Decomp (decompilazione, disassemblaggio, re-implementazione) |
| Stato | Giocabile / Completo; oppure In sviluppo, Alpha, Beta |
| Piattaforma | Console di provenienza (Nintendo 64, PlayStation, Xbox 360, …) |
| Linguaggio | Linguaggio del codice sorgente, quando indicato |
| Note | Note della wiki (es. tool usato: N64Recomp, RexGlue SDK) |

## Copertine

Le immagini provengono da tre fonti, in ordine di priorità:

1. **libretro-thumbnails** — box art delle versioni console (Nintendo, Sega, Sony, Xbox, arcade)
2. **PCGamingWiki** — copertina della scheda del gioco
3. **Wikipedia** — box art per i titoli non coperti dalle altre due fonti

Le immagini sono caricate in lazy loading e, se una non è disponibile, la card mostra un riquadro generato con le iniziali del gioco e il nome della piattaforma.

La mappa delle copertine è uno snapshot salvato in `data.js`: i progetti nuovi compaiono subito nella lista, ma la loro copertina può mancare finché non si rigenera lo snapshot.

## Filtri e scorciatoie

- Ricerca testuale su gioco, port, piattaforma e note
- Tipo: tutti / recomp / decomp (con conteggi)
- Piattaforma: tutte le console presenti nella lista
- Stato: giocabili (predefinito), tutti, in sviluppo
- Ordinamento per nome, piattaforma o stato
- Chip dei filtri attivi, rimovibili uno per uno, con **Azzera tutto**
- `/` porta il cursore nella ricerca, `Esc` cancella la ricerca
- I filtri sono salvati nell'URL, quindi condivisibili:

```text
index.html?type=decomp&platform=Nintendo%2064
```

## Aggiornamento

- **Ogni ricaricamento** rilegge la lista dalla fonte.
- Il pulsante **Aggiorna** forza una nuova lettura senza ricaricare.
- La barra di stato mostra il numero di progetti e la data dell'ultima modifica della pagina wiki.
- Se la rete non è disponibile, la webapp usa lo snapshot in `data.js` e lo segnala (pill gialla e barra di stato rossa).

## File

```text
index.html   struttura e contenuti
style.css    tema scuro, card con copertine, responsive
app.js       lettura dati, parsing, filtri, rendering
data.js      snapshot di fallback (624 progetti) + mappa copertine
```

## Note

- I progetti e le copertine appartengono ai rispettivi autori; nessun file di gioco è incluso o distribuito.
- Gli stati provengono dalla wiki e riflettono la situazione all'ultima modifica della pagina.
- Alcuni titoli della tabella sono port di giochi PC o re-implementazioni, non solo conversioni da console.
