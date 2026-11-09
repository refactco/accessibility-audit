// The version of the detection of the own rules. A stored issue of an own rule that the audit does not find again is "fixed" when the
// engine that found it had the same detection, and "rule changed" when its detection was older. Before 1.3.2 the engine compared the
// version of the package, so each release made every such issue "rule changed".
//
// When a change of the code changes what an own rule finds, put the rule in RULE_VERSIONS with the version of that release. A change
// that does not change the findings, for example a new log line or a faster loop, needs no entry.

/** The version of the last change of the detection of all the own rules: the states, the dialogs, and the images of text in 1.3.0. */
export const OWN_DETECTION_VERSION = "1.3.0";

/** The rules whose detection changed after OWN_DETECTION_VERSION, with the version of the change.
 *  1.3.3: the focus test counts only the points in the viewport and reads a hidden control again when its position is stable.
 *  The watch of the content that changes by itself leaves out the body and the elements that hold the main content.
 *  1.3.4: the item of an image of text uses the address of the image after its load.
 *  1.3.5: the focus test reads the control that has the focus inside a frame, not the frame element. The questions and the issues of
 *  visual-order-differs group by the kind of element, not by its item.
 *  1.3.6: the image of text reads the pixels of the image itself, not a screenshot, and counts the ink of small letters. The list
 *  without list code reports the innermost container, with the lines of the list. A label that only a screen reader reads is not a
 *  visible label.
 *  1.3.7: the item of a select with a placeholder has the text of the placeholder, not the text of all its options. An issue of a
 *  weekly archive select that 1.3.6 found with the options of an older week is "rule changed", not "fixed".
 *  1.3.8: the item of an image of text, and of the text contrast of an image, has the path of the file, not only its name. */
export const RULE_VERSIONS: Record<string, string> = {
  "focus-entirely-hidden": "1.3.3",
  "content-updates-by-itself": "1.3.3",
  "image-of-text": "1.3.8",
  "image-text-contrast": "1.3.8",
  "list-without-list-code": "1.3.6",
  "field-no-visible-label": "1.3.6",
  "change-of-context-on-input": "1.3.7",
  "focus-not-visible": "1.3.5",
  "visual-order-differs": "1.3.5",
};

/** The version of the detection of an own rule. */
export function detectionVersion(rule: string): string {
  return RULE_VERSIONS[rule] || OWN_DETECTION_VERSION;
}

/** Compares two versions of the form 1.2.3: negative when a is older, 0 when equal, positive when a is newer. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
