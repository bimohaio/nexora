# Runtime overlay flow

```text
AlarmPresentation -> pure overlay resolvers -> OverlayStack
                  -> AlarmOverlayStore + AlarmVisualDiff
                  -> OverlaySnapshot -> RuntimeVisualSnapshot -> renderer
```

Only changed scope IDs are reprojected. Theme, motion and enable policy changes reuse the current
presentation snapshot. No timer, datasource, SVG, DOM, Canvas, CSS or HTML dependency exists.
