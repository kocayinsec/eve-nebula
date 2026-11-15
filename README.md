# EVE Nebula

A violet deep-space look for the Claude desktop and mobile apps, made as a Claude Code mod.

- **Palette:** ink-violet surfaces, lavender text, a violet accent, a cold HUD cyan for literals, jade, Amarr gold and rose for meaning.
- **A living backdrop:** a layered nebula drifting over a quiet starfield, with the odd warp trail.
- **A capacitor you can read:** a ringed, Saturn-style planet sits left of the conversation. Its middle ring holds twenty capacitor cells, one for each twentieth of the context window still free. They go dark one by one as the window fills, lavender while there is room, gold under half, rose in the last quarter, pulsing at the very end. Under the planet: `CAPACITOR 62%` and what is left against the capacity, `124k / 200k`.
- **The assistant's words in light orange,** while the look is on. Code blocks keep the app's code drawing and tables its own markdown.

## Install

At the prompt of a terminal session:

```
/plugin install eve-nebula --marketplace kocayinsec/eve-nebula
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```bash
claude plugin install eve-nebula --marketplace kocayinsec/eve-nebula
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `kocayinsec/eve-nebula`, then Add plugin.

## Use

| Command | What it does |
| --- | --- |
| `/eve-theme` | Turns the look off if it is on, on if it is off |
| `/eve-theme on` / `off` | Turns it on or off |
| `/eve-theme status` | Says which, with the capacitor reading |

The choice is shared: every open chat follows it within a few seconds, and new chats start from it. It is kept in `~/.claude/mods/eve-nebula.state.json`.

## Notes

- The look is made for dark mode; set the app's appearance to Dark or System.
- The desktop and mobile apps draw it; a terminal session does not.
- The planet is placed for a window about 1.6 times as wide as tall with the sidebar open. Narrower windows shrink it, and below about 1.35 it steps aside. With the sidebar collapsed it sits closer to the conversation column.
- The capacitor reads the same context figure as the status line, refreshed after every reply.

## Development

```bash
claude plugin validate .
claude plugin test .
```

`hooks/register.tsx` holds the palette, the scene and the commands; `hooks/prose.tsx` redraws the assistant's prose; `hooks/make-colors.js` turns a few anchor colours into the app's full palette.

---

A fan-made look inspired by EVE Online. Not affiliated with or endorsed by CCP Games; the art here is original.
