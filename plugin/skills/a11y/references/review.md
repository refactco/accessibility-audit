# The rules for the review questions

The engine raises a question when a rule cannot decide. Each question names its rule in `evidence.rule`. The families below say what to look at and what decides. The two answers are `issue` and `no issue`; `unsure` sends the question to a person. The answer applies to all pages with the same item, so decide for the item, not for one page.

## Text alternatives, 1.1.1

- `alt-empty-with-caption`, `image-alt-suspicious`, `alt-is-file-name`: look at the screenshot and the text around the image. An image that carries information needs an alt text that gives the same information. A decorative image, or an image whose information is in the text next to it, can have an empty alt. A file name, "image", or the name of the camera is never an alt text: `issue`.
- `image-alt` from axe-core as a question: the same rules.

## Images of text, 1.4.5

- `image-of-text`: the engine found an image in the content whose pixels look like text on a flat ground, and the screenshot shows it. `issue` when the image shows text that real text could present: a banner, a heading, a button, a quote, a price, or a table as a picture. `no issue` when the image is a logo or a brand name, a chart or a diagram, an illustration, a photo with text in it, or a screenshot of a product. `no issue` also when the same text stands next to the image as real text. The facts give the colors, the size, the text alternative, and the text near the image.

## Language, 3.1.2

- `block-language`: `evidence.facts.text` is the passage, `detected` the language the engine guessed. A real passage in another language, longer than a name or a term, needs a lang attribute: `issue`. A name, a brand, a quote of a few words, or code: `no issue`.

## Color and contrast, 1.4.3, 1.4.11

- `color-contrast` from axe-core: axe could not measure the background, for example over an image or a gradient. Look at the screenshot: when the text sits on a solid color, estimate the contrast from the colors in `facts`; 4.5:1 for normal text, 3:1 for large text. Text on a photo with no overlay is usually `issue`.
- `placeholder-contrast`, `control-border-contrast`, `focus-indicator-contrast`: the facts give the measured contrast. A border or an outline that is the only visual sign of the control or of the focus needs 3:1.

## Focus and keyboard, 2.1.2, 2.4.3, 2.1.4, 2.5.x

- `keyboard-trap`: the focus could not leave an element with Tab. `issue` unless the page tells the user how to leave, for example with Esc, and that works.
- `focus-leaves-dialog`: a dialog that stays open while the focus moves behind it. A modal dialog: `issue`. A non-modal panel that closes on its own: `no issue`.
- `single-key-shortcut`: a character key changed the page. `issue` when the key is a shortcut with no way to turn it off or remap it, and the key works when no field has the focus. A key that only typed into a search field: `no issue`.
- `drag-listener`, `down-event-listener`: the engine found a handler. `issue` when the function needs the drag or the press with no other way, for example a slider with no buttons. `no issue` when buttons or keys do the same.

## Content that moves or changes, 2.2.2, 1.4.2

- `content-updates-by-itself`: content changed with no user action. `issue` when it moves or updates for more than five seconds with no pause, stop, or hide control. A clock, a progress indicator, or an advertisement with a pause control: `no issue`.
- `moving-content`: the same, for an animation or a marquee.
- `no-autoplay-audio`: audio that starts on its own for more than three seconds with no control: `issue`.

## Structure and labels, 1.3.1, 1.3.2, 1.3.3, 1.3.5, 3.3.2, 4.1.2, 4.1.3

- `list-without-list-code`, `table-no-headers`: the screenshot shows the visual structure. When the visual structure is a list or a data table and the markup is not: `issue`.
- `visual-order-differs`: the reading order of the code differs from the visual order. `issue` when the difference changes the meaning or the sequence of a task.
- `sensory-instruction`: an instruction uses only shape, size, position, or sound, for example "the button on the right". `issue` unless the text also names the control.
- `personal-field-no-autocomplete`: a field for a name, an email, a phone, or an address with no autocomplete attribute: `issue`. A field for a search or a comment: `no issue`.
- `field-no-visible-label`: a field with a label only in the code. `issue` unless a visible text next to the field names it.
- `message-not-in-live-region`: new text after a button that a screen reader does not announce. `issue` when the text is a status message, for example "Added to the cart". `no issue` when it is content the user opened, for example a panel or a dialog.
- `duplicate-id-aria`, `aria-valid-attr-value`, and the other axe-core questions on ARIA: read the HTML. Decide as the axe-core message says.

## Links and titles, 2.4.2, 2.4.4, 2.4.5, 2.4.6

- `generic-link-text`: a link with a text like "Read more". `issue` when the text and its context, the sentence or the card around it, do not say where the link goes. `no issue` when the card title next to it makes the target clear and the link is in the same container.
- `same-title`: two or more pages with the same title. `issue` for pages with different content, for example two articles. `no issue` for pages of one list with pagination when the title names the page number.
- `page-not-linked`: pages that no crawled page links to. The crawl skips list pages beyond the address group limit, so a post that is linked from a later list page is `no issue`. A page that only the sitemap knows: `issue`.
- `generic-heading`: a heading like "More" or "Details". `issue` when the heading does not describe its section.

## Layout, 1.4.4, 1.4.10, 1.4.12

- `text-cut-at-zoom`, `text-cut-with-spacing`: a container cuts its text at 200% zoom or with the text spacing of 1.4.12. `issue` when the cut text is not available in another way. `no issue` when the container scrolls, or shows the text on focus, or the cut part is decorative.
- `no-reflow`: the page needs a horizontal scroll at 320 px. `issue` unless the content needs two dimensions, for example a data table, a map, or a toolbar.

## Processes and forms, 3.2.2, 3.3.1, 3.3.3, 3.3.4

- `change-of-context-on-input`: a select loads a new page on change. `issue` unless a text before the select says so.
- `error-not-linked`: error text exists but nothing connects it to the field. `issue` unless the error text names the field in words.
- `error-without-suggestion`: the error does not say how to correct the input. `issue` for "Invalid input"; `no issue` when the message or a visible hint next to the field gives the format or an example.
- `financial-form`: a form that commits money, a legal action, or user data. This is a candidate for a person, not for you.

## When the evidence is not enough

Open the page, read-only, at the width and the state of the example. Do not submit forms, do not log in, do not change settings. When the page differs from the evidence, say so in the reason and answer `unsure`.

## The former checks for a person, now with the facts of the engine

Since 2026-10-14 the AI answers these too. The engine gives the facts; decide from them, and open the page when they are not enough. Answer `unsure` when the decision needs something you cannot do, for example to hear the audio.

- `media-found` for 1.2.1 on audio: `facts.nearbyLinks` lists the links near the player whose text or address says transcript, caption, or text version. A transcript link, or the full text next to the player: `no issue`. None: `issue`. For 1.2.1 on a video: the same, for a video without speech or with a text version; a muted decorative loop with no information: `no issue`. A silent video that shows text, screens, or a comparison that the page gives nowhere else carries information: `issue` when no text alternative gives it. When you cannot tell what the video shows, open the page, take a screenshot of the video element, or look at its frames with Playwright; when that does not settle it, `unsure`.
- `media-found` for 1.2.2 captions: `facts.captionTracks` counts the caption and subtitle tracks of the video. A video with speech and no caption track and no visible caption control: `issue`. A muted or silent video (`facts.hasAudioTrack` false, or `muted` true with no sound): `no issue`. Unknown sound: `unsure`.
- `media-found` for 1.2.3 and 1.2.5 audio description: `facts.descriptionTracks`, a text alternative or transcript link, and whether the picture carries information that the sound does not say. A talking head or a screen recording with narration: `no issue`. A video whose visuals carry information with no description and no text version: `issue`. Unknown: `unsure`.
- `player-found` for an embedded player: `facts.src` names the service. Decide from the links near it as for 1.2.1; when the content of the player is not visible to you, `unsure`.
- `drag-listener`: `facts.buttonsNearby` lists the buttons and links in the same container, and `facts.focusable` says if the element takes the focus. Buttons that move the item, or a keyboard operation of the same function: `no issue`. No other way: `issue`.
- `down-event-listener`: `issue` when the action completes on the press with no cancel or undo.
- `financial-form`: `facts.submitText`, `facts.stepText`, and `facts.reviewWords` say if the form announces a review step, a confirmation, or a step count. A review page, a confirmation checkbox, or a way to cancel: `no issue`. A one-step commitment with no check: `issue`.
- `login-form`: `facts.password.onpaste` true means a paste handler on the password field, which usually blocks the paste: `issue`. `facts.alternative` names another method, for example a sign-in link or a passkey: `no issue`. `facts.captcha` true with no alternative: `issue`.
- `timer-found`: `facts.snippet` shows the script with the timer and the navigation. A session or a redirect after a fixed time with no warning and no way to extend: `issue`. A redirect under 20 hours that the user can turn off, or an essential one: `no issue`.
- `single-key-shortcut`, `motion-listener`, `touch-gesture`: as above in this file; a candidate with no evidence of a user function: `no issue`.
- `no-autoplay-audio` from axe-core: open the page and read `video.muted`, `video.volume`, and whether a script set the `muted` attribute. A muted autoplay video plays no audio: `no issue`. Audio that plays for more than 3 seconds with no control: `issue`.
- `moving-content`, `content-updates-by-itself`: a marquee or an animation that runs for more than 5 seconds with no pause, stop, or hide control is `issue`, also when it stops on hover only. A count-up animation that ends within 5 seconds is `no issue`. Look for a pause control on the page when the facts do not show one.
- `drag-listener` on a canvas or a scene with no user function, for example a decorative 3D background: `no issue`.
- `focus-leaves-dialog`: a non-modal panel, for example a navigation menu whose toggle button stays reachable and which closes with Esc, can be `no issue`. Decide from what the page shows.
- `focus-indicator-contrast`: the facts give the outline color and the measured contrast with the background. When the outline is the only visual sign of the focus and its contrast is under 3:1: `issue`. Look at the picture for another sign of the focus, for example a background change.
- `color-contrast` with measured numbers: the question gives the main, worst, and best contrast and the share of the background that passes. Look at the picture: when the part of the background that fails sits under readable text, for example an animated pattern behind small text, `issue`; when it is a small decoration, a border, or an image corner away from the letters, `no issue`. Never estimate a ratio by eye; use the numbers.
- `text-cut-at-zoom`, `text-cut-with-spacing`: `no issue` when the container scrolls, the text is in an aria-label or a visible title, or the cut part is a few pixels of a letter. Open the page at the width and apply the zoom or the spacing when the facts do not settle it.
- `same-title`: two addresses of one error page, or a path with and without a trailing slash, are `no issue`.
- `help-position-differs`: the facts give where the help links are on this page (`here`) and on the other pages (`common`). An extra help link on one page is not an issue by itself; an issue is a help link that moves to another relative place in the page set.
