# How to find the origin and the source of an issue

An issue is one problem with one cause. The examples show where it appears; your task is to find where it comes from, so that a developer can fix it in one place.

## 1. Read the examples

Each example has the page, the width, the state, the selector, the HTML, and the facts. The HTML gives the classes, the ids, the data attributes, and the text. The template of the page, in `reach.templates`, says which page type renders it. A state like `click Menu` says that the element appears after that action.

## 2. Decide the origin

| Origin | The sign | Where to look |
|---|---|---|
| `code` | The element comes from a template, a component, or a script. The same markup on all pages of a template | The theme or the app: templates, components, blocks, scripts |
| `design` | A style rule: a color, a size, a hidden outline, a fixed height | The stylesheets, the design tokens, the Tailwind classes |
| `content` | Text, an image, a link, or a heading that an editor wrote. One page, or a few | The CMS: the post, the page, the attachment, the block |
| `media` | A video, an audio file, or a document without its alternative | The media library and the file that someone must make |
| `configuration` | A setting of the CMS, a plugin, or a form builder: a missing label option, a plugin that writes the markup | The settings pages, the plugin options |
| `third-party-controlled` | A dependency the project chooses: a plugin, a package, a form service, an embed with options | The dependency, its options, its version |
| `third-party-uncontrolled` | An embed the project cannot change: an advertisement, a payment frame, a social widget | The statement of partial conformance |

## 3. Find the source file

Search the repository with the most specific strings first: an id, a data attribute, a component class, then a class combination, then the text. In a headless site, the markup comes from the front end app; in a WordPress site, from the theme, a block, or a plugin, and content from the database. When several files match, give each with its confidence: `certain` when the file contains the exact markup, `probable` when it contains the classes or the component, `possible` when it is the template of the page type. Name the method in each source entry, for example "the class c-post-slider__slide-btn is in the slider block". For content, give the CMS item, the attachment ID when you can find it from the image file name, and the edit address.

The settings of the site give the source path in `site.cms.source_path` and the CMS kind in `site.cms.type`. Check out the branch that the project names before you search.

## 4. Write the specific solution

Say what to change, where, and show the change. A good solution:

- Names the file and the place.
- Gives a code example that applies to the project's stack, with its conventions.
- Gives the expected result that the next audit can confirm, in the words of the rule: "The focused control is visible", "The contrast is 4.6:1".
- For content, says what the editor must write, for example the alt text itself.
- For a third party, gives the options: update, replace, configure, tell the vendor, or list the part in a statement of partial conformance.

Keep the general solution of the engine when you cannot do better. Do not guess a file; an issue with `origin: unknown` is better than a wrong file.

## 5. When no change is needed

Sometimes the examples show no real problem: a hidden copy of a control that is not a target, a part of a third-party map, or a finding that a person already accepted on another state. Then the issue needs a decision of a person, not a fix. Start the solution summary with "No change is needed." and say why in one or two sentences. Give the command of the decision as the example, `a11y dismiss` or `a11y accept`, with the reason, so that the report shows the issue as one that waits for a decision and not as a fix.

## 6. The source warning

The live site can be older or newer than the repository. When the settings give a build ID, compare it with the commit of the source. When they do not agree, write a short `source_warning`, for example "The live site is build 1432, the repository is ahead by 12 commits."
