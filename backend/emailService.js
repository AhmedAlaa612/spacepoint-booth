const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// We default to the user's previously hardcoded email for ease of migration, 
// but using environment variables is the best practice!
const emailUser = process.env.EMAIL_USER || "spacepointespcamera@gmail.com";
const emailPass = process.env.EMAIL_PASS || "qdravbjvygrtmrti";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: emailUser,
    pass: emailPass,
  },
});

// ====== Helpers ======
function safeReadAsset(relativePath) {
  const p = path.join(__dirname, "assets", relativePath);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing asset file: ${p}`);
  }
  return fs.readFileSync(p);
}

function stripDataUrlPrefix(b64) {
  // If ESP or any client sends "data:image/jpeg;base64,..."
  return String(b64).replace(/^data:image\/\w+;base64,/, "");
}

async function sendPhotoEmail(email, imageBase64, requestId) {
  const photoId = requestId || `req_${Date.now()}`;

  // Read logos (CID inline)
  const spacepointLogoBuf = safeReadAsset("spacepoint-logo.png");
  const sefLogoBuf = safeReadAsset("sef-logo.png");

  // Decode photo
  const cleanB64 = stripDataUrlPrefix(imageBase64);
  const imageBuffer = Buffer.from(cleanB64, "base64");

  // CIDs
  const cidSpacepoint = "spacepoint-logo";
  const cidSef = "sef-logo";
  const cidPhoto = `cubesat-photo-${photoId}`;

  // Professional HTML template (Gmail-safe)
  const nowText = new Date().toLocaleString("en-AE", { timeZone: "Asia/Dubai" });

  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    
    <!-- Header -->
    <div style="background:#ffffff;border-radius:14px;padding:18px 20px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <img src="cid:${cidSpacepoint}" alt="SpacePoint" style="height:42px;display:block;" />
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <img src="cid:${cidSef}" alt="Sharjah Entrepreneurship Festival" style="height:42px;display:block;" />
          </td>
        </tr>
      </table>

      <div style="margin-top:14px;">
        <div style="font-size:20px;font-weight:700;color:#0b1b3a;line-height:1.3;">
          Your CubeSat Photo
        </div>
        <div style="margin-top:6px;font-size:14px;color:#5a6b85;line-height:1.5;">
          Thanks for visiting the SpacePoint Camera experience. Here’s your captured photo.
        </div>
      </div>
    </div>

    <!-- Photo Card -->
    <div style="margin-top:16px;background:#ffffff;border-radius:14px;padding:18px 20px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
      <div style="font-size:14px;color:#0b1b3a;font-weight:700;margin-bottom:10px;">
        Photo Preview
      </div>

      <div style="text-align:center;">
        <img src="cid:${cidPhoto}" alt="CubeSat Photo"
          style="max-width:100%;border-radius:12px;border:1px solid #e6ecf5;display:block;margin:0 auto;" />
      </div>

      <div style="margin-top:12px;font-size:12px;color:#6a7b96;line-height:1.6;">
        <div><strong>Captured:</strong> ${nowText} (Dubai time)</div>
        <div><strong>Reference ID:</strong> ${photoId}</div>
      </div>
    </div>

    <!-- CTA Button -->
    <div style="margin-top:24px;text-align:center;">
      <div style="margin-bottom:12px;font-size:15px;color:#0b1b3a;font-weight:600;">
        Don't forget to visit our website!
      </div>
      <a href="https://www.spacepoint.ae" target="_blank" style="display:inline-block;background-color:#6b21a8;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 28px;border-radius:8px;box-shadow:0 4px 6px rgba(107, 33, 168, 0.2);">
        Visit spacepoint.ae
      </a>
    </div>

    <!-- Footer -->
    <div style="margin-top:14px;text-align:center;color:#7c8aa3;font-size:12px;line-height:1.6;">
      If you have any issues viewing the image, download the attached photo from this email.
      <br />
      © ${new Date().getFullYear()} SpacePoint
    </div>

  </div>
</body>
</html>
  `;

  const mailOptions = {
    from: "SpacePoint Camera <testmail@gmail.com>",
    to: email,
    subject: "Your CubeSat Photo — SpacePoint × SEF",
    html,
    text: `Your CubeSat photo is attached. Reference: ${photoId}`,
    attachments: [
      {
        filename: "spacepoint-logo.png",
        content: spacepointLogoBuf,
        contentType: "image/png",
        cid: cidSpacepoint,
      },
      {
        filename: "sef-logo.png",
        content: sefLogoBuf,
        contentType: "image/png",
        cid: cidSef,
      },
      {
        filename: `cubesat_${photoId}.jpg`,
        content: imageBuffer,
        contentType: "image/jpeg",
        cid: cidPhoto,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  return { success: true, requestId: photoId };
}

module.exports = { sendPhotoEmail };
