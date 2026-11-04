import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildGroupMembersExport } from "./groupMembersExport";

describe("group members Excel export", () => {
  it("excludes aliases outside the exact rainerum.it domain", async () => {
    const result = await buildGroupMembersExport({
      name: "Gruppo",
      members: [
        { id: "1", email: "andrea.rossi@rainerum.it", name: "Andrea Rossi" },
        { id: "2", email: "bianca.verdi@RAINERUM.IT", name: "Bianca Verdi" },
        { id: "3", email: "alias@example.it", name: "Alias Esterno" },
        { id: "4", email: "alias@sub.rainerum.it", name: null },
        { id: "5", email: "alias@falso-rainerum.it", name: null },
        { id: "6", email: "alias@rainerum.it.example.com", name: null },
      ],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getCell("A2").value).toBe("andrea.rossi@rainerum.it");
    expect(sheet.getCell("A3").value).toBe("bianca.verdi@RAINERUM.IT");
  });

  it("exports every member in display order and marks only unverified name cells grey", async () => {
    const members = [
      { id: "3", email: "mario.rossi+scuola@rainerum.it", name: null },
      { id: "1", email: "andrea@rainerum.it", name: "  Andrea   De Luca  " },
      { id: "2", email: "depascalis@rainerum.it", name: " " },
    ];
    const result = await buildGroupMembersExport({ name: "CDC 1 / Liceo", members });
    expect(result.filename).toBe("CDC 1 _ Liceo.xlsx");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(1).values).toEqual([undefined, "Email", "Nome", "Cognome"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "andrea@rainerum.it", "Andrea", "De Luca"]);
    expect(sheet.getRow(3).values).toEqual([undefined, "depascalis@rainerum.it", "", ""]);
    expect(sheet.getRow(4).values).toEqual([undefined, "mario.rossi+scuola@rainerum.it", "Mario", "Rossi"]);
    for (const address of ["B3", "C3", "B4", "C4"]) {
      expect(sheet.getCell(address).fill).toMatchObject({
        type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" },
      });
    }
    for (const address of ["A2", "A3", "A4", "B2", "C2"]) {
      expect(sheet.getCell(address).fill).not.toMatchObject({ pattern: "solid" });
    }
    expect(members[0].id).toBe("3");
  });

  it.each([
    ["élisa_d'amico@rainerum.it", null, "Élisa", "D'Amico"],
    ["luca-bianchi42@rainerum.it", null, "Luca", "Bianchi"],
    ["anna.de.luca@rainerum.it", null, "Anna", "De Luca"],
    ["mario.rossi@rainerum.it", "mario.rossi@rainerum.it", "Mario", "Rossi"],
    ["mario.rossi@rainerum.it", "Mario", "Mario", "Rossi"],
    ["12345@rainerum.it", null, "", ""],
  ])("handles incomplete profiles for %s (%s)", async (email, name, first, last) => {
    const result = await buildGroupMembersExport({ name: "Membri", members: [{ id: "1", email, name }] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell("B2").value).toBe(first);
    expect(sheet.getCell("C2").value).toBe(last);
    expect(sheet.getCell("C2").fill).toMatchObject({ fgColor: { argb: "FFD9D9D9" } });
    if (name === "Mario") expect(sheet.getCell("B2").fill).not.toMatchObject({ pattern: "solid" });
  });

  it("produces a valid header-only workbook for an empty group", async () => {
    const result = await buildGroupMembersExport({ name: "", members: [] });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    expect(result.filename).toBe("Membri.xlsx");
    expect(workbook.worksheets[0].rowCount).toBe(1);
    expect(workbook.worksheets[0].columnCount).toBe(3);
  });

  it("preserves formula-like values as text", async () => {
    const result = await buildGroupMembersExport({
      name: "Gruppo",
      members: [{ id: "1", email: "=test@rainerum.it", name: '=HYPERLINK("url") Cognome' }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);
    expect(workbook.worksheets[0].getCell("A2").type).toBe(ExcelJS.ValueType.String);
    expect(workbook.worksheets[0].getCell("B2").value).toBe('=HYPERLINK("url")');
  });
});
