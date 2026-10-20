// Plain words for the report: what a person meets on the page for each rule, and who the criterion affects.
// A client who knows nothing of WCAG reads these. The exact rule and criterion stay next to them for the audit.
import { CRITERIA_BY_ID } from "../criteria.ts";

export interface Plain { title: string; experience: string }

const PLAIN: Record<string, Plain> = {
  "color-contrast": { title: "Text with too little contrast", experience: "The text is hard to read against its background, for people with low vision and for anyone in bright light." },
  "placeholder-contrast": { title: "Faint placeholder text in a field", experience: "The hint inside the field is too light to read, so a person does not know what to enter." },
  "control-border-contrast": { title: "A field or button with a faint outline", experience: "The edge of the control is too light to see, so a person cannot tell where the field is." },
  "focus-indicator-contrast": { title: "A focus ring that is hard to see", experience: "A person who uses the keyboard cannot see which control is selected." },
  "focus-not-visible": { title: "No visible focus", experience: "A person who moves through the page with the Tab key cannot see where they are." },
  "focus-entirely-hidden": { title: "The selected control is hidden under another part", experience: "With the keyboard, the selected link or button sits under a sticky header or a menu, so the person cannot see it." },
  "keyboard-trap": { title: "The keyboard gets stuck", experience: "A person who uses the keyboard enters a part of the page and cannot leave it." },
  "dialog-without-exit": { title: "A dialog that does not close with the keyboard", experience: "A person who uses the keyboard cannot close the dialog and cannot continue." },
  "focus-leaves-dialog": { title: "The keyboard leaves an open dialog", experience: "With the keyboard, the person moves behind an open dialog and loses their place." },
  "control-not-focusable": { title: "A control that the keyboard cannot reach", experience: "Something works with a click, but a person who uses the keyboard cannot reach it at all." },
  "control-without-role": { title: "A control that a screen reader does not announce", experience: "A screen reader does not say that the element is a button, so the person does not know it can be used." },
  "composite-parts-unreachable": { title: "Parts of a control that the keyboard cannot reach", experience: "A person who uses the keyboard cannot reach every option of the control." },
  "positive-tabindex": { title: "A jumping keyboard order", experience: "The Tab key moves through the page in a confusing order." },
  "link-name": { title: "A link with no name", experience: "A screen reader reads the link as \"link\" and nothing else, so the person does not know where it goes." },
  "button-name": { title: "A button with no name", experience: "A screen reader reads the button as \"button\" and nothing else." },
  "image-alt": { title: "An image with no text alternative", experience: "A person who cannot see the image gets nothing in its place." },
  "alt-empty-with-caption": { title: "An image with an empty text alternative", experience: "A person who cannot see the image misses what it shows." },
  "alt-is-file-name": { title: "A file name as the text alternative", experience: "A screen reader reads a file name instead of what the image shows." },
  "image-of-text": { title: "Text as a picture", experience: "The text in the picture cannot be enlarged, searched, or read aloud like real text." },
  "label": { title: "A field with no label", experience: "A screen reader does not say what the field is for." },
  "field-no-visible-label": { title: "A field with no visible label", experience: "Once the person starts to type, nothing on the screen says what the field is for." },
  "aria-input-field-name": { title: "A field with no name", experience: "A screen reader does not say what the field is for." },
  "select-name": { title: "A list with no name", experience: "A screen reader does not say what the list of options is for." },
  "label-content-name-mismatch": { title: "A control whose spoken name differs from its visible text", experience: "A person who speaks commands says the text they see, and the control does not react." },
  "personal-field-no-autocomplete": { title: "A field that the browser cannot fill in", experience: "The browser cannot fill in a name, an email, or an address, so a person who has trouble with typing must type it all." },
  "autocomplete-valid": { title: "A wrong autocomplete setting", experience: "The browser fills in the wrong value, or nothing." },
  "target-too-small": { title: "A target that is too small to hit", experience: "A person with unsteady hands or a large finger misses the control or hits the one next to it." },
  "target-size": { title: "A target that is too small to hit", experience: "A person with unsteady hands or a large finger misses the control or hits the one next to it." },
  "text-cut-at-zoom": { title: "Text cut off at 200 percent zoom", experience: "When a person enlarges the page to read it, part of the text disappears." },
  "text-cut-with-spacing": { title: "Text cut off with wider spacing", experience: "When a person sets wider letter and line spacing to read better, part of the text disappears." },
  "no-reflow": { title: "The page needs a sideways scroll", experience: "On a phone or at a high zoom, the person must scroll sideways to read each line." },
  "moving-content": { title: "Movement that cannot be paused", experience: "Something moves without an end, and there is no way to stop it. It distracts, and some people cannot read next to it." },
  "content-updates-by-itself": { title: "Content that changes by itself", experience: "Part of the page keeps changing with no control to pause it." },
  "autoplay-no-control": { title: "Sound that starts by itself", experience: "Sound plays on its own and there is no way to stop it, which covers a screen reader's voice." },
  "no-autoplay-audio": { title: "Sound that starts by itself", experience: "Sound plays on its own and there is no way to stop it." },
  "fast-animation": { title: "Flashing content", experience: "Something flashes fast enough to cause a seizure in some people." },
  "media-found": { title: "A video or audio without a text alternative", experience: "A person who cannot see or hear the media gets none of its information." },
  "video-caption": { title: "A video without captions", experience: "A person who cannot hear misses what is said in the video." },
  "player-found": { title: "An embedded player without a text alternative", experience: "A person who cannot see or hear the media gets none of its information." },
  "same-title": { title: "Pages with the same title", experience: "In the browser tabs and in the history, several pages have the same name, so a person cannot tell them apart." },
  "page-not-linked": { title: "A page that no link reaches", experience: "A person can only reach the page by its address." },
  "generic-link-text": { title: "A link that says only \"Read more\"", experience: "A screen reader user who jumps from link to link hears the same words and does not know where each goes." },
  "generic-heading": { title: "A heading that says nothing", experience: "A person who scans the headings cannot tell what the section is about." },
  "no-bypass": { title: "No way to skip the repeated top of the page", experience: "A person who uses the keyboard must pass every menu link on every page before the content." },
  "bypass": { title: "No way to skip the repeated top of the page", experience: "A person who uses the keyboard must pass every menu link on every page before the content." },
  "block-language": { title: "A passage in another language with no mark", experience: "A screen reader reads the passage with the wrong pronunciation." },
  "page-language-mismatch": { title: "The page declares the wrong language", experience: "A screen reader reads the whole page with the wrong pronunciation." },
  "html-has-lang": { title: "The page declares no language", experience: "A screen reader may read the page with the wrong pronunciation." },
  "document-title": { title: "A page with no title", experience: "The browser tab and the history show no name for the page." },
  "list-without-list-code": { title: "A list that is not marked as a list", experience: "A screen reader does not say how many items the list has, or where it starts and ends." },
  "list": { title: "A list with wrong structure", experience: "A screen reader announces the list wrongly." },
  "listitem": { title: "A list item outside a list", experience: "A screen reader announces the items without the list." },
  "table-no-headers": { title: "A table without header cells", experience: "A screen reader cannot say which column or row a cell belongs to." },
  "visual-order-differs": { title: "A reading order that differs from the visual order", experience: "A screen reader or the keyboard moves through the content in an order that does not match what a sighted person sees." },
  "navigation-order-differs": { title: "A menu in a different order on some pages", experience: "A person who learned the menu finds it changed on another page." },
  "help-position-differs": { title: "The help links move between pages", experience: "A person who looks for contact or help finds it in another place on another page." },
  "inconsistent-control-name": { title: "The same control with different names", experience: "A person meets the same function under different names on different pages." },
  "sensory-instruction": { title: "An instruction that relies on shape or position", experience: "An instruction like \"the button on the right\" means nothing to a person who cannot see the layout." },
  "message-not-in-live-region": { title: "A message that a screen reader does not announce", experience: "After an action, a message appears on the screen, but a screen reader says nothing." },
  "aria-hidden-focus": { title: "A hidden part that the keyboard still reaches", experience: "A screen reader user lands on something that is hidden from them, and hears nothing." },
  "aria-valid-attr-value": { title: "A wrong accessibility attribute", experience: "A screen reader gets wrong information about the element." },
  "aria-prohibited-attr": { title: "An accessibility attribute in the wrong place", experience: "A screen reader may read a name that the element should not have." },
  "aria-required-attr": { title: "A control with missing accessibility information", experience: "A screen reader cannot say the state of the control." },
  "duplicate-id-aria": { title: "Two elements with the same identifier", experience: "A screen reader may connect a label to the wrong element." },
  "expanded-state-not-updated": { title: "A menu that does not announce if it is open", experience: "A screen reader says the same whether the menu is open or closed." },
  "scrollable-region-focusable": { title: "A scrolling area that the keyboard cannot reach", experience: "A person who uses the keyboard cannot scroll that part of the page." },
  "drag-listener": { title: "A function that needs a drag", experience: "A person who cannot drag with a mouse or a finger cannot use the function." },
  "down-event-listener": { title: "An action that fires on press", experience: "The action happens at the moment of the press, so a person cannot cancel a slip." },
  "gesture-listener": { title: "A function that needs a multi-finger gesture", experience: "A person who cannot pinch or swipe with several fingers cannot use the function." },
  "device-motion-listener": { title: "A function that needs a shake or a tilt", experience: "A person who cannot move the device cannot use the function." },
  "single-key-shortcut": { title: "A single-key shortcut", experience: "A person who speaks commands, or who presses keys by mistake, triggers the function unexpectedly." },
  "orientation-lock": { title: "A page locked to one orientation", experience: "A person whose device is fixed in one orientation cannot use the page." },
  "hover-content": { title: "Content that appears on hover and cannot be dismissed", experience: "A tooltip covers the content and a person cannot close it or move to it." },
  "timer-redirect": { title: "A time limit with no warning", experience: "The page moves on before a slow reader is done." },
  "change-of-context-on-focus": { title: "The page changes when a control gets the focus", experience: "A person who moves with the keyboard is sent elsewhere without an action." },
  "change-of-context-on-input": { title: "The page changes when a choice is made", experience: "The page moves on as soon as the person picks an option, with no button to confirm." },
  "error-not-in-text": { title: "An error shown only by color", experience: "A person who does not see color cannot tell which field has the error." },
  "error-not-linked": { title: "An error not connected to its field", experience: "A screen reader does not say which field the error belongs to." },
  "error-without-suggestion": { title: "An error that does not say how to correct it", experience: "The form says that the entry is wrong, but not what is expected." },
  "redundant-entry": { title: "The same data asked twice", experience: "A person must type the same information again in a later step." },
  "financial-form": { title: "A commitment with no review step", experience: "A person cannot check or correct the data before the order or the payment goes through." },
  "login-form": { title: "A sign-in that needs memory or a puzzle", experience: "A person who cannot remember a password, or cannot solve a CAPTCHA, cannot sign in." },
};

const WHO: Record<string, string> = {
  visual: "people who see little or nothing",
  physical: "people who use a keyboard or have limited movement",
  cognitive: "people who need clear and predictable pages",
  auditory: "people who hear little or nothing",
  seizure: "people with seizures from flashing",
  speech: "people who do not speak",
};

/** Plain words for a rule, with the criterion as the fallback. */
export function plainOf(rule: string, criterion: string): Plain {
  const p = PLAIN[rule];
  if (p) return p;
  const c = CRITERIA_BY_ID.get(criterion);
  return { title: c ? `${c.name}: the page does not meet it` : rule, experience: c?.review_or_person_check || "The page does not meet this criterion." };
}

/** Who a criterion affects, in plain words. */
export function whoOf(criterion: string): string {
  const c = CRITERIA_BY_ID.get(criterion);
  const parts = (c?.affects || []).map((a: string) => WHO[a]).filter(Boolean);
  return parts.length ? parts.join(", and ") : "people with disabilities";
}

/** The people that a set of criteria affects, with no repeat. */
export function whoOfAll(criteria: string[]): string {
  const seen: string[] = [];
  for (const id of criteria) for (const a of CRITERIA_BY_ID.get(id)?.affects || []) if (WHO[a] && !seen.includes(WHO[a])) seen.push(WHO[a]);
  return seen.length ? seen.join(", ") : "people with disabilities";
}
