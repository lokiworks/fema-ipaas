import { QRCodeSVG } from 'qrcode.react';

function QrCode({ value, label }: QrCodeProps) {
  return (
    <div
      className="inline-flex rounded-lg border bg-white p-3"
      role="img"
      aria-label={label}
      data-testid="qr-code"
    >
      <QRCodeSVG value={value} size={176} level="M" />
    </div>
  );
}

export { QrCode };

type QrCodeProps = {
  value: string;
  label: string;
};
