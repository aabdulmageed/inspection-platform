import { LOGO_DATA_URI, HEADER_DATA_URI, FONT_FACE_CSS } from "./assets";

export type Lang = "en" | "ar";

export interface ReportData {
  lang: Lang;
  company: string;
  property: { customer: string; address: string; type: string; date: string };
  team: { discipline: string; inspector: string }[];
  summary?: string;
  notes?: string;
  rooms: {
    name: string;
    items: {
      component: string;
      discipline: string;
      status: "GOOD" | "ISSUE" | "NA" | null;
      note: string | null;
      photos: { src: string; note?: string | null }[]; // image data URI + caption
    }[];
  }[];
  signatures: { label: string; image?: string }[]; // pre-localized; image = captured signature
}

const L: Record<Lang, Record<string, string>> = {
  en: {
    reportTitle: "House Inspection Report",
    customer: "Customer", address: "Address", type: "Property Type",
    inspectionDate: "Inspection Date", team: "Inspection Team",
    propertyInfo: "Property Information", summary: "Summary", notes: "Notes",
    details: "Inspection Details", customerSig: "Customer Signature",
    GOOD: "Good", ISSUE: "Needs attention", NA: "N/A",
    CIVIL: "Civil", ELECTRICAL: "Electrical", PLUMBING: "Plumbing", PEST_OTHER: "Pest / Other",
  },
  ar: {
    reportTitle: "تقرير فحص المنزل",
    customer: "العميل", address: "العنوان", type: "نوع العقار",
    inspectionDate: "تاريخ الفحص", team: "فريق الفحص",
    propertyInfo: "بيانات العقار", summary: "الملخص", notes: "الملاحظات",
    details: "تفاصيل الفحص", customerSig: "توقيع العميل",
    GOOD: "جيدة", ISSUE: "تحتاج إلى صيانة", NA: "غير منطبق",
    CIVIL: "مدني", ELECTRICAL: "كهرباء", PLUMBING: "سباكة", PEST_OTHER: "آفات / أخرى",
  },
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function headerTemplate(_data: ReportData): string {
  // A pre-composited image renders reliably (templates ignore CSS backgrounds).
  return `<div style="width:100%;margin:0;padding:0;">
    <img src="${HEADER_DATA_URI}" style="width:100%;display:block;" />
  </div>`;
}

export function footerTemplate(): string {
  return `<div style="width:100%;font-size:9px;color:#888;padding:0 12mm;text-align:center;">
    <span class="pageNumber"></span>
  </div>`;
}

function statusBadge(status: string | null, lang: Lang): string {
  if (!status) return "";
  const color = status === "ISSUE" ? "#c0392b" : status === "GOOD" ? "#2e9e3f" : "#5a6b7b";
  return `<span style="color:${color};font-weight:700;">${L[lang][status] ?? status}</span>`;
}

export function buildHtml(data: ReportData): string {
  const lang = data.lang;
  const t = (k: string) => L[lang][k] ?? k;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const baseFont = lang === "ar" ? "Amiri" : "DejaVu";

  const detailRow = (label: string, value: string) => `
    <tr><td class="lbl">${esc(label)}</td><td class="val">${esc(value)}</td></tr>`;

  const teamLine = data.team
    .map((m) => `<span class="chip"><b>${t(m.discipline)}</b> · ${esc(m.inspector)}</span>`)
    .join(" ");

  const rooms = data.rooms
    .map(
      (room) => `
    <div class="room">
      <div class="room-bar">${esc(room.name)}</div>
      ${room.items
        .map(
          (it) => `
        <div class="comp ${it.status === "ISSUE" ? "issue" : ""}">
          <div class="comp-head">
            <span><b>${esc(it.component)}</b> <span class="disc">${t(it.discipline)}</span></span>
            ${statusBadge(it.status, lang)}
          </div>
          ${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}
          ${
            it.photos.length
              ? `<div class="photos">${it.photos
                  .map(
                    (p) =>
                      `<figure><img src="${esc(p.src)}" />${
                        p.note ? `<figcaption>${esc(p.note)}</figcaption>` : ""
                      }</figure>`,
                  )
                  .join("")}</div>`
              : ""
          }
        </div>`,
        )
        .join("")}
    </div>`,
    )
    .join("");

  const signatures = data.signatures
    .map(
      (s) => `<div class="sig">
        <div class="sig-line">${s.image ? `<img src="${esc(s.image)}" class="sig-img" />` : ""}</div>
        <div class="sig-label">${esc(s.label)}</div>
      </div>`,
    )
    .join("");

  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8" />
<style>
  ${FONT_FACE_CSS}
  * { box-sizing: border-box; }
  body { font-family: '${baseFont}', sans-serif; color: #16202c; margin: 0;
         font-size: 12px; line-height: ${lang === "ar" ? 1.7 : 1.5}; }
  h1 { color: #134486; font-size: 22px; margin: 0 0 2px; }
  h2 { color: #134486; font-size: 15px; margin: 16px 0 6px; border-bottom: 2px solid #e2e8f0; padding-bottom: 3px; }
  .sub { color: #5a6b7b; margin: 0 0 14px; }
  table.details { width: 100%; border-collapse: collapse; }
  table.details td { padding: 5px 4px; border-bottom: 1px solid #e8edf3; vertical-align: top; }
  td.lbl { font-weight: 700; color: #134486; width: 35%; }
  .chip { display: inline-block; background: #eef2f7; border: 1px solid #e2e8f0;
          border-radius: 6px; padding: 3px 9px; margin: 0 3px 4px 0; font-size: 11px; }
  /* Rooms may split across pages (keeping them whole caused large blank gaps);
     only individual components stay intact, and a room bar never sits alone. */
  .room { margin-bottom: 12px; }
  .room-bar { background: #134486; color: #fff; font-weight: 700; padding: 6px 10px;
              border-radius: 6px; break-inside: avoid; break-after: avoid; }
  h2 { break-after: avoid; }
  .comp { background: #f7f9fc; border: 1px solid #dde3ea; border-radius: 6px;
          padding: 8px 10px; margin-top: 6px; break-inside: avoid; }
  .sigs { break-inside: avoid; }
  .comp.issue { border-top: 3px solid #c0392b; }
  .comp-head { display: flex; justify-content: space-between; align-items: center; }
  .disc { background: #eef2f7; border-radius: 5px; padding: 1px 6px; font-size: 10px; color: #5a6b7b; }
  .note { margin-top: 5px; color: #243140; }
  .photos { margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap; }
  .photos figure { width: 31%; margin: 0; page-break-inside: avoid; }
  .photos img { width: 100%; border: 1px solid #ccc; border-radius: 4px; display: block; }
  .photos figcaption { margin-top: 2px; font-size: 9px; color: #5a6b7b; line-height: 1.25; }
  .sigs { display: flex; gap: 40px; margin-top: 30px; }
  .sig { flex: 1; text-align: center; }
  .sig-line { border-bottom: 1px solid #134486; height: 48px; display: flex; align-items: flex-end; justify-content: center; }
  .sig-img { max-height: 46px; max-width: 100%; }
  .sig-label { margin-top: 6px; font-weight: 700; color: #134486; }
  .cover { page-break-after: always; }
</style></head>
<body>
  <div class="cover">
    <h1>${t("reportTitle")}</h1>
    <p class="sub">${esc(data.company)}</p>

    <h2>${t("propertyInfo")}</h2>
    <table class="details">
      ${detailRow(t("customer"), data.property.customer)}
      ${detailRow(t("address"), data.property.address)}
      ${detailRow(t("type"), data.property.type)}
      ${detailRow(t("inspectionDate"), data.property.date)}
    </table>

    <h2>${t("team")}</h2>
    <div>${teamLine}</div>

    ${data.summary ? `<h2>${t("summary")}</h2><div>${esc(data.summary)}</div>` : ""}
    ${data.notes ? `<h2>${t("notes")}</h2><div>${esc(data.notes)}</div>` : ""}
  </div>

  <h2>${t("details")}</h2>
  ${rooms}

  <div class="sigs">${signatures}</div>
</body></html>`;
}
