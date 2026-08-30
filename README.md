# Web Media Inspector

A lightweight, local-first, open-source tool for listening, looping, inspecting, and transcribing music from video or audio — directly in the browser.

**Live demo:** https://tangkk.github.io/web-media-inspector/
**GitHub:** https://github.com/tangkk/web-media-inspector

> Slow it down. Loop it. EQ it. See it. Transcribe it.

Web Media Inspector is built for people who learn music by ear, transcribe performances, inspect phrases closely, and want a fast browser tool instead of a heavy DAW workflow.

Because it is **open source**, you can use it freely, inspect how it works, modify it for your own workflow, and host your own version if you want.

---

## Why this exists

When you are transcribing music, the hard part usually is not pressing play.
The hard part is:

- hearing the same short phrase enough times
- isolating what matters in a dense mix
- navigating precisely to attacks and note boundaries
- seeing pitch motion clearly enough to confirm what you think you heard

Web Media Inspector is designed to make that process feel quick and direct.

---

## What it does

### Core listening workflow

- load **local video or audio files** directly in the browser
- set **A/B loops** for short repeated listening
- **slow down playback** for hard passages
- **zoom into the waveform** for precise navigation
- **scrub quickly** through the material

### EQ for hearing through the mix

- built-in EQ presets for instruments like:
  - Guitar
  - Bass
  - Saxophone
  - Piano
  - Vocal
  - Trumpet
  - Drums
- manual EQ adjustment with draggable points

### Transcription view

- transcribe the current **A/B loop** into a **piano-roll note view**
- hover notes to see **pitch names** clearly
- preview pitches by pressing / dragging in the piano-roll area
- horizontal scrolling for longer windows
- playback cursor that **automatically follows** inside the transcription panel
- custom horizontal scrollbar for easier navigation

### Pitch range modes

- **Focus mode**
  - estimates the useful pitch range from note distribution
  - suppresses extreme outliers
  - gives a tighter, more readable default view
- **2 octave mode**
  - fixed compact range
  - useful when you want a consistent visual window

### Waveform interaction improvements

- dragging **A / B markers** takes priority when the pointer is actually on them
- **scrub** still works normally when you are not directly hitting A or B

---

## Why it is useful

This tool is especially helpful for:

- transcribing guitar lines from live videos
- following bass movement in dense arrangements
- checking vocal melody details
- inspecting piano voicings or horn phrases
- learning songs from downloaded clips or screen captures
- ear training with short repeated loops

It combines the things that matter most during transcription:

- repeat listening
- precise seeking
- waveform guidance
- playback speed control
- EQ emphasis
- note visualization

That combination makes it much easier to confirm:

- where a note starts
- where it ends
- whether you really heard the pitch correctly
- how a phrase moves over time

---

## What makes it different

Web Media Inspector is intentionally simple:

- **local-first** — your files stay in your browser
- **fast to open** — no account, no upload pipeline
- **focused** — built for transcription and close listening, not full production
- **open source** — transparent, hackable, and easy to extend

If you want a practical transcription helper rather than a full DAW, this is the point.

---

## Typical workflow

1. Open a local video or audio file
2. Find the phrase you want to study
3. Set an **A/B loop** around it
4. Slow playback if needed
5. Apply an EQ preset to highlight the target instrument
6. Zoom into the waveform for more precise navigation
7. Run **Transcribe A-B**
8. Switch between **Focus** and **2 octave** view if needed
9. Hover notes and loop until the phrase is clear enough to write down

---

## Notes

- This is a **listening and transcription tool**, not a DAW.
- EQ presets are practical listening aids, not mixing presets.
- The transcription panel is meant to help you inspect and confirm notes, not replace musical judgment.
- Short, relatively clean, single-instrument passages usually work best.

---

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

To test from another device on the same Wi‑Fi:

```bash
npm run dev -- --host 0.0.0.0
```

Then open:

```text
http://<your-mac-lan-ip>:5173/web-media-inspector/
```

---

## Open source

Web Media Inspector is open source.

- Live demo: https://tangkk.github.io/web-media-inspector/
- Source code: https://github.com/tangkk/web-media-inspector

If this tool is useful to you, feel free to fork it, adapt it, and build your own transcription workflow on top of it.
