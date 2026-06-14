# Maestro Stickman Rive Asset Spec

Create a 160 x 160 px piano-only Rive file and export it as:

```text
public/maestro_stickman.riv
```

Names must match exactly:

```text
Artboard: Stickman
State Machine: StickmanMachine
Input: character_state
```

`character_state` must be a numeric input:

```text
0 = idle
1 = typing_slow
2 = typing_normal
3 = typing_fast
4 = resting
5 = sleeping
6 = clicked
7 = annoyed
```

First version scope:

```text
idle: subtle breathing, head gently moves
typing_slow: both hands slowly play piano
typing_normal: both hands play at a normal pace, head nods to rhythm
typing_fast: body leans forward, both hands play quickly
resting: body sinks slightly, blank/staring pose
sleeping: sleeps on the piano
clicked: looks up at user and waves
annoyed: body shakes as if poked too many times
```

Do not include guitar, violin, drums, outfit changes, band members, or growth systems in v1.

After export:

```bash
npm run verify:rive
npm run build
```
