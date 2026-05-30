const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, LevelFormat, Header, Footer, TabStopType, TabStopPosition, PageBreak } = require('docx');
const fs = require('fs');
const path = require('path');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 180 }, children: [new TextRun({ text, bold: true, size: 28, font: "Arial" })] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, size: 24, font: "Arial" })] }); }
function h3(text) { return new Paragraph({ spacing: { before: 180, after: 100 }, children: [new TextRun({ text, bold: true, size: 22, font: "Arial" })] }); }
function p(text, options = {}) { return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 80, line: 276 }, children: [new TextRun({ text, size: 22, font: "Arial", ...options })] }); }
function bullet(text) { return new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text, size: 22, font: "Arial" })] }); }
function numbered(text) { return new Paragraph({ numbering: { reference: "letters", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text, size: 22, font: "Arial" })] }); }
function spacer() { return new Paragraph({ children: [new TextRun("")], spacing: { before: 60, after: 60 } }); }
function tableRow(desc, total, isHeader = false) { const fill = isHeader ? "1F3864" : "FFFFFF"; const textColor = isHeader ? "FFFFFF" : "000000"; const bold = isHeader; return new TableRow({ children: [ new TableCell({ borders, width: { size: 7000, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: desc, size: 20, font: "Arial", bold, color: textColor })] })] }), new TableCell({ borders, width: { size: 2360, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, verticalAlign: VerticalAlign.CENTER, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: total, size: 20, font: "Arial", bold, color: textColor })] })] }) ] }); }
module.exports = { h1, h2, h3, p, bullet, numbered, spacer, tableRow, border, borders, noBorder, noBorders };
