# Visibility

`EntityVisibilityProvider` reports semantic visibility independent of
`IntersectionObserver` and the DOM. Policies may always run, pause or throttle
offscreen work, or pause when the document is hidden.

The default architectural expectation for later scheduling is to pause unnecessary
offscreen motion. Semantic alarm and accessibility state remains available.
