import ExcelJS from "exceljs";
import { sortMembers } from "./subgroups";
import type { Subgroup } from "./types";

type ExportGroup = Pick<Subgroup, "name" | "members">;

function inferEmailName(email: string): [string, string] {
  const local = email.split("@")[0].split("+")[0].replace(/\d+$/u, "");
  const parts = local.split(/[._-]+/u).filter(Boolean);
  if (parts.length < 2 || parts.some((part) => !/^[\p{L}\p{M}'’]+$/u.test(part))) {
    return ["", ""];
  }
  const words = parts.map((part) => part.toLocaleLowerCase("it").replace(
    /(^|['’])\p{L}/gu, (letter) => letter.toLocaleUpperCase("it")
  ));
  return [words[0], words.slice(1).join(" ")];
}

export async function buildGroupMembersExport(subgroup: ExportGroup) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Membri");
  sheet.columns = [
    { header: "Email", width: 48 },
    { header: "Nome", width: 24 },
    { header: "Cognome", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = "A1:C1";

  const members = subgroup.members.filter((member) => /@rainerum\.it$/iu.test(member.email.trim()));
  for (const member of sortMembers(members)) {
    // Profiles currently store one full name, in given-name / family-name order.
    const profileName = member.name?.trim() ?? "";
    const words = profileName && !profileName.includes("@") ? profileName.split(/\s+/u) : [];
    const [guessedFirst, guessedLast] = inferEmailName(member.email);
    const first = words[0] || guessedFirst;
    const last = words.slice(1).join(" ") || guessedLast;
    const row = sheet.addRow([member.email, first, last]);
    for (const [column, verified] of [[2, words.length > 0], [3, words.length > 1]] as const) {
      if (!verified) {
        row.getCell(column).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" },
        };
        row.getCell(column).note = "Dato non verificato: ricavato dall’email quando possibile.";
      }
    }
  }

  const filename = subgroup.name.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "_")
    .trim().replace(/[. ]+$/u, "").slice(0, 150) || "Membri";
  return { buffer: await workbook.xlsx.writeBuffer(), filename: `${filename}.xlsx` };
}

export async function downloadGroupMembers(subgroup: ExportGroup): Promise<void> {
  const { buffer, filename } = await buildGroupMembersExport(subgroup);
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start consuming the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
