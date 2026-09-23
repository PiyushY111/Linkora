import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import QRCodeStyling from 'qr-code-styling';
import { Sparkles, QrCode as QrIcon } from 'lucide-react';
import { DEFAULT_QR_CONFIG } from '../../utils/qrPresets';

const QRCodeViewer = forwardRef(function QRCodeViewer(
  {
    data = 'https://linkora.io',
    config = DEFAULT_QR_CONFIG,
    size = 260,
    showFrame = true,
    lightBackdrop = false,
    className = '',
  },
  ref
) {
  const containerRef = useRef(null);
  const qrCodeRef = useRef(null);

  // Compute qr-code-styling options from config
  const getOptions = (targetSize = size) => {
    const dotsOptions = {
      type: config.dotsType || 'rounded',
      color: config.dotsColor || '#C6FF3D',
    };

    if (config.gradient?.enabled) {
      dotsOptions.gradient = {
        type: config.gradient.type || 'linear',
        rotation: (config.gradient.rotation || 45) * (Math.PI / 180),
        colorStops: [
          { offset: 0, color: config.gradient.color1 || '#C6FF3D' },
          { offset: 1, color: config.gradient.color2 || '#06B6D4' },
        ],
      };
    }

    return {
      width: targetSize,
      height: targetSize,
      type: 'canvas',
      data: data || 'https://linkora.io',
      margin: 8,
      qrOptions: {
        typeNumber: 0,
        mode: 'Byte',
        errorCorrectionLevel: config.logo ? 'H' : 'Q',
      },
      image: config.logo || undefined,
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: config.logoSize ?? 0.35,
        margin: config.logoMargin ?? 6,
        crossOrigin: 'anonymous',
      },
      dotsOptions,
      cornersSquareOptions: {
        type: config.cornersSquareType || 'extra-rounded',
        color: config.cornersSquareColor || config.dotsColor || '#C6FF3D',
      },
      cornersDotOptions: {
        type: config.cornersDotType || 'dot',
        color: config.cornersDotColor || config.dotsColor || '#C6FF3D',
      },
      backgroundOptions: {
        color: config.isTransparent ? 'transparent' : config.bgColor || '#0A0A0B',
      },
    };
  };

  // Initialize or update QR instance
  useEffect(() => {
    if (!containerRef.current) return;

    const options = getOptions(size);

    if (!qrCodeRef.current) {
      qrCodeRef.current = new QRCodeStyling(options);
      containerRef.current.innerHTML = '';
      qrCodeRef.current.append(containerRef.current);
    } else {
      qrCodeRef.current.update(options);
    }
  }, [data, config, size]);

  // Expose export helpers through ref
  useImperativeHandle(ref, () => ({
    download: async (filename = 'linkora-qr', extension = 'png', exportSize = 1024) => {
      // Create high-res instance for export
      const exportOptions = getOptions(exportSize);
      const exporter = new QRCodeStyling(exportOptions);
      await exporter.download({
        name: filename,
        extension: extension === 'svg' ? 'svg' : 'png',
      });
    },

    getRawBlob: async (extension = 'png', exportSize = 1024) => {
      const exportOptions = getOptions(exportSize);
      const exporter = new QRCodeStyling(exportOptions);
      return await exporter.getRawData(extension === 'svg' ? 'svg' : 'png');
    },

    getDataUrl: async (exportSize = 512) => {
      const exportOptions = getOptions(exportSize);
      const exporter = new QRCodeStyling(exportOptions);
      const blob = await exporter.getRawData('png');
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    },
  }));

  const frameType = showFrame ? config.frame?.type || 'none' : 'none';
  const frameText = config.frame?.text || 'SCAN ME';
  const frameSubtext = config.frame?.subtext || '';
  const frameColor = config.frame?.color || '#C6FF3D';
  const frameTextColor = config.frame?.textColor || '#0A0A0B';

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center transition-colors duration-200 ${
        lightBackdrop ? 'bg-white text-zinc-900' : 'bg-transparent text-paper-100'
      } ${className}`}
    >
      {/* Top Header Frame */}
      {frameType === 'top-header' && (
        <div
          className="mb-3 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-lg transition-transform hover:scale-105"
          style={{ backgroundColor: frameColor, color: frameTextColor }}
        >
          <Sparkles size={13} />
          <span>{frameText}</span>
        </div>
      )}

      {/* Cyber Frame Wrapper */}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-2xl transition-all ${
          frameType === 'cyber'
            ? 'p-3 shadow-2xl ring-2'
            : frameType === 'card'
            ? 'border border-ink-600 bg-ink-900/90 p-4 shadow-panel'
            : 'p-1'
        }`}
        style={
          frameType === 'cyber'
            ? {
                borderColor: frameColor,
                boxShadow: `0 0 25px ${frameColor}33`,
                background: config.bgColor || '#0A0A0B',
              }
            : {}
        }
      >
        {/* QR Canvas Container */}
        <div
          ref={containerRef}
          className="flex items-center justify-center overflow-hidden rounded-xl"
          style={{ width: size, height: size }}
        />
      </div>

      {/* Bottom Pill Frame */}
      {frameType === 'bottom-pill' && (
        <div
          className="mt-3 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider shadow-lg transition-transform hover:scale-105"
          style={{ backgroundColor: frameColor, color: frameTextColor }}
        >
          <QrIcon size={13} />
          <span>{frameText}</span>
        </div>
      )}

      {/* Card Footer */}
      {frameType === 'card' && (
        <div className="mt-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-paper-200">{frameText}</p>
          {frameSubtext && <p className="mt-0.5 text-[11px] text-paper-500">{frameSubtext}</p>}
        </div>
      )}

      {/* Cyber Label */}
      {frameType === 'cyber' && (
        <div className="mt-2.5 flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-paper-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: frameColor }} />
          <span>{frameText}</span>
        </div>
      )}
    </div>
  );
});

export default QRCodeViewer;
