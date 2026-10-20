# Notices

Accessibility Audit is under the MIT license, in `LICENSE`. It uses and includes work of others, with thanks.

## Software that the engine runs

- **axe-core** by Deque Systems, Mozilla Public License 2.0. The engine injects it into each page as the rule engine. https://github.com/dequelabs/axe-core
- **Playwright** by Microsoft, Apache License 2.0. The engine drives Chromium with it. https://github.com/microsoft/playwright
- **Ajv** and **ajv-formats** by Evgeny Poberezkin, MIT license. The engine validates its files with them. https://github.com/ajv-validator/ajv

## Data in this repository from other projects

The research of stage 1 compared the rules of several engines. The folder `research/sources/` holds lists of rule names and descriptions from these projects, and `criteria/sources/` holds the rule descriptions of axe-core and the test cases of the W3C ACT rules. Each file names its source, version, and commit.

- **axe-core rule descriptions**, Deque Systems, Mozilla Public License 2.0.
- **W3C ACT rules and test cases**, W3C and the ACT Rules Community Group, under the W3C Software and Document License. https://www.w3.org/WAI/standards-guidelines/act/rules/
- **Alfa** rules, Siteimprove, MIT license. https://github.com/Siteimprove/alfa
- **IBM Equal Access accessibility-checker-engine** rules, IBM, Apache License 2.0. https://github.com/IBMa/equal-access
- **QualWeb** rules, QualWeb, MIT license. https://github.com/qualweb/core
- **HTML_CodeSniffer** rules, Squiz, BSD 3-Clause license. https://github.com/squizlabs/HTML_CodeSniffer

## Standards

The 55 criteria come from the Web Content Accessibility Guidelines (WCAG) 2.2, a W3C Recommendation. The criteria file quotes their names and levels. https://www.w3.org/TR/WCAG22/

## Typeface

The report page loads Geist by Vercel from Google Fonts when the machine is online, under the SIL Open Font License 1.1, and uses the system typeface otherwise.
