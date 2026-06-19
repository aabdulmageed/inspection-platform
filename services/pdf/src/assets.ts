import fs from "fs";
import path from "path";

const DIR = path.join(__dirname, "..", "assets");

const b64 = (file: string) => fs.readFileSync(path.join(DIR, file)).toString("base64");

// Load once at startup.
export const LOGO_DATA_URI = `data:image/png;base64,${b64("logo.png")}`;
// Pre-composited gradient header strip (renders reliably in the PDF header).
export const HEADER_DATA_URI = `data:image/png;base64,${b64("header.png")}`;

export const FONT_FACE_CSS = `
  @font-face { font-family: 'Amiri'; font-weight: 400;
    src: url(data:font/ttf;base64,${b64("Amiri-Regular.ttf")}) format('truetype'); }
  @font-face { font-family: 'Amiri'; font-weight: 700;
    src: url(data:font/ttf;base64,${b64("Amiri-Bold.ttf")}) format('truetype'); }
  @font-face { font-family: 'DejaVu'; font-weight: 400;
    src: url(data:font/ttf;base64,${b64("DejaVuSans.ttf")}) format('truetype'); }
  @font-face { font-family: 'DejaVu'; font-weight: 700;
    src: url(data:font/ttf;base64,${b64("DejaVuSans-Bold.ttf")}) format('truetype'); }
`;
