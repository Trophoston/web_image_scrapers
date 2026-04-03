import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

function cleanUrl(baseUrl: string, url: string) {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
       throw new Error(`Failed to fetch page: ${response.statusText}`);
    }

    const finalUrl = response.url || targetUrl;
    const baseForRelative = finalUrl.endsWith('/') ? finalUrl : finalUrl + '/';

    const html = await response.text();
    const $ = cheerio.load(html);
    const imageUrls = new Set<string>();

    // 1. Traditional Cheerio DOM parsing
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) imageUrls.add(src);

      const dataSrc = $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('data-lazy-src');
      if (dataSrc) imageUrls.add(dataSrc);

      const srcset = $(el).attr('srcset') || $(el).attr('data-srcset');
      if (srcset) {
        srcset.split(',').forEach(part => {
          const u = part.trim().split(' ')[0];
          if (u) imageUrls.add(u);
        });
      }
    });

    $('[style*="background-image"]').each((_, el) => {
       const style = $(el).attr('style') || '';
       const match = style.match(/url\(['"]?([^'"()]+)['"]?\)/);
       if (match && match[1]) imageUrls.add(match[1]);
    });

    $('meta[property="og:image"], meta[name="twitter:image"]').each((_, el) => {
       const content = $(el).attr('content');
       if (content) imageUrls.add(content);
    });

    // 2. Fallback SPA / JSON / Next.js extraction (Canva support!)
    // We safely parse out strings from script tags without vulnerable regex
    const scriptText = $('script').map((_, el) => $(el).html()).get().join(' ');
    
    // Instead of regex, split script text by all quotes to find string values
    const quoteParts = scriptText.split(/["']/);
    for (let part of quoteParts) {
       part = part.trim();
       if (part.length > 5 && part.length < 1000) {
          try {
             part = part.replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))).replace(/\\\//g, '/');
          } catch(e) {}
          
          if (
             part.includes('.jpg') || part.includes('.jpeg') || 
             part.includes('.png') || part.includes('.webp') || part.includes('.gif') || part.includes('.svg') || part.includes('.avif') || part.includes('_assets/') || part.includes('/media/') || part.includes('/images/')
          ) {
             if (part.startsWith('http') || part.startsWith('/') || part.match(/^[a-zA-Z0-9_\-\.\/]+\.(?:png|jpe?g|gif|webp|svg|avif)$/i) || part.match(/^[a-zA-Z0-9_\-\.\/]+(?:_assets|\/media\/).+$/i)) {
                 imageUrls.add(part);
             }
          }
       }
    }

    const finalImages: string[] = [];

    Array.from(imageUrls).forEach(u => {
      const cleaned = cleanUrl(baseForRelative, u);
      if (cleaned && !cleaned.startsWith('data:') && !cleaned.startsWith('blob:')) {
         if (cleaned.match(/\.(woff2?|ttf|js|css|json|html|xml)$/i)) return;
         finalImages.push(cleaned);
      }
    });

    const uniqueImages = Array.from(new Set(finalImages)).filter(u => u.trim() !== '');

    return NextResponse.json({ images: uniqueImages });
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to scrape' },
      { status: 500 }
    );
  }
}
