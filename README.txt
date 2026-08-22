LIEBLINGSBILD.DE – BILDBERATER V4.3

KORREKTUR V4.3:
- Hochformat wurde zwar ausgewählt, aber die Vorschaufläche blieb optisch quer.
- Ursache war eine alte CSS-Begrenzung mit voller Breite und max-height.
- Der Vorschau-Rahmen übernimmt jetzt wirklich das Seitenverhältnis des gewählten Formats.

Beispiele:
- 30 × 45 cm Hochformat -> echter hochkantiger Rahmen
- 45 × 30 cm Querformat -> echter breiter Rahmen
- quadratische Formate -> quadratischer Rahmen
- Panorama -> entsprechend breiter Rahmen

WEITERHIN AKTIV:
- Original / Hochformat / Querformat frei auswählbar
- Ausschnitt per Maus oder Finger verschiebbar
- Zoom-Regler
- Live-Qualitätsberechnung
- automatische Empfehlung einer kleineren Größe bei Qualitätsverlust

CACHE:
- styles.css?v=4.3
- script.js?v=4.3
- sichtbare Kennung „Bildberater V4.3“

Auf GitHub ersetzen:
- index.html
- styles.css
- script.js
- README.txt

assets bleibt unverändert.
