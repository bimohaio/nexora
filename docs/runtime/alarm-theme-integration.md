# Alarm theme integration

Presentation uses semantic tokens such as `alarm.high.fill`, `alarm.critical.stroke`,
`alarm.emergency.overlay`, and `alarm.medium.text`. Tokens are identifiers, never colors or CSS.
An `AlarmTheme` may alias semantic identifiers to another semantic token set.

`setTheme` reprojects existing resolved aggregates and leaves the alarm snapshot revision intact.
It therefore cannot activate, clear, acknowledge, suppress, or reprioritize an alarm. Renderers map
the resulting tokens to platform-specific theme resources.
