LIEBLINGSBILD.DE – BILDBERATER V4.2

FEHLERBEHEBUNG:
- Die Ausschnitt-Vorschau blieb teilweise schwarz.
- Ursache: Die Vorschau wurde berechnet, solange der Crop-Bereich noch ausgeblendet war.
- Jetzt wird der Crop-Bereich zuerst sichtbar gemacht.
- Erst danach werden Breite/Höhe, Bildskalierung, Zoom und Position berechnet.
- Nach dem Laden des Bildes wird die Vorschau zusätzlich automatisch neu aufgebaut.
- Bei Browser-/Fenstergrößenänderung bleibt die Neuberechnung aktiv.

WEITERHIN:
- Original, Hochformat und Querformat bleiben frei anklickbar.
- Ausschnitt frei verschiebbar.
- Zoom frei einstellbar.
- Live-Bildqualität und kleinere Größenempfehlungen bleiben aktiv.

CACHE:
- styles.css?v=4.2
- script.js?v=4.2
- sichtbare Kennung „Bildberater V4.2“

Auf GitHub ersetzen:
- index.html
- styles.css
- script.js
- README.txt

assets bleibt unverändert.
