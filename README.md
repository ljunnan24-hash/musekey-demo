# MuseKey / KeyJam

**Turn typing into music.** MuseKey is a browser-based music playground where every keystroke becomes a note, a beat, and a tiny performance. The web demo gives you an expressive keyboard instrument; the companion **Maestro Stickman** Chrome extension brings a floating musician to ordinary writing surfaces.

![KeyJam playing screen](docs/screenshots/keyjam-playing.png)

## Why Judges Should Try It

Most music tools ask people to learn a new interface before they can feel creative. KeyJam starts from the one instrument everyone already has muscle memory for: the keyboard.

- **Instant gratification:** click once, type anything, and hear a musical phrase.
- **Low-friction creativity:** no MIDI controller, DAW, account, or upload required.
- **Character feedback:** Maestro Stickman reacts to typing speed, mood, clicks, hover, and music style.
- **Privacy-first:** typing content is never read, stored, or uploaded; the app only reacts to keyboard timing/events.
- **Hackathon-ready scope:** web instrument + Chrome extension + shared sound/style language.

## Demo Screens

![KeyJam start screen](docs/screenshots/keyjam-home.png)

KeyJam starts as a quiet stage: click anywhere, then type on `QWERTY` rows to play different note ranges.

![KeyJam performance screen](docs/screenshots/keyjam-playing.png)

During performance, keys glow with the notes you trigger. Styles include **Lo-fi**, **EDM**, **Jazz**, and **Ambient**.

## What It Does

### KeyJam Web App

- Maps keyboard rows to musical ranges:
  - `QWERTYUIOP`: higher notes
  - `ASDFGHJKL`: middle notes
  - `ZXCVBNM`: lower notes
- Uses Tone.js/Web Audio for real-time synth playback.
- Lets users switch between Lo-fi, EDM, Jazz, and Ambient vibes.
- Shows animated key feedback so typing feels like playing an instrument.

### Maestro Stickman Chrome Extension

- Injects a floating stickman musician into ordinary webpages.
- Reacts to typing states: idle, slow typing, normal typing, fast typing, resting, sleeping, clicked, annoyed.
- Plays the same style family as KeyJam while you type outside the demo page.
- Hovering opens a style bubble so the user can choose the musical mood.
- Avoids password fields and does not inspect typed content.

## Architecture

```text
musekey-demo/
├── index.html                 # KeyJam web instrument
├── server.js                  # zero-dependency local static server
├── assets/                    # demo audio + public-domain song metadata
├── docs/
│   ├── PRD.md                 # product requirements
│   └── screenshots/           # README demo images
└── maestro-stickman/          # Chrome MV3 extension
    ├── src/content/           # injected React widget
    ├── src/logic/             # typing state + music logic
    ├── src/styles/            # stickman and piano animations
    └── dist/                  # built extension, loaded in Chrome
```

## Run The Web Demo

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), click the stage once, then type.

## Load The Chrome Extension

```bash
cd maestro-stickman
npm install
npm run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select:

```text
maestro-stickman/dist
```

Open any ordinary webpage with an input box and start typing. The floating Maestro appears outside the KeyJam web demo so the web page stays smooth while the extension handles the companion character experience.

## Verification

```bash
npm run lint

cd maestro-stickman
npm run build
node scripts/repro.mjs
```

Current checks cover the web code style, extension build, content-script injection, typing state changes, page bridge behavior, and Maestro style interactions.

## Privacy

MuseKey is designed around local, ephemeral interaction:

- No typed text is collected.
- No typing history is stored.
- No audio is uploaded by the core demo.
- Maestro only uses key timing and key labels needed to trigger sound.
- Password fields are ignored by the extension.

## Roadmap

- [x] Keyboard-to-music web demo
- [x] Four playable styles: Lo-fi, EDM, Jazz, Ambient
- [x] Chrome extension companion character
- [x] Hover style picker for Maestro Stickman
- [x] Tone.js-based extension audio with shorter note tails
- [ ] Replace fallback SVG with a polished Rive `.riv` character
- [ ] Add richer call-and-response phrases
- [ ] Package a desktop companion for Word/Notes/native apps
- [ ] Add recording and shareable performance clips

## Credits

Built for a hackathon prototype sprint by exploring one simple question:

> What if writing itself could feel like playing music?
