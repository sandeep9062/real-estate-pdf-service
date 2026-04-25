import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));

// Fetch image as buffer with timeout
const fetchImage = async (url) => {
  try {
    if (!url || typeof url !== "string") return null;
    const response = await axios.get(url.trim(), {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "PropertyBulbul-PDF/1.0" },
    });
    const buf = Buffer.from(response.data);
    // Basic check — JPEG starts with FF D8, PNG with 89 50
    if (buf[0] === 0xff || buf[0] === 0x89 || buf[0] === 0x47) return buf;
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
      <p>Ready for <code>POST /generate-brochure</code></p>
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
    // ── Design tokens ──────────────────────────────────────────
    const PRIMARY = "#4161df";
    const DARK = "#111827";
    const MUTED = "#374151";
    const LIGHT = "#9ca3af";
    const BG = "#f3f4f6";
    const WHITE = "#ffffff";
    const ACCENT = "#1e3a8a";

    // ── Page setup ─────────────────────────────────────────────
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

    // ── Helper: draw rounded rect ──────────────────────────────
    const roundRect = (x, y, w, h, r, fillColor, strokeColor) => {
      doc.save();
      doc.roundedRect(x, y, w, h, r);
      if (fillColor) doc.fill(fillColor);
      if (strokeColor) doc.stroke(strokeColor);
      doc.restore();
    };

    // ── Helper: section heading ────────────────────────────────
    const sectionHeading = (label, y) => {
      doc.rect(M, y, 3, 16).fill(PRIMARY);
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text(label, M + 10, y + 3);
      return y + 24;
    };

    // =====================================================
    // BACKGROUND
    // =====================================================
    doc.rect(0, 0, W, H).fill(WHITE);

    // =====================================================
    // HEADER BAR
    // =====================================================
    doc.rect(0, 0, W, 58).fill(PRIMARY);

    // Brand name
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text("Property", M, 16, { continued: true })
      .font("Helvetica")
      .text("Bulbul");

    // Ref + verified badge
    const refId = p._id.toString().substring(0, 8).toUpperCase();
    roundRect(W - M - 120, 12, 120, 34, 4, "rgba(255,255,255,0.15)", null);
    doc
      .fontSize(7)
      .font("Helvetica-Bold")
      .fillColor("rgba(255,255,255,0.8)")
      .text("VERIFIED LISTING", W - M - 116, 17, {
        width: 112,
        align: "center",
      });
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(`REF: ${refId}`, W - M - 116, 28, { width: 112, align: "center" });

    let Y = 68; // current Y position

    // =====================================================
    // IMAGE GALLERY
    // =====================================================
    const images = p.image.slice(0, 5); // max 5 images
    const heroH = 195;
    const thumbH = 72;
    const gap = 6;

    if (images.length > 0) {
      // Fetch all images in parallel
      const imgBuffers = await Promise.all(images.map(fetchImage));

      // Hero image (always full width)
      const heroW = images.length > 1 ? CW * 0.62 : CW;
      const heroX = M;

      if (imgBuffers[0]) {
        doc.save();
        doc.roundedRect(heroX, Y, heroW, heroH, 8).clip();
        doc.image(imgBuffers[0], heroX, Y, {
          width: heroW,
          height: heroH,
          cover: [heroW, heroH],
        });
        doc.restore();
      } else {
        roundRect(heroX, Y, heroW, heroH, 8, BG, null);
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(LIGHT)
          .text("No Image", heroX, Y + heroH / 2 - 6, {
            width: heroW,
            align: "center",
          });
      }

      // Side thumbnails (up to 4)
      if (images.length > 1) {
        const sideX = heroX + heroW + gap;
        const sideW = CW - heroW - gap;
        const maxThumbs = 4;
        const thumbCount = Math.min(images.length - 1, maxThumbs);
        const thumbW = sideW;
        const totalGaps = (thumbCount - 1) * gap;
        const eachThumbH = (heroH - totalGaps) / thumbCount;

        for (let i = 0; i < thumbCount; i++) {
          const tx = sideX;
          const ty = Y + i * (eachThumbH + gap);
          const buf = imgBuffers[i + 1];

          if (buf) {
            doc.save();
            doc.roundedRect(tx, ty, thumbW, eachThumbH, 6).clip();
            doc.image(buf, tx, ty, {
              width: thumbW,
              height: eachThumbH,
              cover: [thumbW, eachThumbH],
            });
            doc.restore();
          } else {
            roundRect(tx, ty, thumbW, eachThumbH, 6, BG, null);
          }

          // Image count badge on last thumb
          if (i === maxThumbs - 1 && images.length > maxThumbs + 1) {
            roundRect(tx, ty, thumbW, eachThumbH, 6, "rgba(0,0,0,0.5)", null);
            doc
              .fontSize(11)
              .font("Helvetica-Bold")
              .fillColor(WHITE)
              .text(
                `+${images.length - maxThumbs - 1} more`,
                tx,
                ty + eachThumbH / 2 - 8,
                {
                  width: thumbW,
                  align: "center",
                },
              );
          }
        }
      }

      Y += heroH + 14;
    } else {
      // No images placeholder
      roundRect(M, Y, CW, 80, 8, BG, null);
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text("No images available", M, Y + 32, { width: CW, align: "center" });
      Y += 94;
    }

    // =====================================================
    // TITLE + DEAL BADGE + PRICE
    // =====================================================
    // Deal badge
    const dealColor = p.deal === "Rent" ? "#dc2626" : "#16a34a";
    roundRect(M, Y, 52, 18, 9, dealColor, null);
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(p.deal === "Rent" ? "FOR RENT" : "FOR SALE", M + 2, Y + 5, {
        width: 48,
        align: "center",
      });

    Y += 22;

    // Title
    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text(truncate(p.title, 80), M, Y, { width: CW - 145, lineGap: 1 });

    // Price box (right aligned)
    roundRect(W - M - 138, Y - 4, 138, 42, 6, PRIMARY, null);
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("rgba(255,255,255,0.8)")
      .text("ASKING PRICE", W - M - 134, Y + 2, {
        width: 130,
        align: "center",
      });
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(formatPrice(p.price, p.deal), W - M - 134, Y + 14, {
        width: 130,
        align: "center",
      });

    Y += 46;

    // Location line
    doc
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(
        [p.location?.address, p.location?.city].filter(Boolean).join(", ") ||
          "Tricity",
        M,
        Y,
        { width: CW },
      );

    Y += 18;

    // =====================================================
    // SPECS ROW
    // =====================================================
    const specs = [
      { label: "BEDROOMS", value: `${p.facilities?.bedrooms || 0} BHK` },
      { label: "BATHROOMS", value: `${p.facilities?.bathrooms || 0}` },
      {
        label: "AREA",
        value: `${p.area?.value || 0} ${p.area?.unit || "sqft"}`,
      },
      { label: "FACING", value: p.facing },
      { label: "STATUS", value: p.availability },
    ];

    const sW = (CW - (specs.length - 1) * 6) / specs.length;
    let sx = M;

    specs.forEach((s) => {
      roundRect(sx, Y, sW, 46, 6, BG, null);
      // Colored top bar
      doc.rect(sx, Y, sW, 3).fill(PRIMARY);
      doc
        .fontSize(6.5)
        .font("Helvetica-Bold")
        .fillColor(LIGHT)
        .text(s.label, sx + 3, Y + 9, { width: sW - 6, align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(truncate(s.value, 12), sx + 3, Y + 22, {
          width: sW - 6,
          align: "center",
        });
      sx += sW + 6;
    });

    Y += 56;

    // =====================================================
    // TWO COLUMN LAYOUT — Description | Details
    // =====================================================
    const leftW = CW * 0.58;
    const rightW = CW - leftW - 14;
    const rightX = M + leftW + 14;
    const colStartY = Y;

    // ── LEFT: Description ──────────────────────────────
    Y = sectionHeading("PROPERTY OVERVIEW", colStartY);

    doc
      .fontSize(8.5)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(p.description, M, Y, {
        width: leftW,
        align: "justify",
        lineGap: 2.5,
        height: 115,
        ellipsis: true,
      });

    Y += 124;

    // ── RIGHT: Property Details ────────────────────────
    let rightY = sectionHeading("PROPERTY DETAILS", colStartY);

    const details = [
      { label: "Deal Type", value: p.deal },
      { label: "Category", value: p.propertyCategory },
      { label: "Furnishing", value: p.furnishing },
      { label: "Facing", value: p.facing },
      { label: "City", value: p.location?.city || "Tricity" },
      { label: "Status", value: p.availability },
    ];

    details.forEach((d) => {
      // Row background alternating
      roundRect(rightX, rightY, rightW, 22, 3, BG, null);
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text(d.label, rightX + 6, rightY + 3, { width: rightW - 10 });
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(truncate(d.value || "N/A", 20), rightX + 6, rightY + 12, {
          width: rightW - 10,
        });
      rightY += 26;
    });

    // Advance Y to after both columns
    Y = Math.max(Y, rightY) + 10;

    // =====================================================
    // AMENITIES / HIGHLIGHTS STRIP
    // =====================================================
    const highlights = [];
    if (p.facilities?.bedrooms)
      highlights.push(`${p.facilities.bedrooms} Bedrooms`);
    if (p.facilities?.bathrooms)
      highlights.push(`${p.facilities.bathrooms} Bathrooms`);
    if (p.facilities?.parkings)
      highlights.push(`${p.facilities.parkings} Parking`);
    if (p.furnishing && p.furnishing !== "N/A") highlights.push(p.furnishing);
    if (p.facing && p.facing !== "N/A") highlights.push(`${p.facing} Facing`);
    if (p.availability) highlights.push(p.availability);

    if (highlights.length > 0 && Y < H - 110) {
      Y = sectionHeading("HIGHLIGHTS", Y);
      let hx = M;
      highlights.slice(0, 6).forEach((h) => {
        const tw = doc.widthOfString(h, { fontSize: 8 }) + 18;
        roundRect(hx, Y, tw, 20, 10, "#e0e7ff", null);
        doc
          .fontSize(8)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY)
          .text(h, hx + 6, Y + 6, { width: tw - 10 });
        hx += tw + 6;
        if (hx > W - M - 60) {
          hx = M;
          Y += 26;
        }
      });
      Y += 28;
    }

    // =====================================================
    // FOOTER
    // =====================================================
    const footerY = H - 58;

    // Footer background strip
    doc.rect(0, footerY, W, 58).fill("#f8fafc");
    doc
      .moveTo(0, footerY)
      .lineTo(W, footerY)
      .lineWidth(0.5)
      .strokeColor("#e5e7eb")
      .stroke();

    // Left — contact info
    doc
      .fontSize(7.5)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text("INQUIRY CONTACT", M, footerY + 10);

    const phone = p.user?.phone || "";
    const email = p.user?.email || "contact@propertybulbul.com";
    const contactLine = phone
      ? `Ph: ${phone}    Email: ${email}`
      : `Email: ${email}`;

    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(contactLine, M, footerY + 21, { width: CW * 0.6 });

    // Center divider
    doc
      .moveTo(W / 2, footerY + 8)
      .lineTo(W / 2, footerY + 48)
      .lineWidth(0.5)
      .strokeColor("#e5e7eb")
      .stroke();

    // Right — brand
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("Official Property Brochure", W / 2 + 10, footerY + 10, {
        width: W / 2 - M - 10,
        align: "right",
      });
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("propertybulbul.com", W / 2 + 10, footerY + 22, {
        width: W / 2 - M - 10,
        align: "right",
      });
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text("Tricity's AI-Powered Property Search", W / 2 + 10, footerY + 37, {
        width: W / 2 - M - 10,
        align: "right",
      });

    // =====================================================
    // WATERMARK
    // =====================================================
    doc
      .save()
      .translate(W / 2, H / 2 - 40)
      .rotate(-42)
      .fontSize(62)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .fillOpacity(0.025)
      .text("PROPERTY BULBUL", -175, -30)
      .restore();

    doc.fillOpacity(1);

    // Finalize
    doc.end();
    await pdfDone;

    const pdfBuffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="brochure.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);

    console.log(`PDF generated successfully: ${p.title}`);
  } catch (error) {
    console.error("PDF Generation Error:", error.message);
    res
      .status(500)
      .json({ error: "Failed to generate PDF", details: error.message });
  }
});

app.get("/ping", (req, res) => res.status(200).send("pong"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`PDF Service active on port ${PORT}`));
