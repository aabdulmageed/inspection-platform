# PDF worker (placeholder)

This service will render the bilingual (EN/AR) inspection report as a PDF.

**Approach:** headless Chrome (Puppeteer/Playwright) rendering an HTML/CSS
template. The browser handles Arabic shaping + RTL natively (`dir="rtl"`), so the
hard bidi work is free.

**Design spec:** reproduce the layout already built in the sibling
`report-python/` project — branded header/footer, cover (property info + summary +
notes), room-by-room sections grouped by discipline with color-coded conditions
and issue photos, and a signatures page (one per discipline + customer).

**Trigger:** consumed from a queue when `POST /inspections/:id/report` is called;
writes the PDF to object storage and emails the client a link.

_Not implemented yet — see the root README "Next steps"._
