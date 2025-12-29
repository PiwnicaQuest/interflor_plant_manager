import { Request, Response } from "express";
import axios from "axios";

// Image proxy controller - fetches external images to bypass CORS
export const imageProxyController = async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "Missing 'url' query parameter" });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // Allowed domains for security
    const allowedDomains = [
      'beeldbankfotos.royalfloraholland.com',
      'p2.1ps.nl',
      'localhost'
    ];
    
    const urlObj = new URL(url);
    if (!allowedDomains.some(d => urlObj.hostname.includes(d))) {
      return res.status(403).json({ error: "Domain not allowed" });
    }

    // Fetch the image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'PlantManager/1.0'
      }
    });

    // Set appropriate headers
    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
    
    res.send(Buffer.from(response.data));
  } catch (error: any) {
    console.error('Image proxy error:', error.message);
    res.status(500).json({ error: "Failed to fetch image" });
  }
};
