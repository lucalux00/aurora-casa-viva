# Aurora Casa Viva — animated floor plan card for Home Assistant

🇮🇹 [Leggi in italiano](README.it.md)

![Aurora Casa Viva](docs/hero-sera.webp)

Draw your floor plan in the browser and Home Assistant brings it to life: sunlight comes in through the right windows at the right time, rooms light up with your lights, a trail follows whoever walks from room to room, and a slider replays the last 24 hours from your real history.

- **Live demo (no install):** https://domotikpro.it/aurora-casa-viva-demo/index.html
- **"Draw your floor plan" editor:** https://domotikpro.it/aurora-casa-viva-editor/index.html
- **Full illustrated guide (Italian):** https://domotikpro.it/progetti/aurora-casa-viva

| Morning sun | Heat map | Mobile |
|---|---|---|
| ![Sun](docs/sole-mattina.webp) | ![Heat map](docs/mappa-calore.webp) | ![Mobile](docs/telefono-demo.webp) |

## Features
- **Real sunlight:** sun azimuth and elevation from your Home Assistant location; beams go through each window, with sill height, top height and clouds
- **Time machine:** the last 24 hours from the recorder, by dragging a slider or as a fast replay
- **Presence trail** between rooms; with LD2450 radars (e.g. Apollo MTR-1) people are shown where they actually are, together with the radar zones (filled when someone is inside), with LD2410 radars (e.g. Apollo MSR-2) as distance rings
- **Heat map** of where time was spent and **energy map** with kWh and cost per room
- Energy flowing from the panel to appliances, sound waves, air from open windows, rain stopping at the walls, alarm, cameras
- **Waste collection bins** in the evening and **doorbell/peephole** with the latest snapshot
- **Tap** a room to toggle its lights, **long-press** for details; unavailable sensors are flagged on the plan
- **Vertical Short** (1080×1920) recorded with one button
- One JavaScript file, no build step, HACS optional, no cloud

## Install
The step-by-step version is in [`aurora-casa-viva/LEGGIMI.txt`](aurora-casa-viva/LEGGIMI.txt) (Italian). Short version:

**With HACS (copies the card and adds the resource for you):** HACS → ⋮ → *Custom repositories* → add `https://github.com/lucalux00/aurora-casa-viva`, type *Dashboard* → search **Aurora Casa Viva** → *Download* → reload the browser, then do steps 1 and 4. Without HACS, follow all the steps.

1. **Draw the floor plan** with the editor (online or [`aurora-casa-viva/editor/index.html`](aurora-casa-viva/editor/index.html), works offline) and copy the code from the *Codice* tab.
2. **Copy the card:** put `aurora-casa-viva/www/aurora-casa-viva` into the `www` folder of your Home Assistant configuration.
3. **Add the resource:** Settings → Dashboards → ⋮ → Resources → `/local/aurora-casa-viva/aurora-casa-viva.js?v=1`, type *JavaScript module*.
4. **Paste the card:** dashboard → pencil → Add card → Manual → paste → Save.

The card is named `custom:aurora-casa-viva`. A complete example home is in [`aurora-casa-viva/scheda-esempio.yaml`](aurora-casa-viva/scheda-esempio.yaml). The interface and comments are in Italian; options are plain YAML keys.

## Privacy
Everything runs in your Home Assistant and your browser: no data is sent anywhere. The only external request is Google Fonts (Manrope, Sora); set `fonts: false` to remove it. The editor also works only in your browser: the floor plan image is never uploaded.

## License
[GPL-3.0](LICENSE). You can use, study, modify and share the card, also commercially, as long as every modified version you distribute stays under GPL-3.0, comes with its source code and keeps the original notice: © 2026 DomotikPro.it (Luca Pinelli).

The name "Aurora Casa Viva" and the DomotikPro.it brand are not covered by the license: a modified version must use a different name.

© 2026 [DomotikPro.it](https://domotikpro.it)
