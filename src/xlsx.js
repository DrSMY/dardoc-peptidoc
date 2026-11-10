// A small Excel (.xlsx) writer, enough for the practice report: several
// sheets, a bold header row that stays in view, column filters and widths,
// and real numbers and dates so Excel can sort and total them. Text goes in
// as plain strings, so nothing a patient typed can run as a formula. An
// .xlsx file is a zip of XML parts; the zip is written here with node:zlib.
"use strict";
const zlib = require("node:zlib");

const xmlEsc = (s) => String(s)
  .replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, "") // characters XML can't carry
  .slice(0, 32000)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// A calendar date for a cell: day(2026, 11, 10). Written as an Excel date.
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const excelSerial = (date) => date.getTime() / 864e5 + 25569;

// Cell styles (indexes into cellXfs below).
const STYLE = { normal: 0, header: 1, date: 2, bold: 3, title: 4, wrap: 5 };

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="15"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EADD"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

// One cell. A value is a number, a Date (a calendar date), a string, or
// { v, style } to pick a style by name.
function cellXml(ref, value, fallbackStyle) {
  let v = value, style = fallbackStyle;
  if (v && typeof v === "object" && !(v instanceof Date)) { style = STYLE[v.style] ?? fallbackStyle; v = v.v; }
  if (v === null || v === undefined || v === "") return style ? `<c r="${ref}" s="${style}"/>` : "";
  if (v instanceof Date) return isNaN(v) ? "" : `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(v)}</v></c>`;
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

// { name, columns: [{ header, width, wrap }], rows: [[…]], header: true }
// With header false the sheet is free-form: no header row, filter or freeze.
function sheetXml(sheet) {
  const cols = sheet.columns || [];
  const withHeader = sheet.header !== false;
  const rows = [];
  let r = 0;
  if (withHeader) {
    r++;
    rows.push(`<row r="1" ht="30" customHeight="1">${cols.map((c, i) => cellXml(`${colName(i)}1`, c.header, STYLE.header)).join("")}</row>`);
  }
  for (const row of sheet.rows) {
    r++;
    rows.push(`<row r="${r}">${row.map((v, i) => cellXml(`${colName(i)}${r}`, v, cols[i] && cols[i].wrap ? STYLE.wrap : 0)).join("")}</row>`);
  }
  const last = `${colName(Math.max(cols.length, 1) - 1)}${Math.max(r, 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${withHeader ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols.length ? `<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("")}</cols>` : ""}
<sheetData>${rows.join("")}</sheetData>
${withHeader && cols.length ? `<autoFilter ref="A1:${last}"/>` : ""}
</worksheet>`;
}

// ── zip ──────────────────────────────────────────────────────────────
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const data = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10); head.writeUInt16LE(date, 12); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(name.length, 26);
    parts.push(head, name, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

// sheets: [{ name, columns, rows, header }] → the .xlsx file as a Buffer.
function workbook(sheets) {
  const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const sheetName = (s) => xmlEsc(String(s.name).replace(/[\[\]:*?/\\]/g, " ").slice(0, 31));
  const files = [
    { name: "[Content_Types].xml", data: `${XML}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `${XML}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${sheetName(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `${XML}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}

module.exports = { workbook, day };
