# Overlay priority

Priority is deterministic: emergency, critical/communication, high or process warning,
maintenance/operational states, unacknowledged, acknowledged, then custom/normal. `resolveOverlayPriority`
is pure and the layer ID provides a total-order tie breaker.
