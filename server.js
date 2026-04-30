import express from "express";
import cors from "cors";
import PDFDocument from "pdfkit";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconPath = path.join(__dirname, "images", "bulbul-icon.png");
let iconBuffer = null;
try {
  iconBuffer = fs.readFileSync(iconPath);
} catch (e) {
  console.warn("Could not load bulbul-icon.png:", e.message);
}

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

const formatINR = (n) => {
  if (n == null || n === "") return null;
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return `Rs ${num.toLocaleString("en-IN")}`;
};

const truncate = (str, len) =>
  str && str.length > len ? str.substring(0, len) + "…" : str || "";

const stripHtml = (s) =>
  typeof s === "string"
    ? s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";

const uniqueStrings = (arr) => {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const t = typeof x === "string" ? x.trim() : "";
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
};

/** Rounded rect clip + bordered image fit (points). */
const drawImageFitRounded = (doc, buffer, x, y, w, h, r) => {
  const rad = Math.min(r, w / 2, h / 2);
  doc.save();
  doc.roundedRect(x, y, w, h, rad).clip();
  doc.image(buffer, x, y, {
    width: w,
    height: h,
    fit: [w, h],
    align: "center",
    valign: "center",
  });
  doc.restore();
  doc
    .roundedRect(x, y, w, h, rad)
    .lineWidth(0.65)
    .strokeColor("#e2e8f0")
    .stroke();
};

const fillPageCanvas = (doc, W, H, wmColor = "#4338ca") => {
  doc.rect(0, 0, W, H).fill("#fafbfd");
  doc
    .save()
    .translate(W / 2, H / 2)
    .rotate(-42)
    .fontSize(54)
    .font("Helvetica-Bold")
    .fillColor(wmColor)
    .fillOpacity(0.022)
    .text("PROPERTY BULBUL", -165, -22)
    .restore();
  doc.fillOpacity(1);
};

function normalizeProperty(property) {
  const f = property.facilities || {};
  return {
    _id: property._id || "PROPERTY001",
    title: property.title || "Property Listing",
    description: stripHtml(property.description || "Property details coming soon."),
    price: property.price ?? 0,
    deal: property.deal || "Sale",
    type: property.type || "Residential",
    propertyCategory: property.propertyCategory || "Residential",
    area: property.area || { value: 0, unit: "sqft" },
    facilities: {
      bedrooms: f.bedrooms ?? 0,
      bathrooms: f.bathrooms ?? 0,
      servantRooms: f.servantRooms ?? 0,
      parkings: f.parkings ?? 0,
      balconies: f.balconies ?? 0,
      parkingType: f.parkingType,
      totalFloors: f.totalFloors,
      waterSupply: f.waterSupply,
      powerBackup: f.powerBackup,
      securityFeatures: Array.isArray(f.securityFeatures) ? f.securityFeatures : [],
    },
    floor: property.floor,
    facing: property.facing,
    availability: property.availability,
    furnishing: property.furnishing,
    ageOfProperty: property.ageOfProperty,
    image: Array.isArray(property.image) ? property.image.filter(Boolean) : [],
    user: property.user || {},
    location: property.location || {},
    maintenanceCharge: property.maintenanceCharge,
    securityDeposit: property.securityDeposit,
    lockInMonths: property.lockInMonths,
    noticePeriodDays: property.noticePeriodDays,
    projectName: property.projectName,
    builderName: property.builderName,
    totalUnits: property.totalUnits,
    societyAmenities: Array.isArray(property.societyAmenities)
      ? property.societyAmenities
      : [],
    amenities: Array.isArray(property.amenities) ? property.amenities : [],
    commercialPropertyTypes: Array.isArray(property.commercialPropertyTypes)
      ? property.commercialPropertyTypes
      : [],
    investmentOptions: Array.isArray(property.investmentOptions)
      ? property.investmentOptions
      : [],
    ownershipType: property.ownershipType,
    reraNumber: property.reraNumber,
    ocStatus: property.ocStatus,
    listingAvailability: property.listingAvailability,
    postedBy: property.postedBy,
    negotiable: property.negotiable,
    contactNumber: Array.isArray(property.contactNumber)
      ? property.contactNumber
      : [],
    preferredContact: property.preferredContact,
    pricePerSqft: property.pricePerSqft,
    bulbulVerified: Boolean(property.bulbulVerified),
    isVerified: Boolean(property.isVerified),
    status: property.status,
    videoUrl: property.videoUrl,
    virtualTourUrl: property.virtualTourUrl,
    createdAt: property.createdAt,
    updatedAt: property.updatedAt,
  };
}

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

  const p = normalizeProperty(property);
  console.log(`Generating PDF for: ${p.title}`);

  try {
    const PRIMARY = "#4338ca";
    const PRIMARY_DEEP = "#3730a3";
    const PRIMARY_SOFT = "#eef2ff";
    const DARK = "#0f172a";
    const MUTED = "#475569";
    const LIGHT = "#64748b";
    const BORDER = "#e2e8f0";
    const WHITE = "#ffffff";
    const IMG_R = 10;
    const W = 595.28;
    const H = 841.89;
    const M = 36;
    const CW = W - M * 2;
    const FOOTER_H = 58;
    const CONTENT_BOTTOM = H - FOOTER_H - 10;

    const doc = new PDFDocument({ size: "A4", margin: 0, compress: true, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const pdfDone = new Promise((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
    });

    const generatedOn = new Date().toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const refFull = p._id?.toString?.() || String(p._id);
    const refShort = refFull.replace(/[^a-f0-9]/gi, "").slice(-8).toUpperCase() || "LISTING";

    const drawPage1Header = () => {
      const headerH = 64;
      doc.rect(0, 0, W, headerH).fill(PRIMARY_DEEP);
      doc.rect(0, headerH - 3, W, 3).fill("#6366f1");

      const iconSize = 36;
      const contentCenterY = headerH / 2;
      const iconY = contentCenterY - iconSize / 2;
      const textY = contentCenterY - 9;
      let textX = M;

      if (iconBuffer) {
        doc.save();
        doc
          .circle(M + iconSize / 2, contentCenterY, iconSize / 2 + 2)
          .fillOpacity(0.18)
          .fill(WHITE);
        doc.fillOpacity(1);
        doc.restore();
        doc.image(iconBuffer, M, iconY, { width: iconSize, height: iconSize });
        textX = M + iconSize + 14;
      }

      doc
        .fontSize(19)
        .font("Helvetica-Bold")
        .fillColor(WHITE)
        .text("Property", textX, textY, { continued: true })
        .font("Helvetica")
        .text("Bulbul");
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor(WHITE)
        .fillOpacity(0.78)
        .text("Professional listing brochure · " + generatedOn, textX, textY + 20);
      doc.fillOpacity(1);

      const verified = p.bulbulVerified || p.isVerified;
      const badgeW = verified ? 118 : 100;
      const badgeX = W - M - badgeW;
      const badgeY = 15;
      doc.roundedRect(badgeX, badgeY, badgeW, 36, 8);
      doc.fillOpacity(0.12);
      doc.fill(WHITE);
      doc.fillOpacity(1);
      doc.roundedRect(badgeX, badgeY, badgeW, 36, 8);
      doc.lineWidth(0.5);
      doc.strokeOpacity(0.45);
      doc.strokeColor(WHITE);
      doc.stroke();
      doc.strokeOpacity(1);
      doc
        .fontSize(6.5)
        .font("Helvetica-Bold")
        .fillColor(WHITE)
        .fillOpacity(0.95)
        .text(verified ? "VERIFIED LISTING" : "LISTING", badgeX + 6, badgeY + 8, {
          width: badgeW - 12,
          align: "center",
        });
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(WHITE)
        .fillOpacity(1)
        .text(`REF · ${refShort}`, badgeX + 6, badgeY + 20, {
          width: badgeW - 12,
          align: "center",
        });
      return headerH;
    };

    fillPageCanvas(doc, W, H, PRIMARY);
    const headerH = drawPage1Header();
    let Y = headerH + 16;

    const imageUrls = p.image.slice(0, 5);
    const imgBuffers = await Promise.all(imageUrls.map(fetchImage));
    const validImgs = imgBuffers.filter(Boolean);

    if (validImgs.length === 0) {
      const phH = 72;
      doc.roundedRect(M, Y, CW, phH, IMG_R).fill("#f1f5f9");
      doc
        .roundedRect(M, Y, CW, phH, IMG_R)
        .lineWidth(0.75)
        .strokeColor(BORDER)
        .stroke();
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text("Photos coming soon — visit the live listing for updates.", M, Y + phH / 2 - 5, {
          width: CW,
          align: "center",
        });
      Y += phH + 12;
    } else if (validImgs.length === 1) {
      const imgH = 210;
      drawImageFitRounded(doc, validImgs[0], M, Y, CW, imgH, IMG_R);
      Y += imgH + 12;
    } else {
      const heroH = 210;
      const gap = 8;
      const heroW = Math.round(CW * 0.64);
      const sideW = CW - heroW - gap;
      const sideX = M + heroW + gap;
      const thumbR = 8;
      drawImageFitRounded(doc, validImgs[0], M, Y, heroW, heroH, IMG_R);
      const sideCount = Math.min(validImgs.length - 1, 4);
      const gapCount = Math.max(sideCount - 1, 0);
      const totalGap = gapCount * gap;
      const thumbH = Math.floor((heroH - totalGap) / sideCount);
      for (let i = 0; i < sideCount; i++) {
        const ty = Y + i * (thumbH + gap);
        drawImageFitRounded(
          doc,
          validImgs[i + 1],
          sideX,
          ty,
          sideW,
          thumbH,
          thumbR,
        );
        if (i === sideCount - 1 && p.image.length > 5) {
          doc.save();
          doc.roundedRect(sideX, ty, sideW, thumbH, thumbR).clip();
          doc.rect(sideX, ty, sideW, thumbH).fillOpacity(0.55).fill(DARK);
          doc.restore();
          doc
            .roundedRect(sideX, ty, sideW, thumbH, thumbR)
            .lineWidth(0.65)
            .strokeColor(BORDER)
            .stroke();
          doc
            .fontSize(10)
            .font("Helvetica-Bold")
            .fillColor(WHITE)
            .text(`+${p.image.length - 5} more`, sideX, ty + thumbH / 2 - 6, {
              width: sideW,
              align: "center",
            });
        }
      }
      doc.fillOpacity(1);
      Y += heroH + 12;
    }

    const dealColor = p.deal === "Rent" ? "#be123c" : "#047857";
    const dealLabel = p.deal === "Rent" ? "FOR RENT" : "FOR SALE";
    const dealW = 76;
    doc.roundedRect(M, Y, dealW, 22, 11).fill(dealColor);
    doc
      .fontSize(8.5)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(dealLabel, M, Y + 7, { width: dealW, align: "center" });

    if (p.negotiable === true) {
      const negW = 76;
      const negX = M + dealW + 8;
      doc.roundedRect(negX, Y, negW, 22, 11).fill(PRIMARY_SOFT);
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text("NEGOTIABLE", negX, Y + 7, { width: negW, align: "center" });
    }
    Y += 30;

    const priceBoxW = 156;
    const titleW = CW - priceBoxW - 16;
    doc
      .fontSize(17)
      .font("Helvetica-Bold")
      .fillColor(DARK)
      .text(truncate(p.title, 80), M, Y, { width: titleW, lineGap: 3 });

    const priceBoxH = 52;
    const priceX = W - M - priceBoxW;
    const priceY = Y - 2;
    doc
      .roundedRect(priceX + 1, priceY + 2, priceBoxW, priceBoxH, 12)
      .fillOpacity(0.1)
      .fill(PRIMARY_DEEP);
    doc.fillOpacity(1);
    doc.roundedRect(priceX, priceY, priceBoxW, priceBoxH, 12).fill(PRIMARY);
    doc
      .fontSize(6.5)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .fillOpacity(0.78)
      .text(p.deal === "Rent" ? "MONTHLY RENT" : "ASKING PRICE", priceX + 10, priceY + 9, {
        width: priceBoxW - 20,
        align: "center",
      });
    doc.fillOpacity(1);
    doc
      .fontSize(13)
      .font("Helvetica-Bold")
      .fillColor(WHITE)
      .text(formatPrice(p.price, p.deal), priceX + 10, priceY + 24, {
        width: priceBoxW - 20,
        align: "center",
      });
    if (p.pricePerSqft && p.deal === "Sale" && p.area?.value > 0) {
      doc
        .fontSize(6.5)
        .font("Helvetica")
        .fillColor(WHITE)
        .fillOpacity(0.85)
        .text(
          `~ Rs ${Number(p.pricePerSqft).toLocaleString("en-IN")} / ${p.area.unit || "sqft"}`,
          priceX + 10,
          priceY + 42,
          { width: priceBoxW - 20, align: "center" },
        );
      doc.fillOpacity(1);
    }

    Y += Math.max(50, priceBoxH);

    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(LIGHT)
      .text(
        [p.type, p.propertyCategory].filter(Boolean).join("  ·  "),
        M,
        Y,
        { width: CW },
      );
    Y += 14;

    const addrLine = [
      p.location?.address,
      [p.location?.sector, p.location?.city].filter(Boolean).join(", "),
      [p.location?.state, p.location?.pincode].filter(Boolean).join(" "),
    ]
      .map((x) => (x || "").trim())
      .filter(Boolean);
    const locCardH = 18 + Math.min(addrLine.length, 4) * 11;
    doc.roundedRect(M, Y, CW, locCardH, 10).fill(WHITE);
    doc
      .roundedRect(M, Y, CW, locCardH, 10)
      .lineWidth(0.8)
      .strokeColor(BORDER)
      .stroke();
    doc.rect(M + 10, Y + 10, 3, 14).fill(PRIMARY);
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY)
      .text("LOCATION", M + 20, Y + 11);
    let ly = Y + 28;
    if (addrLine.length === 0) {
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(MUTED)
        .text("Address on file — see listing for map & directions.", M + 16, ly, {
          width: CW - 32,
        });
    } else {
      addrLine.slice(0, 4).forEach((line) => {
        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor(DARK)
          .text(line, M + 16, ly, { width: CW - 32 });
        ly += 12;
      });
    }
    Y += locCardH + 12;

    const specItems = [];
    if (p.facilities?.bedrooms > 0)
      specItems.push({ label: "CONFIG", value: `${p.facilities.bedrooms} BHK` });
    if (p.facilities?.bathrooms > 0)
      specItems.push({ label: "BATH", value: String(p.facilities.bathrooms) });
    if (p.area?.value > 0)
      specItems.push({
        label: "AREA",
        value: `${p.area.value} ${p.area.unit || "sqft"}`,
      });
    if (p.facilities?.parkings > 0)
      specItems.push({ label: "PARKING", value: String(p.facilities.parkings) });
    if (p.floor != null && String(p.floor) !== "")
      specItems.push({
        label: "FLOOR",
        value:
          p.facilities?.totalFloors != null
            ? `${p.floor} of ${p.facilities.totalFloors}`
            : String(p.floor),
      });
    if (p.facilities?.balconies > 0)
      specItems.push({ label: "BALCONY", value: String(p.facilities.balconies) });
    if (p.ageOfProperty != null && p.ageOfProperty !== "")
      specItems.push({ label: "AGE", value: `${p.ageOfProperty} yrs` });
    if (p.facing && String(p.facing).trim())
      specItems.push({ label: "FACING", value: String(p.facing) });
    if (p.availability)
      specItems.push({ label: "POSSESSION", value: String(p.availability) });
    if (p.furnishing && p.furnishing !== "N/A")
      specItems.push({ label: "FURNISH", value: String(p.furnishing) });
    if (p.listingAvailability)
      specItems.push({ label: "LISTING", value: String(p.listingAvailability) });

    const specCount = Math.max(specItems.length, 1);
    const specGap = 5;
    const specW = (CW - specGap * (specCount - 1)) / specCount;
    const specH = 46;
    specItems.forEach((s, idx) => {
      const sx = M + idx * (specW + specGap);
      doc.roundedRect(sx, Y, specW, specH, 8).fill(WHITE);
      doc
        .roundedRect(sx, Y, specW, specH, 8)
        .lineWidth(0.55)
        .strokeColor(BORDER)
        .stroke();
      doc.rect(sx, Y, specW, 3).fill(PRIMARY);
      doc
        .fontSize(6)
        .font("Helvetica-Bold")
        .fillColor(LIGHT)
        .text(s.label, sx + 4, Y + 10, { width: specW - 8, align: "center" });
      doc
        .fontSize(9.5)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(s.value, sx + 4, Y + 24, { width: specW - 8, align: "center" });
    });
    Y += specH + 14;

    doc.rect(M, Y, 3, 14).fill(PRIMARY);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_DEEP)
      .text("SUMMARY", M + 10, Y + 1);
    Y += 20;

    const previewLen = 320;
    const needsSecondPage = (p.description || "").length > previewLen;
    const previewText = needsSecondPage
      ? truncate(p.description, previewLen).trim() + " …"
      : p.description;

    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor(MUTED)
      .text(previewText, M, Y, {
        width: CW,
        align: "justify",
        lineGap: 2.5,
      });
    Y = doc.y + 8;
    if (needsSecondPage) {
      doc
        .fontSize(7.5)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text("Full description & specifications on page 2 →", M, Y);
      Y += 14;
    } else {
      Y += 6;
    }

    doc.addPage();
    fillPageCanvas(doc, W, H, PRIMARY);
    doc.rect(0, 0, W, 42).fill(PRIMARY_SOFT);
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .fillColor(PRIMARY_DEEP)
      .text("Details & specifications", M, 16);
    doc
      .fontSize(7.5)
      .font("Helvetica")
      .fillColor(LIGHT)
      .text(truncate(p.title, 70) + "  ·  REF " + refShort, M, 29, { width: CW });

    let y2 = 52;

    const sectionTitle = (label) => {
      doc.rect(M, y2, 3, 13).fill(PRIMARY);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY_DEEP)
        .text(label, M + 10, y2 + 1);
      y2 += 22;
    };

    const ensureSpace = (h) => {
      if (y2 + h > CONTENT_BOTTOM) {
        doc.addPage();
        fillPageCanvas(doc, W, H, PRIMARY);
        y2 = 48;
      }
    };

    if ((p.description || "").length > 0) {
      ensureSpace(120);
      sectionTitle("About this property");
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(MUTED)
        .text(p.description, M, y2, {
          width: CW,
          align: "justify",
          lineGap: 2.5,
        });
      y2 = doc.y + 16;
    }

    const detailRows = [];
    detailRows.push({ label: "Listing ID", value: refFull });
    detailRows.push({ label: "Deal type", value: p.deal });
    detailRows.push({ label: "Property type", value: p.type });
    if (p.propertyCategory) detailRows.push({ label: "Category", value: p.propertyCategory });
    if (p.status) detailRows.push({ label: "Status", value: p.status });
    if (p.postedBy) detailRows.push({ label: "Posted by", value: p.postedBy });
    if (p.preferredContact)
      detailRows.push({ label: "Preferred contact", value: p.preferredContact });
    if (p.contactNumber?.length)
      detailRows.push({
        label: "Contact nos.",
        value: p.contactNumber.slice(0, 4).join(", "),
      });

    if (p.deal === "Rent") {
      const mc = formatINR(p.maintenanceCharge);
      if (mc) detailRows.push({ label: "Maintenance (mo.)", value: mc });
      const sd = formatINR(p.securityDeposit);
      if (sd) detailRows.push({ label: "Security deposit", value: sd });
      if (p.lockInMonths != null && p.lockInMonths !== "")
        detailRows.push({ label: "Lock-in", value: `${p.lockInMonths} months` });
      if (p.noticePeriodDays != null && p.noticePeriodDays !== "")
        detailRows.push({
          label: "Notice period",
          value: `${p.noticePeriodDays} days`,
        });
    }

    if (p.projectName)
      detailRows.push({ label: "Project / society", value: p.projectName });
    if (p.builderName) detailRows.push({ label: "Builder / developer", value: p.builderName });
    if (p.totalUnits != null && p.totalUnits !== "")
      detailRows.push({ label: "Units in project", value: String(p.totalUnits) });
    if (p.facilities?.parkingType && p.facilities.parkingType !== "None")
      detailRows.push({ label: "Parking type", value: p.facilities.parkingType });
    if (p.facilities?.waterSupply)
      detailRows.push({ label: "Water supply", value: p.facilities.waterSupply });
    if (p.facilities?.powerBackup === true)
      detailRows.push({ label: "Power backup", value: "Yes" });
    if (p.facilities?.servantRooms > 0)
      detailRows.push({ label: "Servant rooms", value: String(p.facilities.servantRooms) });
    if (p.facilities?.securityFeatures?.length)
      detailRows.push({
        label: "Security",
        value: p.facilities.securityFeatures.join(", "),
      });

    if (p.type === "Commercial") {
      if (p.commercialPropertyTypes?.length)
        detailRows.push({
          label: "Commercial use",
          value: p.commercialPropertyTypes.join(", "),
        });
      if (p.investmentOptions?.length)
        detailRows.push({
          label: "Investment options",
          value: p.investmentOptions.join(", "),
        });
    }

    if (p.ownershipType)
      detailRows.push({ label: "Ownership", value: p.ownershipType });
    if (p.reraNumber)
      detailRows.push({ label: "RERA registration", value: p.reraNumber });
    if (p.ocStatus) detailRows.push({ label: "OC status", value: p.ocStatus });
    if (p.videoUrl)
      detailRows.push({ label: "Video tour", value: truncate(p.videoUrl, 60) });
    if (p.virtualTourUrl)
      detailRows.push({
        label: "Virtual tour",
        value: truncate(p.virtualTourUrl, 60),
      });

    ensureSpace(36);
    sectionTitle("Key facts");
    const colW = (CW - 12) / 2;
    const rowH = 28;
    const filteredRows = detailRows.filter((r) => r.value != null && String(r.value).trim());
    for (let i = 0; i < filteredRows.length; i++) {
      if (i > 0 && i % 2 === 0) y2 += rowH;
      ensureSpace(rowH + 4);
      const col = i % 2;
      const dx = M + col * (colW + 12);
      const row = filteredRows[i];
      doc.roundedRect(dx, y2, colW, rowH - 2, 6).fill(WHITE);
      doc
        .roundedRect(dx, y2, colW, rowH - 2, 6)
        .lineWidth(0.45)
        .strokeColor(BORDER)
        .stroke();
      doc
        .fontSize(6.5)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text(row.label, dx + 8, y2 + 5, { width: colW - 14 });
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(String(row.value), dx + 8, y2 + 14, { width: colW - 14 });
    }
    if (filteredRows.length) y2 += rowH;
    y2 += 8;

    const amenityList = uniqueStrings([...p.societyAmenities, ...p.amenities]);
    if (amenityList.length) {
      ensureSpace(80);
      sectionTitle("Amenities & highlights");
      let ax = M;
      const chipH = 20;
      amenityList.slice(0, 24).forEach((label) => {
        const tw = Math.min(doc.widthOfString(label) + 20, CW - 20);
        if (ax + tw > M + CW) {
          ax = M;
          y2 += chipH + 5;
          ensureSpace(chipH + 20);
        }
        doc.roundedRect(ax, y2, tw, chipH, 10).fill(PRIMARY_SOFT);
        doc
          .fontSize(7.5)
          .font("Helvetica-Bold")
          .fillColor(PRIMARY_DEEP)
          .text(label, ax + 10, y2 + 6, { width: tw - 16 });
        ax += tw + 6;
      });
      y2 += chipH + 18;
    }

    if (y2 > CONTENT_BOTTOM - 12) {
      doc.addPage();
      fillPageCanvas(doc, W, H, PRIMARY);
      y2 = 48;
    }

    const drawFooter = async () => {
      const fy = doc.page.height - FOOTER_H;
      doc.rect(0, fy, W, FOOTER_H).fill("#f8fafc");
      doc
        .moveTo(0, fy)
        .lineTo(W, fy)
        .lineWidth(0.5)
        .strokeColor("#e5e7eb")
        .stroke();

      const userImgBuf = await fetchImage(p.user?.image);
      const userName = p.user?.name;
      const phone = p.user?.phone || "";
      const email = p.user?.email || "contact@propertybulbul.com";
      const contactLine = phone ? `Ph: ${phone}     ${email}` : email;

      const profileSize = 36;
      const profileY = fy + (FOOTER_H - profileSize) / 2;
      let contactX = M;

      if (userImgBuf) {
        doc.save();
        doc
          .circle(
            M + profileSize / 2,
            profileY + profileSize / 2,
            profileSize / 2,
          )
          .clip();
        doc.image(userImgBuf, M, profileY, {
          width: profileSize,
          height: profileSize,
          fit: [profileSize, profileSize],
        });
        doc.restore();
        doc
          .circle(
            M + profileSize / 2,
            profileY + profileSize / 2,
            profileSize / 2,
          )
          .lineWidth(0.5)
          .strokeColor(BORDER)
          .stroke();
        contactX = M + profileSize + 12;
      }

      const textBaseY = profileY + 3;
      doc
        .fontSize(6.5)
        .font("Helvetica-Bold")
        .fillColor(LIGHT)
        .text("INQUIRY CONTACT", contactX, textBaseY);
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(DARK)
        .text(userName || "Authorized Agent", contactX, textBaseY + 10);
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(MUTED)
        .text(contactLine, contactX, textBaseY + 24, { width: CW * 0.52 });

      doc
        .moveTo(W * 0.62, fy + 10)
        .lineTo(W * 0.62, fy + FOOTER_H - 10)
        .lineWidth(0.5)
        .strokeColor("#e5e7eb")
        .stroke();

      const brandX = W * 0.64;
      const brandW = W - brandX - M;
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text("Official brochure · Generated " + generatedOn, brandX, fy + 12, {
          width: brandW,
          align: "right",
        });
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(PRIMARY)
        .text("propertybulbul.com", brandX, fy + 24, {
          width: brandW,
          align: "right",
        });
      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(LIGHT)
        .text("Tricity's AI-powered property search", brandX, fy + 40, {
          width: brandW,
          align: "right",
        });
    };

    await drawFooter();

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
