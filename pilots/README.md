# The pilot sites

Two pilot sites, from your answers of 2026-10-13. The facts below come from a read-only check of the public pages and of the code on 2026-10-13, with GET requests only. The settings files next to this file hold the decisions of the same day. The items under "Before the first audit" are one-time tasks for a person.

## refact.co, headless WordPress

**Facts from the public pages**

- The front end is Next.js on Netlify. The WordPress backend is not visible in the HTML. The media files come from `cdn.refact.co/uploads/`, which is a WordPress upload path.
- `robots.txt` permits all and forbids `/api/`, `/admin/`, and `/_next/image`. The sitemap index has seven parts: static, pages, posts, taxonomies, work, services, and authors.
- The pages: about 40 static pages under `/services/`, `/technologies/`, and `/industries/`, 501 posts under `/insights/<category>/<slug>`, 7 category pages, and the work, author, about, contact, and discovery pages. About 600 pages in total.
- One process: the contact form on `/contact`. It has eight fields, a "Send" button, and a JavaScript submit into a polite live region. No CAPTCHA in the markup. The booking link goes to Calendly, outside the site.
- No login, no search, no newsletter form, no consent banner, and no video, map, or chat embeds. The third party is Google Tag Manager.
- The language is `en`, with no alternates. The error page gives HTTP 404 with the site title as the page title.
- The category pages use `?page=N` for the older posts.

**Facts from the code**

The repository is `/Users/hosseinkarami/Work/Projects/refact-website/`. It is a pnpm monorepo. The folder `apps/web` is Next.js 16 with the App Router. The folder `apps/wordpress/wp-content` holds the theme `refact`, the ACF field files, and four mu-plugins. WordPress core and the plugins live only on WP Engine.

- The front end reads all content through WPGraphQL. The production backend is `https://refact.wpengine.com`. Its REST API and its GraphQL endpoint answer with no login. The staging backend is `https://refactstg.wpengine.com`.
- The staging front end is `https://stage--refact.netlify.app`, from the branch `stage`. It is open. Its `robots.txt` forbids all crawling, so the staging settings switch the robots rule off.
- The contact form is Gravity Form 9. A server action sends the GraphQL mutation `submitGfForm`. On production, Gravity Forms add-ons feed Pipedrive and Slack. On the staging backend, the add-ons are off. Form 9 has no honeypot and no CAPTCHA. The success message is in a polite live region and takes the focus. The error message has `role="alert"` and takes the focus.
- The routes: `/services/<slug>`, `/industries/<slug>`, `/technologies/<slug>`, `/work/<slug>`, `/insights/<category>`, `/insights/topics/<tag>`, `/insights/<category>/<slug>`, `/author/<slug>`, and other WordPress pages at `/<slug>`. The static pages are home, about, contact, discovery, work, web-development, industries, and technologies. The address `/services` redirects to `/web-development`.
- The site also serves a Markdown copy of each article, a `llms.txt` file, and about 150 redirects. The settings skip the Markdown copies.
- No build identifier reaches the browser. The skill records the commit only, and the issue cannot compare it with the live site.
- The alt text comes from the WordPress media field. Some components use the image title when the alt text is empty. Some use an empty alt. A post with no image gets a generated cover with a fixed alt text.
- The mobile menu is a dialog with a focus trap. The mega menu opens on hover and on click. The carousels do not autoplay. A logo marquee and looped videos play with no pause control, and they ignore the reduced motion setting. There is no skip link, and the main element has no id. The mobile menu toggle removes the focus outline.
- No accessibility tests exist in the repository. The continuous integration runs the build and lint only.

**Settings**

`refact.co.config.json` is for production. `refact.co.staging.config.json` is for the staging front end, with the staging backend and the robots rule off. The process "contact" runs on staging only.

The steps of the process use the action grammar of the engine: `click`, `fill ... with ...`, `select ... in ...`, `check`, `press`, and `read`. The names in the steps are the labels of the form on staging, read on 2026-10-14. The test data is "Accessibility audit" for the names and `audit@example.com` for the email. Change them in the settings when you want another inbox. The first step clicks "Send" with the fields empty, so that the engine tests the error messages.

**Decisions, from your answers of 2026-10-13**

1. The Gravity Forms add-ons are off on the staging backend. A test submission on staging makes no lead in Pipedrive or Slack. The test data still names the audit.
2. Form 9 has no honeypot and no CAPTCHA. Nothing blocks the form tests on staging. The site has no login, so 3.3.8 gets the result "no content found".
3. The results folder is `accessibility-audit/` at the root of the repository. The source paths in the issues are relative to the root, the same as in Git, and they can point into `apps/web` and `apps/wordpress`.

**Before the first audit**

- Nothing. The staging audit can start when the engine exists.

## What the check could not see

- Anything that JavaScript adds at run time, for example a consent banner from Tag Manager. The engine sees it at the first audit.
- The Facebook pixel, the calendar widgets on the event pages, and the exact labels of some form fields.
