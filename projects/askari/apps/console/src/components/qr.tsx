import QRCode from "qrcode";

/** The QR a checkpoint's wall plate carries: its secret token as plain text. Generated on the server as inline SVG; nothing leaves the building. */
export async function Qr({ text, size = 160 }: { text: string; size?: number }) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 1, width: size, errorCorrectionLevel: "M" });
  return <div className="inline-block bg-white p-1" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
