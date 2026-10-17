# Devgraph roadmap observer

Read-only roadmap frontend with optional gate/chest and milestone skill-tree views.
Devgraph owns Work; this UI displays a projection and never grants authority or
infers completion from archived/legacy acceptance fields.

```sh
npm run check
npm run dev
```

Open http://127.0.0.1:4173 or /journey.html for the skill tree. The two bundled
examples use fabricated Work IDs, titles, descriptions, evidence labels and token
measurements. They contain no real Devgraph or Zendo snapshots. Unknown estimates
and token observations remain unknown. The schemas and read-only source adapters
are versioned; generic package/API extraction is still future work.

The optional local live adapter is a bounded example-specific read profile, not
a universal Devgraph connector. It needs explicit operator-owned configuration
and a separately reviewed scope; it is disabled by default. Keep credentials out
of browser assets. Installation/deployment belongs in the separate
[Zenith Hub lightweight](https://github.com/ZenithResearch/zenith-hub-lightweight).

Original private history and operational evidence remain unchanged. This public
baseline preserves existing licensing; no new project reuse license is granted.
