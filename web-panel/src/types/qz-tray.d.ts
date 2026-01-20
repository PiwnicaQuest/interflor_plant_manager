declare module 'qz-tray' {
  interface QzConfig {
    copies?: number;
    colorType?: 'color' | 'grayscale' | 'blackwhite';
    duplex?: boolean;
    orientation?: 'portrait' | 'landscape';
    margins?: { top: number; right: number; bottom: number; left: number };
    units?: string;
    scaleContent?: boolean;
  }

  interface PrintData {
    type: 'html' | 'pixel' | 'raw';
    format: 'plain' | 'html' | 'pdf' | 'image';
    data: string;
  }

  const websocket: {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    isActive: () => boolean;
  };

  const printers: {
    find: () => Promise<string[]>;
  };

  const configs: {
    create: (printer: string, options?: QzConfig) => any;
  };

  const security: {
    setCertificatePromise: (callback: (resolve: (cert: string) => void) => void) => void;
    setSignaturePromise: (callback: (toSign: string) => (resolve: (signature: string) => void) => void) => void;
  };

  function print(config: any, data: PrintData[]): Promise<void>;

  export default {
    websocket,
    printers,
    configs,
    security,
    print,
  };
}
