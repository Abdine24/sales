import React, { useMemo } from 'react';
import { encodeCode128 } from '../utils/barcode';

interface BarcodeRendererProps {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}

export const BarcodeRenderer: React.FC<BarcodeRendererProps> = ({
  value,
  height = 40,
  showText = true,
  className = '',
}) => {
  const pattern = useMemo(() => {
    return encodeCode128(value || '000000');
  }, [value]);

  const totalModules = useMemo(() => {
    return pattern.split('').reduce((sum, char) => sum + parseInt(char, 10), 0);
  }, [pattern]);

  return (
    <div className={`flex flex-col items-center select-none w-full max-w-[190px] mx-auto ${className}`}>
      <svg
        viewBox={`0 0 ${totalModules} ${height}`}
        className="w-full h-8 object-contain"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {(() => {
          let currentX = 0;
          let isBar = true;
          const rects: React.ReactNode[] = [];

          for (let i = 0; i < pattern.length; i++) {
            const moduleCount = parseInt(pattern[i], 10);

            if (isBar) {
              rects.push(
                <rect
                  key={i}
                  x={currentX}
                  y={0}
                  width={moduleCount}
                  height={height}
                  fill="currentColor"
                />
              );
            }
            currentX += moduleCount;
            isBar = !isBar;
          }
          return rects;
        })()}
      </svg>
      {showText && (
        <span className="text-[10px] font-mono tracking-widest text-slate-900 font-extrabold mt-0.5 truncate max-w-full text-center">
          {value || '000000'}
        </span>
      )}
    </div>
  );
};
