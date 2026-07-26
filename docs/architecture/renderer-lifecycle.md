# Renderer lifecycle

```text
constructed → mounted → rendered/updated → unmounted
      └──────────────────────────────────────→ disposed
```

`mount` validates an HTML target, creates the accessible hierarchy, installs delegated listeners, and sizes the SVG. A second mount throws `RENDERER_ALREADY_MOUNTED`. `unmount` removes listeners, DOM, maps, references, and pending frames. `dispose` is idempotent and permanently invalidates future use.

Rendering before mount and use after disposal throw typed errors. Missing symbol renderers recover through a visible fallback and warning event.
