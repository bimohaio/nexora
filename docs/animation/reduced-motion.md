# Reduced Motion

Motion preference is obtained through `MotionPreferenceSource`, never directly
from browser globals. Policies can disable, freeze, replace with static state or
reduce rate. The reduce-rate factor must be between zero and one.

Alarm meaning must survive suppression. An alarm animation rule therefore needs a
static indicator/overlay or explicit reduced-motion fallback.
