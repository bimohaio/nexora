# Reduced motion

`resolveMotionPolicy` selects one deterministic global policy in this order: runtime override,
user, document, application, then system. Supported policies are full, reduced, minimal, static,
accessibility and diagnostic motion. Policies change presentation permission only; runtime state and
animation progress remain intact.
