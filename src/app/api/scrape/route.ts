import { NextResponse } from 'next/server';
import { chromium } from 'playwright';

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

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    const imageUrls = new Set<string>();

    page.on('response', response => {
      try {
        const respUrl = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (contentType.startsWith('image/') && !respUrl.startsWith('data:') && !respUrl.startsWith('blob:')) {
          imageUrls.add(respUrl);
        } else if (respUrl.match(/\.(png|jpe?g|gif|svg|webp|avif)(?:\?.*)?$/i) && !respUrl.startsWith('data:') && !respUrl.startsWith('blob:')) {
          imageUrls.add(respUrl);
        }
      } catch (e) {
        // ignore
      }
    });

    try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 10000 });
      // Scroll down repeatedly to load lazy images if any
      await page.evaluate(async () => {
         for (let i = 0; i < 5; i++) {
            window.scrollBy(0, window.innerHeight);
            await new Promise(resolve => setTimeout(resolve, 500));
         }
      });
    } catch(e) {
      console.log('Timeout or error loading, continuing with what we have.', e);
    }

    const domImages = await page.evaluate(() => {
      const urls = new Set<string>();
      
      const images = Array.from(document.querySelectorAll('img'));
      images.forEach(img => {
        if (img.src) urls.add(img.src);
        if (img.dataset?.src) urls.add(img.dataset.src);
        if (img.srcset) {
           const parts = img.srcset.split(',');
           parts.forEach(p => {
              const u = p.split(' ')[0].trim();
              if (u) urls.add(u);
           });
        }
      });

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgMatch = style.backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
        if (bgMatch && bgMatch[2] && bgMatch[2] !== 'none') {
           urls.add(bgMatch[2]);
        }
      });
      
      const scripts = Array.from(document.querySelectorAll('script'));
      scripts.forEach(script => {
         const text = script.textContent || '';
         const matches = text.match(/(?:https?:\/\/[^\s"'<>\[\]\\,]+|\/?[^\s"'<>\[\]\\,]+)\.(?:jpg|jpeg|png|gif|webp|svg|avif)/gi);
         if (matches) {
            matches.forEach(m => urls.add(m));
         }
      });

      const metas = Array.from(document.querySelectorAll('meta'));
      metas.forEach(meta => {
         if (meta.getAttribute('property') === 'og:image' || meta.getAttribute('name') === 'twitter:image') {
             const c = meta.getAttribute('content');
             if (c) urls.add(c);
         }
      });

      return Array.from(urls);
    });

    const finalBase = page.url() + (page.url().endsWith('/') ? '' : '/');
    await browser.close();

    domImages.forEach(u => {
      if (!u) return;
      let decoded = u;
      try {
         decoded = decoded.replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))).replace(/\\\//g, '/');
      } catch (e) {}

      const cleaned = cleanUrl(finalBase, decoded);
      if (cleaned && !cleaned.startsWith('data:') && !cleaned.startsWith('blob:')) {
        imageUrls.add(cleaned);
      }
    });

    const finalUrls = Array.from(imageUrls).filter(u => u.trim() !== '' && !u.startsWith('blob:'));

    return NextResponse.json({ images: finalUrls });
  } catch (error: any) {
    console.error('Scraping error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to scrape' },
      { status: 500 }
    );
  }
}
