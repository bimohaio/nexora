# Scheduler visibility integration

`VisibilitySchedulerAdapter` maps incremental entries to the existing animation manager's
`setEntityVisibility` capability and maps global policies to `setReducedMotion`. Offscreen,
occluded, hidden, collapsed and disabled entities pause scheduler work; visible and partially
visible entities resume. No new timer or frame loop is created.
