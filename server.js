import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const fetchImage = async (url) => {
  try {
    if (!url || typeof url !== "string") return null;
    const response = await axios.get(url.trim(), {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "PropertyBulbul-PDF/1.0" },
    });
    const buf = Buffer.from(response.data);
    if (
      buf[0] === 0xff ||
      buf[0] === 0x89 ||
      buf[0] === 0x47 ||
      buf[0] === 0x52
    )
      return buf;
    return null;
  } catch {
    return null;
  }
};

const formatPrice = (price, deal) => {
  if (!price && price !== 0) return "Price on Request";
  const formatted = Number(price).toLocaleString("en-IN");
  return deal === "Rent" ? `Rs ${formatted}/mo` : `Rs ${formatted}`;
};

const truncate = (str, len) =>
  str && str.length > len ? str.substring(0, len) + "..." : str || "";

app.get("/", (req, res) => {
  res.status(200).send(`
    <div style="font-family:sans-serif;text-align:center;padding-top:50px">
      <h1 style="color:#4161df">Property Bulbul PDF Service</h1>
      <p>Status: <span style="color:#27ae60;font-weight:bold">ONLINE</span></p>
      <p>Ready for POST /generate-brochure</p>
    </div>
  `);
});

app.post("/generate-brochure", async (req, res) => {
  const { property } = req.body;
  if (!property)
    return res.status(400).json({ error: "Property data is required" });

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
    image: Array.isArray(property.image) ? property.image.filter(Boolean) : [],
    user: property.user || {},
    location: property.location || {},
  };

  console.log(`Generating PDF for: ${p.title}`);

  try {
    // Design tokens
    const PRIMARY = "#4161df";
    const DARK = "#111827";
    const MUTED = "#374151";
    const LIGHT = "#9ca3af";
    const BG = "#f3f4f6";
    const WHITE = "#ffffff";

    const doc = new PDFDocument({ size: "A4", margin: 0, compress: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const pdfDone = new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const W = 595.28;
    const H = 841.89;
    const M = 36;
    const CW = W - M * 2;

    // White background
    doc.rect(0, 0, W, H).fill(WHITE);

    // ── HEADER ────────────────────────────────────────────────
    doc.rect(0, 0, W, 56).fill(PRIMARY);

    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text("Property", M, 16, { continued: true })
      .font("Helvetica")
      .text("Bulbul");

    // Verified badge box
    doc
      .rect(W - M - 118, 13, 118, 30)
      .fillOpacity(0.2)
      .fill(WHITE);
    doc.fillOpacity(1);
    doc
      .fontSize(7)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text("VERIFIED LISTING", W - M - 114, 19, {
        width: 110,
        align: "center",
      });
    const refId = p._id.toString().substring(0, 8).toUpperCase();
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(`REF: ${refId}`, W - M - 114, 29, { width: 110, align: "center" });

    let Y = 66;

    // ── IMAGES ────────────────────────────────────────────────
    // Fetch all images in parallel (max 5)
    const imageUrls = p.image.slice(0, 5);
    const imgBuffers = await Promise.all(imageUrls.map(fetchImage));
    const validImgs = imgBuffers.filter(Boolean);

    if (validImgs.length === 0) {
      // No image placeholder
      doc.rect(M, Y, CW, 75).fill(BG);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text("No images available", M, Y + 28, { width: CW, align: "center" });
      Y += 85;
    } else if (validImgs.length === 1) {
      // Single image — full width, good height
      const imgH = 220;
      doc.save();
      doc.rect(M, Y, CW, imgH).clip();
      // Use 'contain' approach: scale to fill width, center vertically
      doc.image(validImgs[0], M, Y, {
        width: CW,
        height: imgH,
        cover: [CW, imgH],
      });
      doc.restore();
      // Subtle border
      doc.rect(M, Y, CW, imgH).lineWidth(0.5).stroke("#e5e7eb");
      Y += imgH + 10;
    } else {
      // Multiple images: large hero on left, thumbnails on right
      const heroH = 220;
      const heroW = Math.round(CW * 0.64);
      const sideW = CW - heroW - 6;
      const sideX = M + heroW + 6;

      // Hero image
      doc.save();
      doc.rect(M, Y, heroW, heroH).clip();
      doc.image(validImgs[0], M, Y, {
        width: heroW,
        height: heroH,
        cover: [heroW, heroH],
      });
      doc.restore();
      doc.rect(M, Y, heroW, heroH).lineWidth(0.5).stroke("#e5e7eb");

      // Side thumbnails — evenly divide available height
      const sideCount = Math.min(validImgs.length - 1, 4);
      const gapCount = sideCount - 1;
      const totalGap = gapCount * 5;
      const thumbH = Math.floor((heroH - totalGap) / sideCount);

      for (let i = 0; i < sideCount; i++) {
        const ty = Y + i * (thumbH + 5);
        doc.save();
        doc.rect(sideX, ty, sideW, thumbH).clip();
        doc.image(validImgs[i + 1], sideX, ty, {
          width: sideW,
          height: thumbH,
          cover: [sideW, thumbH],
        });
        doc.restore();
        doc.rect(sideX, ty, sideW, thumbH).lineWidth(0.5).stroke("#e5e7eb");

        // More images overlay badge on last thumb
        if (i === sideCount - 1 && p.image.length > 5) {
          doc.rect(sideX, ty, sideW, thumbH).fillOpacity(0.6).fill("#000000");
          doc.fillOpacity(1);
          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .fillColor(WHITE)
            .text(`+${p.image.length - 5} more`, sideX, ty + thumbH / 2 - 7, {
              width: sideW,
              align: "center",
            });
        }
      }
      doc.fillOpacity(1);
      Y += heroH + 12;
    }

    // ── DEAL BADGE ────────────────────────────────────────────
    const dealColor = p.deal === "Rent" ? "#dc2626" : "#16a34a";
    doc.roundedRect(M, Y, 58, 17, 8).fill(dealColor);
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(p.deal === "Rent" ? "FOR RENT" : "FOR SALE", M, Y + 4, {
        width: 58,
        align: "center",
      });
    Y += 22;

    // ── TITLE + PRICE ─────────────────────────────────────────
    const priceBoxW = 140;
    const titleW = CW - priceBoxW - 12;

    // Title
    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text(truncate(p.title, 75), M, Y, { width: titleW, lineGap: 2 });

    // Price box
    doc.roundedRect(W - M - priceBoxW, Y - 2, priceBoxW, 42, 5).fill(PRIMARY);
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(WHITE)
      .fillOpacity(0.8)
      .text("ASKING PRICE", W - M - priceBoxW + 4, Y + 4, {
        width: priceBoxW - 8,
        align: "center",
      });
    doc.fillOpacity(1);
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(formatPrice(p.price, p.deal), W - M - priceBoxW + 4, Y + 16, {
        width: priceBoxW - 8,
        align: "center",
      });

    Y += 46;

    // Location
    const locText =
      [p.location?.address, p.location?.city].filter(Boolean).join(", ") ||
      "Tricity";
    doc
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text(locText, M, Y, { width: CW });
    Y += 16;

    // ── SPECS ROW ─────────────────────────────────────────────
    const specs = [
      { label: "BEDROOMS", value: `${p.facilities?.bedrooms || 0} BHK` },
      { label: "BATHROOMS", value: String(p.facilities?.bathrooms || 0) },
      {
        label: "AREA",
        value: `${p.area?.value || 0} ${p.area?.unit || "sqft"}`,
      },
      { label: "FACING", value: truncate(p.facing, 10) },
      { label: "STATUS", value: truncate(p.availability, 12) },
    ];

    const specGap = 6;
    const specW = (CW - specGap * (specs.length - 1)) / specs.length;
    let sx = M;
    const specH = 44;

    specs.forEach((s) => {
      doc.rect(sx, Y, specW, specH).fill(BG);
      // Colored top accent
      doc.rect(sx, Y, specW, 3).fill(PRIMARY);
      doc
        .fontSize(6.5)
        .font("Helvetica-Bold")
        .fillColor(LIGHT)
        .text(s.label, sx + 2, Y + 9, { width: specW - 4, align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(s.value, sx + 2, Y + 22, { width: specW - 4, align: "center" });
      sx += specW + specGap;
    });

    Y += specH + 12;

    // ── DESCRIPTION (FULL WIDTH) ──────────────────────────────
    // Section label
    doc.rect(M, Y, 3, 15).fill(PRIMARY);
    doc
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("PROPERTY OVERVIEW", M + 9, Y + 2);
    Y += 22;

    // Description text — full width, no column overlap
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(p.description, M, Y, {
        width: CW,
        align: "justify",
        lineGap: 2.5,
        height: 72,
        ellipsis: true,
      });

    Y += 82;

    // ── PROPERTY DETAILS (TWO COLUMN GRID) ───────────────────
    doc.rect(M, Y, 3, 15).fill(PRIMARY);
    doc
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("PROPERTY DETAILS", M + 9, Y + 2);
    Y += 20;

    const details = [
      { label: "Deal Type", value: p.deal },
      { label: "Category", value: p.propertyCategory },
      { label: "Furnishing", value: p.furnishing },
      { label: "Facing", value: p.facing },
      { label: "City", value: p.location?.city || "Tricity" },
      { label: "Status", value: p.availability },
    ];

    // 3 columns, 2 rows
    const dColCount = 3;
    const dColW = (CW - (dColCount - 1) * 8) / dColCount;
    const dRowH = 32;

    details.forEach((d, i) => {
      const col = i % dColCount;
      const row = Math.floor(i / dColCount);
      const dx = M + col * (dColW + 8);
      const dy = Y + row * dRowH;

      doc.rect(dx, dy, dColW, dRowH - 3).fill(BG);
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text(d.label, dx + 6, dy + 4, { width: dColW - 10 });
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(truncate(d.value || "N/A", 22), dx + 6, dy + 14, {
          width: dColW - 10,
        });
    });

    Y += Math.ceil(details.length / dColCount) * dRowH + 10;

    // ── HIGHLIGHTS ────────────────────────────────────────────
    const highlights = [
      p.facilities?.bedrooms ? `${p.facilities.bedrooms} Bedrooms` : null,
      p.facilities?.bathrooms ? `${p.facilities.bathrooms} Bathrooms` : null,
      p.furnishing && p.furnishing !== "N/A" ? p.furnishing : null,
      p.facing && p.facing !== "N/A" ? `${p.facing} Facing` : null,
      p.availability ? p.availability : null,
    ].filter(Boolean);

    if (highlights.length > 0 && Y < H - 100) {
      doc.rect(M, Y, 3, 15).fill(PRIMARY);
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text("HIGHLIGHTS", M + 9, Y + 2);
      Y += 22;

      let hx = M;
      highlights.slice(0, 6).forEach((h) => {
        const tw = doc.widthOfString(h) + 22;
        doc.roundedRect(hx, Y, tw, 19, 9).fill("#e0e7ff");
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text(h, hx + 7, Y + 5, { width: tw - 12 });
        hx += tw + 7;
        if (hx > W - M - 80) {
          hx = M;
          Y += 25;
        }
      });
      Y += 26;
    }

    // ── FOOTER ────────────────────────────────────────────────
    const footerY = H - 54;
    doc.rect(0, footerY, W, 54).fill("#f8fafc");
    doc
      .moveTo(0, footerY)
      .lineTo(W, footerY)
      .lineWidth(0.5)
      .strokeColor("#e5e7eb")
      .stroke();

    // Left — contact
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text("INQUIRY CONTACT", M, footerY + 9);
    const phone = p.user?.phone || "";
    const email = p.user?.email || "contact@propertybulbul.com";
    const contactLine = phone
      ? `Ph: ${phone}    Email: ${email}`
      : `Email: ${email}`;
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(contactLine, M, footerY + 20, { width: CW * 0.58 });

    // Divider
    doc
      .moveTo(W * 0.62, footerY + 8)
      .lineTo(W * 0.62, footerY + 46)
      .lineWidth(0.5)
      .strokeColor("#e5e7eb")
      .stroke();

    // Right — brand
    const brandX = W * 0.64;
    const brandW = W - brandX - M;
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("Official Property Brochure", brandX, footerY + 9, {
        width: brandW,
        align: "right",
      });
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("propertybulbul.com", brandX, footerY + 20, {
        width: brandW,
        align: "right",
      });
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("Tricity's AI-Powered Property Search", brandX, footerY + 35, {
        width: brandW,
        align: "right",
      });

    // ── WATERMARK ─────────────────────────────────────────────
    doc
      .save()
      .translate(W / 2, H / 2)
      .rotate(-42)
      .fontSize(58)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .fillOpacity(0.025)
      .text("PROPERTY BULBUL", -170, -25)
      .restore();
    doc.fillOpacity(1);

    doc.end();
    await pdfDone;

    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="brochure.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`PDF generated: ${p.title}`);
  } catch (error) {
    console.error("PDF Error:", error.message);
    res
      .status(500)
      .json({ error: "Failed to generate PDF", details: error.message });
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`PDF Service active on port ${PORT}`));
