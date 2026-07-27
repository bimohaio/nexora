# Screen Reader Support

Screen reader output is isolated behind `ScreenReaderAdapter`.

```text
selection / focus / status / warning / error
                     |
                     v
              AnnouncementQueue
                     |
                     v
                 LiveRegion
                     |
                     v
            ScreenReaderAdapter
```

The engine produces semantic announcements without browser dependencies. `SvgLiveRegionAdapter`
is one DOM implementation and maintains separate polite and assertive regions.
