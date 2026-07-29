# Alarm Visualization Architecture

This package models alarm visualization, not an alarm server. Runtime or binding
inputs produce transient `AlarmState`; priority and visual resolvers produce
renderer-neutral state; renderers apply semantic tokens and non-color cues.

Persistence, history, notification delivery, distributed acknowledgment authority
and security workflows are outside this phase.
