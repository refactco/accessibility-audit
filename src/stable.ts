// Parts of an id or a name that a site makes new on each render, for example slider-4823019576 or heading-1-1-qtw3vXnaPK.
// The identity of an element, its selector, and the hash of a question leave them out. So a new render of the page gives the
// same issue, finds the control of a state again, and keeps the answer of a question.

/** Replaces each part of an id or a name that looks made at random with "*". A part is the text between the separators - _ : .
 *  A part looks random when it has 5 or more digits in a row, when letters and digits alternate in 6 or more characters
 *  (qtw3vXnaPK), when it is a hex string of 8 or more characters, or when it mixes upper and lower case in 6 or more characters
 *  after the first part (heading-1-1-QtwvXnaPKs). The function has no outside references: the in-page helpers use its source. */
export function unrandom(value: string): string {
  let index = 0;
  return String(value).split(/([-_:.\s]+)/).map((p) => {
    if (p === "" || /^[-_:.\s]+$/.test(p)) return p;
    const first = index++ === 0;
    const random = /\d{5,}/.test(p)
      || (p.length >= 6 && /[a-z]\d+[a-z]|\d[a-z]+\d/i.test(p))
      || (p.length >= 8 && /^[0-9a-f]+$/i.test(p) && /\d/.test(p) && /[a-f]/i.test(p))
      || (!first && p.length >= 6 && /[a-z]/.test(p) && /[A-Z]/.test(p));
    return random ? "*" : p;
  }).join("");
}

/** The attributes whose values are ids or names, in the HTML of an outcome. */
const ID_ATTRIBUTES = /\s(id|name|for|aria-controls|aria-labelledby|aria-describedby|aria-owns|aria-activedescendant|aria-details|aria-errormessage)="([^"]*)"/g;

/** The HTML of an outcome with the random parts of its ids and names left out, for the hash of a question. */
export function stableHtml(html: string): string {
  return html.replace(ID_ATTRIBUTES, (_m, attr: string, value: string) => ` ${attr}="${value.split(/\s+/).map(unrandom).join(" ")}"`);
}

/** A selector with the random parts of its ids left out, for an identity. */
export function stableSelector(selector: string): string {
  return selector.replace(/#((?:\\.|[A-Za-z0-9_-])+)/g, (m, id: string) => { const plain = id.replace(/\\(.)/g, "$1"); const s = unrandom(plain); return s === plain ? m : "#" + s; });
}
