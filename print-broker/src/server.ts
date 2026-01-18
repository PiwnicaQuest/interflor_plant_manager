/**
 * PlantManager Print Broker - HTTP Server
 */

import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import { loadConfig } from "./routes/config";

// Import routes
import statusRoutes from "./routes/status";
import printersRoutes from "./routes/printers";
import printRoutes from "./routes/print";
import configRoutes from "./routes/config";

export class PrintBrokerServer {
  private app: Application;
  private port: number;
  private allowedOrigins: string[];

  constructor() {
    const config = loadConfig();
    this.port = config.port;
    this.allowedOrigins = config.allowedOrigins;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));

    // CORS - only allow trusted origins
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like curl, Postman, etc in development)
        if (!origin) {
          return callback(null, true);
        }

        if (this.allowedOrigins.some(allowed => {
          if (allowed.includes("*")) {
            const pattern = new RegExp("^" + allowed.replace(/\*/g, ".*") + "$");
            return pattern.test(origin);
          }
          return allowed === origin;
        })) {
          return callback(null, true);
        }

        console.warn(`[CORS] Blocked request from: ${origin}`);
        return callback(new Error("CORS not allowed"), false);
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString().substring(11, 19);
      console.log(`[${timestamp}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Status routes (/, /status, /health)
    this.app.use("/", statusRoutes);

    // Printer routes (/printers)
    this.app.use("/printers", printersRoutes);

    // Print routes (/print, /print/label, /print/receipt)
    this.app.use("/print", printRoutes);

    // Config routes (/config)
    this.app.use("/config", configRoutes);

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: "Endpoint not found"
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error("[Error]", err.message);
      res.status(500).json({
        success: false,
        error: err.message
      });
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Try main port first, then fallback ports
        const tryPort = (port: number, attempts: number = 0): void => {
          const server = this.app.listen(port, "127.0.0.1", () => {
            this.port = port;
            console.log(`\n${"=".repeat(50)}`);
            console.log("  PlantManager Print Broker v1.0.0");
            console.log("=".repeat(50));
            console.log(`  Status:  RUNNING`);
            console.log(`  Address: http://127.0.0.1:${port}`);
            console.log(`  Origins: ${this.allowedOrigins.join(", ")}`);
            console.log("=".repeat(50));
            console.log("\nReady to receive print jobs...\n");
            resolve();
          });

          server.on("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE" && attempts < 7) {
              console.log(`[Server] Port ${port} in use, trying ${port + 1}...`);
              tryPort(port + 1, attempts + 1);
            } else {
              reject(err);
            }
          });
        };

        tryPort(this.port);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get current port
   */
  getPort(): number {
    return this.port;
  }
}
