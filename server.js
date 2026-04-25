import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const fetchImage = async (url) => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8000,
    });
    return Buffer.from(response.data);
  } catch {
    return null;
  }
};

const formatPrice = (price, deal) => {
  if (!price) return "Price on Request";
  const formatted = Number(price).toLocaleString("en-IN");
  return deal === "Rent" ? `₹${formatted}/mo` : `₹${formatted}`;
};

app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family:sans-serif;text-align:center;padding-top:50px">
      <h1 style="color:#2c3e50">🚀 Property Bulbul PDF Service</h1>
      <p>Status: <span style="color:#27ae60;font-weight:bold">ONLINE</span></p>
      <p>Ready for <code>POST /generate-brochure</code></p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;

  if (!property) {
    return res.status(400).json({ error: "Property data is required" });
  }

  const p = {
    _id: property._id || "PROPERTY001",
    title: property.title || "Property Listing",
    description: property.description || "Property details coming soon.",
    price: property.price || 0,
    deal: property.deal || "Sale",
    area: property.area || { value: 0, unit: "sq ft" },
    facilities: property.facilities || { bedrooms: 0, bathrooms: 0 },
    facing: property.facing || "N/A",
    availability: property.availability || "Available",
    furnishing: property.furnishing || "N/A",
    propertyCategory: property.propertyCategory || "Residential",
    image: Array.isArray(property.image) ? property.image : [],
    user: property.user || {},
    location: property.location || {},
  };

  console.log(`⏳ Generating PDF for: ${p.title}...`);

  try {
    // Colors
    const PRIMARY = "#4161df";
    const DARK = "#1f2937";
    const LIGHT = "#6b7280";
    const BG = "#f8fafc";
    const BORDER = "#e2e8f0";

    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const pdfDone = new Promise((res, rej) => {
      doc.on("end", res);
      doc.on("error", rej);
    });

    const W = 595.28; // A4 width
    const H = 841.89; // A4 height
    const M = 40; // margin
    const CW = W - M * 2; // content width

    // ── WATERMARK ──────────────────────────────────────────────
    doc
      .save()
      .translate(W / 2, H / 2)
      .rotate(-45)
      .fontSize(55)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .fillOpacity(0.03)
      .text("PROPERTY BULBUL", -160, -30)
      .restore();
    doc.fillOpacity(1);

    // ── HEADER ─────────────────────────────────────────────────
    doc.rect(0, 0, W, 65).fill("#ffffff");
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("Property", M, 18, { continued: true })
      .fillColor(DARK)
      .text("Bulbul");

    const refId = p._id.toString().substring(0, 8).toUpperCase();
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("VERIFIED PROPERTY", W - M - 130, 20, {
        width: 130,
        align: "right",
      })
      .text(`REF: ${refId}`, W - M - 130, 30, { width: 130, align: "right" });

    doc
      .moveTo(M, 63)
      .lineTo(W - M, 63)
      .lineWidth(1.5)
      .strokeColor(PRIMARY)
      .stroke();

    // ── HERO IMAGE ─────────────────────────────────────────────
    let currentY = 75;
    const heroH = 210;

    if (p.image.length > 0) {
      const imgBuf = await fetchImage(p.image[0]);
      if (imgBuf) {
        doc.save();
        doc.roundedRect(M, currentY, CW, heroH, 8).clip();
        doc.image(imgBuf, M, currentY, {
          width: CW,
          height: heroH,
          cover: [CW, heroH],
        });
        doc.restore();
        currentY += heroH + 8;

        // Thumbnails (up to 3)
        if (p.image.length > 1) {
          const tW = (CW - 12) / 3;
          const tH = 65;
          let tx = M;
          for (let i = 1; i <= 3; i++) {
            if (!p.image[i]) {
              // empty thumb placeholder
              doc.roundedRect(tx, currentY, tW, tH, 5).fill(BG);
            } else {
              const tb = await fetchImage(p.image[i]);
              if (tb) {
                doc.save();
                doc.roundedRect(tx, currentY, tW, tH, 5).clip();
                doc.image(tb, tx, currentY, {
                  width: tW,
                  height: tH,
                  cover: [tW, tH],
                });
                doc.restore();
              } else {
                doc.roundedRect(tx, currentY, tW, tH, 5).fill(BG);
              }
            }
            tx += tW + 6;
          }
          currentY += tH + 10;
        }
      } else {
        // No image — placeholder
        doc.roundedRect(M, currentY, CW, 60, 8).fill(BG);
        doc
          .fontSize(10)
          .font("Helvetica")
          .fillColor(LIGHT)
          .text("No image available", M, currentY + 22, {
            width: CW,
            align: "center",
          });
        currentY += 70;
      }
    }

    // ── TITLE + PRICE ──────────────────────────────────────────
    const priceBoxW = 140;
    const titleW = CW - priceBoxW - 10;

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text(p.title, M, currentY, { width: titleW, lineGap: 2 });

    // Price badge
    doc.roundedRect(W - M - priceBoxW, currentY - 4, priceBoxW, 42, 6).fill(BG);
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("PRICE", W - M - priceBoxW + 4, currentY + 2, {
        width: priceBoxW - 8,
        align: "center",
      });
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text(
        formatPrice(p.price, p.deal),
        W - M - priceBoxW + 4,
        currentY + 14,
        { width: priceBoxW - 8, align: "center" },
      );

    currentY += 50;

    // ── SPECS ──────────────────────────────────────────────────
    const specs = [
      { label: "BEDROOMS", value: `${p.facilities.bedrooms || 0} BHK` },
      { label: "BATHROOMS", value: `${p.facilities.bathrooms || 0}` },
      { label: "AREA", value: `${p.area.value} ${p.area.unit}` },
      { label: "STATUS", value: p.availability },
    ];

    const sW = (CW - 15) / 4;
    let sx = M;
    specs.forEach((s) => {
      doc.roundedRect(sx, currentY, sW, 44, 5).fill(BG);
      doc
        .fontSize(6.5)
        .font("Helvetica-Bold")
        .fillColor(LIGHT)
        .text(s.label, sx + 4, currentY + 7, {
          width: sW - 8,
          align: "center",
        });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(s.value, sx + 4, currentY + 20, {
          width: sW - 8,
          align: "center",
        });
      sx += sW + 5;
    });

    currentY += 54;

    // ── DESCRIPTION ────────────────────────────────────────────
    doc.rect(M, currentY, 3, 14).fill(PRIMARY);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("PROPERTY OVERVIEW", M + 9, currentY + 2);
    currentY += 20;

    doc
      .fontSize(9.5)
      .font("Helvetica")
      .fillColor("#4b5563")
      .text(p.description, M, currentY, {
        width: CW,
        align: "justify",
        lineGap: 2,
        height: 90,
        ellipsis: true,
      });

    currentY += 100;

    // ── DETAILS GRID ───────────────────────────────────────────
    doc.rect(M, currentY, 3, 14).fill(PRIMARY);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("PROPERTY DETAILS", M + 9, currentY + 2);
    currentY += 20;

    const details = [
      { label: "Deal Type", value: p.deal },
      { label: "Category", value: p.propertyCategory },
      { label: "Furnishing", value: p.furnishing },
      { label: "Facing", value: p.facing },
      { label: "City", value: p.location?.city || "Tricity" },
      { label: "Address", value: p.location?.address || "N/A" },
    ];

    const dColW = CW / 3;
    details.forEach((d, i) => {
      const dx = M + (i % 3) * dColW;
      const dy = currentY + Math.floor(i / 3) * 32;
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text(d.label, dx, dy, { width: dColW - 8 });
      doc
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(d.value || "N/A", dx, dy + 10, { width: dColW - 8 });
    });

    currentY += 70;

    // ── DIVIDER ────────────────────────────────────────────────
    doc
      .moveTo(M, currentY)
      .lineTo(W - M, currentY)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();

    // ── FOOTER ─────────────────────────────────────────────────
    const footerY = H - 52;
    doc
      .moveTo(M, footerY)
      .lineTo(W - M, footerY)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();

    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text("Inquiry Contact:", M, footerY + 10);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text(
        p.user?.phone
          ? `📞 ${p.user.phone}   📧 ${p.user.email || "contact@propertybulbul.com"}`
          : p.user?.email || "contact@propertybulbul.com",
        M,
        footerY + 21,
      );

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("Official Listing Brochure", W - M - 160, footerY + 10, {
        width: 160,
        align: "right",
      });
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("propertybulbul.com", W - M - 160, footerY + 21, {
        width: 160,
        align: "right",
      });

    doc.end();
    await pdfDone;

    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="brochure.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`✅ PDF generated for: ${p.title}`);
  } catch (error) {
    console.error("🚨 PDF Generation Error:", error.message);
    res.status(500).json({
      error: "Failed to generate PDF",
      details: error.message,
    });
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ PDF Service active on port ${PORT}`);
});
