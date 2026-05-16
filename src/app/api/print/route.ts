import { NextRequest, NextResponse } from "next/server";

const PRINTER_IP = "192.168.2.61";
const PRINTER_PORT = 9100;

type PrintItem = {
  name: string;
  qty: number;
  category?: string | null;
  plu?: string | number | null;
  kitchen_label?: string | null;
  note?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { table, items, userName } = body;

    const printableItems = (items ?? []) as PrintItem[];

    if (printableItems.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const enrichedItems = printableItems;

    const now = new Date();
    const time = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = (str: string) => Buffer.from(str, "utf8");
    const nl = (n = 1) => Buffer.from("\n".repeat(n), "utf8");

    const lineWidth = 42;

    const leftRight = (left: string, right: string) => {
      const safeLeft = normalizePrintText(left);
      const safeRight = normalizePrintText(right);
      const spaces = Math.max(1, lineWidth - safeLeft.length - safeRight.length);
      return `${safeLeft}${" ".repeat(spaces)}${safeRight}`;
    };

    const normalizePrintText = (str: string) =>
      str
        .replace(/Ä/g, "Ae")
        .replace(/Ö/g, "Oe")
        .replace(/Ü/g, "Ue")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/•/g, "-")
        .replace(/–/g, "-")
        .replace(/—/g, "-");


    const INIT = Buffer.from([0x1b, 0x40]);
    const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
    const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
    const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
    const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
    const FONT_A = Buffer.from([0x1b, 0x4d, 0x00]);
    const FONT_B = Buffer.from([0x1b, 0x4d, 0x01]);
    const SIZE_BIG = Buffer.from([0x1d, 0x21, 0x11]);
    const SIZE_SECTION = Buffer.from([0x1d, 0x21, 0x11]);
    const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
    const SIZE_ITEM = Buffer.from([0x1d, 0x21, 0x01]);
    const SIZE_FOOD = Buffer.from([0x1d, 0x21, 0x11]);
    const CUT = Buffer.from([0x1d, 0x56, 0x00]);

    const printGroups = [
      {
        key: "drink",
        title: "Getraenke",
        items: enrichedItems.filter((item) => item.category === "drink"),
      },
      {
        key: "starter",
        title: "Vorspeise",
        items: enrichedItems.filter((item) => item.category === "starter"),
      },
      {
        key: "main",
        title: "Hauptspeise",
        items: enrichedItems.filter((item) => item.category === "main" || item.category === "noodle" || item.category === "soup"),
      },
      {
        key: "sushi",
        title: "Sushi",
        items: enrichedItems.filter((item) => item.category === "sushi"),
      },
      {
        key: "dessert",
        title: "Nachtisch",
        items: enrichedItems.filter((item) => item.category === "dessert"),
      },
    ].filter((group) => group.items.length > 0);

    const hasMain = printGroups.some((group) => group.key === "main");
    const hasSushi = printGroups.some((group) => group.key === "sushi");

    const chunks: Buffer[] = [];
    const tableNumber = String(table).replace(/^T/i, "");

    function printHeader(font: Buffer) {
      chunks.push(INIT);
      chunks.push(font);
      chunks.push(nl(3));
      chunks.push(ALIGN_CENTER);
      chunks.push(BOLD_ON);
      chunks.push(SIZE_BIG);
      chunks.push(text(normalizePrintText(`Tisch: ${tableNumber}`)));
      chunks.push(nl());

      chunks.push(SIZE_NORMAL);
      chunks.push(BOLD_OFF);
      chunks.push(ALIGN_LEFT);
      chunks.push(text(leftRight(time, userName ? `Bediener: ${userName}` : "")));
      chunks.push(nl(2));
    }


    printGroups.forEach((group) => {
      const groupFont = group.key === "drink" ? FONT_A : FONT_B;
      printHeader(groupFont);

      chunks.push(ALIGN_CENTER);
      chunks.push(SIZE_SECTION);
      chunks.push(BOLD_ON);
      const sectionTitle =
        group.key === "main" && hasMain && hasSushi
          ? `${group.title} (${group.items.length}) + Sushi`
          : `${group.title} (${group.items.length})`;

      chunks.push(text(normalizePrintText(sectionTitle)));
      chunks.push(nl(2));
      chunks.push(BOLD_OFF);
      chunks.push(ALIGN_LEFT);

      const isDrinkGroup = group.key === "drink";
      const shouldShowSushiHint = group.key === "main" && hasMain && hasSushi;
      chunks.push(isDrinkGroup ? SIZE_ITEM : SIZE_FOOD);

      if (!isDrinkGroup) {
        chunks.push(BOLD_ON);
      }

      if (shouldShowSushiHint) {
        chunks.push(text(normalizePrintText("+ Sushi")));
        chunks.push(nl(3));
      }

      group.items.forEach((item) => {
        if (isDrinkGroup) {
          chunks.push(text(normalizePrintText(`${item.qty} x  ${item.name}`)));
          chunks.push(nl(2));
          return;
        }

        const label = item.kitchen_label || item.name;
        const plu = item.plu ? `${item.plu}.`.padEnd(6, " ") : "";
        chunks.push(text(normalizePrintText(`${item.qty} x  ${plu}${label}`)));
        chunks.push(nl());

        if (item.note?.trim()) {
          chunks.push(SIZE_NORMAL);
          chunks.push(BOLD_ON);
          chunks.push(text(normalizePrintText(`>> ${item.note.trim()}`)));
          chunks.push(BOLD_OFF);
          chunks.push(SIZE_FOOD);
          chunks.push(nl(2));
        } else {
          chunks.push(nl(2));
        }
      });

      if (!isDrinkGroup) {
        chunks.push(BOLD_OFF);
      }

      chunks.push(SIZE_NORMAL);
      chunks.push(nl(2));
      chunks.push(ALIGN_CENTER);
      chunks.push(SIZE_BIG);
      chunks.push(BOLD_ON);
      chunks.push(text(normalizePrintText(`Tisch: ${tableNumber}`)));
      chunks.push(BOLD_OFF);
      chunks.push(SIZE_NORMAL);
      chunks.push(ALIGN_LEFT);
      chunks.push(nl(5));
      chunks.push(CUT);
    });

    const data = Buffer.concat(chunks);
    const net = await import("net");

    await new Promise<void>((resolve, reject) => {
      const client = new net.Socket();

      client.connect(PRINTER_PORT, PRINTER_IP, () => {
        client.write(data);
        client.end();
        resolve();
      });

      client.on("error", reject);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "print failed" }, { status: 500 });
  }
}