import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PRINTER_IP = "192.168.2.61";
const PRINTER_PORT = 9100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { table, items } = body;

    const printableItems = items ?? [];

    if (printableItems.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const response = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    let userName = "";

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("staff_profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      userName = profile?.username ?? user.email ?? "";
    }

    // 🧾 Bon erstellen
    const now = new Date();
    const time = now.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = (str: string) => Buffer.from(str, "utf8");
    const nl = (n = 1) => Buffer.from("\n".repeat(n), "utf8");

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

    const categoryOrder = ["drink", "soup", "starter", "main", "noodle", "sushi", "dessert"];
    const categoryLabels: Record<string, string> = {
      drink: "GETRAENKE",
      soup: "SUPPEN",
      starter: "VORSPEISEN",
      main: "SPEISEN",
      noodle: "NUDELN",
      sushi: "SUSHI",
      dessert: "DESSERT",
    };

    const groupedItems = categoryOrder
      .map((category) => ({
        category,
        label: categoryLabels[category] ?? category.toUpperCase(),
        items: printableItems.filter((item: any) => item.category === category),
      }))
      .filter((group) => group.items.length > 0);

    // ESC/POS commands
    const INIT = Buffer.from([0x1b, 0x40]);
    const ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
    const ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
    const BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
    const BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
    const SIZE_BIG = Buffer.from([0x1d, 0x21, 0x22]); // larger table text
    const SIZE_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
    const SIZE_ITEM = Buffer.from([0x1d, 0x21, 0x01]); // slightly smaller item text
    const CUT = Buffer.from([0x1d, 0x56, 0x00]);

    const chunks: Buffer[] = [];

    chunks.push(INIT);

    // 👉 Tisch groß und zentriert
    chunks.push(ALIGN_CENTER);
    chunks.push(BOLD_ON);
    chunks.push(SIZE_BIG);
    const tableNumber = String(table).replace(/^T/i, "");
    chunks.push(text(normalizePrintText(`Tisch ${tableNumber}`)));
    chunks.push(nl());
    chunks.push(SIZE_NORMAL);
    chunks.push(BOLD_OFF);
    chunks.push(text(normalizePrintText(time)));
    chunks.push(nl(3));
    if (userName) {
      chunks.push(BOLD_ON);
      chunks.push(text(normalizePrintText(`BEDIENER: ${userName}`)));
      chunks.push(BOLD_OFF);
      chunks.push(nl(2));
    }

    chunks.push(BOLD_OFF);
    chunks.push(SIZE_NORMAL);

    // 👉 Artikel nach Kategorie gruppiert
    chunks.push(ALIGN_LEFT);
    chunks.push(SIZE_ITEM);

    groupedItems.forEach((group) => {
      chunks.push(BOLD_ON);
      chunks.push(text(`--- ${group.label} ---`));
      chunks.push(nl(2));
      chunks.push(BOLD_OFF);

      group.items.forEach((item: any) => {
        chunks.push(text(normalizePrintText(`${item.qty} x ${item.name}`)));
        chunks.push(nl(2));
      });

      chunks.push(nl());
    });

    chunks.push(SIZE_NORMAL);
    chunks.push(text("------------------------------"));
    chunks.push(nl(6));

    chunks.push(CUT);

    const data = Buffer.concat(chunks);

    // TCP Socket to printer
    const net = await import("net");

    await new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(PRINTER_PORT, PRINTER_IP, () => {
        client.write(data);
        client.end();
        resolve(true);
      });

      client.on("error", reject);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "print failed" });
  }
}